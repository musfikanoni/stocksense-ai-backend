import mongoose from "mongoose";
import Stripe from "stripe";
import dotenv from "dotenv";
import { env } from "../config/env.js";
import { Invoice, type InvoiceStatus } from "../models/Invoice.js";
import { Plan, type PlanDoc } from "../models/Plan.js";
import { User, fullName, type Billing, type UserDoc } from "../models/User.js";
import { WebhookEvent } from "../models/WebhookEvent.js";
import { AppError } from "../utils/AppError.js";

export let stripe: Stripe | null = env.stripe.secretKey ? new Stripe(env.stripe.secretKey, { maxNetworkRetries: 2, timeout: 15000 }) : null;

export const requireStripe = (): Stripe => {
  if (!stripe) {
    if (!env.stripe.secretKey) {
      dotenv.config();
      env.stripe.secretKey = process.env.STRIPE_SECRET_KEY || "";
      env.stripe.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    }
    if (env.stripe.secretKey) {
      stripe = new Stripe(env.stripe.secretKey, { maxNetworkRetries: 2, timeout: 15000 });
    }
  }
  if (!stripe) throw new AppError(503, "Payments are not set up on this server.");
  return stripe;
};

const ACTIVE = ["active", "trialing", "past_due"];
const ENDED = ["canceled", "unpaid", "incomplete_expired"];


async function priceFor(plan: PlanDoc, cycle: Billing): Promise<string> {
  const s = requireStripe();
  const amount = Math.round((cycle === "Yearly" ? plan.price * 10 : plan.price) * 100);      
  const cached = plan.stripe?.prices?.[cycle];
  if (cached && cached.amount === amount) return cached.id;

  const productId = plan.stripe?.productId ?? (await s.products.create({ name: `StockSense ${plan.name}`, metadata: { planId: String(plan._id) } })).id;
  const price = await s.prices.create({
    product: productId, currency: "usd", unit_amount: amount,
    recurring: { interval: cycle === "Yearly" ? "year" : "month" }, metadata: { planId: String(plan._id), cycle },
  });
  plan.stripe = { productId, prices: { ...plan.stripe?.prices, [cycle]: { id: price.id, amount } } };
  plan.markModified("stripe");
  await plan.save();
  return price.id;
}

export async function createCheckout(user: UserDoc, plan: PlanDoc, cycle: Billing): Promise<string> {
  const s = requireStripe();
  if (plan.price <= 0) throw new AppError(400, "The Free plan needs no payment. To go back to Free, cancel your subscription in Manage billing.");
  if (user.subscriptionStatus && ACTIVE.includes(user.subscriptionStatus)) throw new AppError(409, "You already have a subscription. Use Manage billing to change or cancel it.");

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    customerId = (await s.customers.create({ email: user.email, name: fullName(user), metadata: { userId: String(user.id) } })).id;
    user.stripeCustomerId = customerId;
    await user.save();
  }
  const meta = { userId: String(user.id), planId: String(plan._id), cycle };
  const session = await s.checkout.sessions.create({
    mode: "subscription", customer: customerId, client_reference_id: String(user.id),
    line_items: [{ price: await priceFor(plan, cycle), quantity: 1 }],
    success_url: `${env.clientUrl}/subscription?checkout=success`, cancel_url: `${env.clientUrl}/subscription?checkout=cancelled`,
    metadata: meta, subscription_data: { metadata: meta },
  });
  if (!session.url) throw new AppError(502, "Could not start the checkout. Try again.");
  return session.url;
}


export async function createPortal(user: UserDoc): Promise<string> {
  const s = requireStripe();
  if (!user.stripeCustomerId) {
    try {
      const customer = await s.customers.create({
        email: user.email,
        name: fullName(user),
        metadata: { userId: String(user.id) },
      });
      user.stripeCustomerId = customer.id;
      await user.save();
    } catch {
      throw new AppError(400, "Could not create billing customer profile.");
    }
  }

  try {
    const session = await s.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${env.clientUrl}/settings`,
    });
    return session.url;
  } catch (err: unknown) {
    const stripeErr = err as { message?: string; code?: string };
    if (
      stripeErr.message?.includes("No customer portal configuration exists") ||
      stripeErr.code === "resource_missing"
    ) {
      throw new AppError(
        503,
        "Stripe Customer Portal is not activated yet in your Stripe dashboard. Please enable it in Stripe under Settings > Customer Portal."
      );
    }
    throw new AppError(500, stripeErr.message || "Failed to launch billing portal.");
  }
}


export type StripeApi = Pick<Stripe, "invoices" | "subscriptions">;
type CustomerRef = string | Stripe.Customer | Stripe.DeletedCustomer | null;
const customerId = (c: CustomerRef): string | undefined => (typeof c === "string" ? c : c?.id);

async function planById(id: string | undefined): Promise<PlanDoc | null> {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  return Plan.findById(id);
}


async function applySubscription(user: UserDoc, sub: Stripe.Subscription): Promise<void> {
  user.stripeSubscriptionId = sub.id;
  user.subscriptionStatus = sub.status;
  user.cancelAtPeriodEnd = sub.cancel_at_period_end;
  user.currentPeriodEnd = new Date(sub.current_period_end * 1000);
  if (ACTIVE.includes(sub.status)) {
    let plan = await planById(sub.metadata?.planId);
    if (!plan && sub.items?.data?.[0]?.price?.metadata?.planId) {
      plan = await planById(sub.items.data[0].price.metadata.planId);
    }
    if (!plan) {
      plan = await Plan.findOne({ price: { $gt: 0 } });
    }
    if (plan) user.planName = plan.name;
    user.billingCycle = sub.items?.data?.[0]?.price?.recurring?.interval === "year" ? "Yearly" : "Monthly";
  } else if (ENDED.includes(sub.status)) {
    user.planName = "Free";
    user.billingCycle = undefined;
    user.stripeSubscriptionId = undefined;
    user.currentPeriodEnd = undefined;
    user.cancelAtPeriodEnd = false;
  }
  await user.save();
}

export async function syncUserSubscription(user: UserDoc): Promise<void> {
  if (!user.stripeCustomerId) return;
  try {
    const s = requireStripe();
    if (!s) return;
    const subs = await s.subscriptions.list({
      customer: user.stripeCustomerId,
      status: "all",
      limit: 1,
    });
    if (subs.data.length > 0) {
      const sub = subs.data[0];
      await applySubscription(user, sub);
    }

    const invoices = await s.invoices.list({
      customer: user.stripeCustomerId,
      limit: 10,
    });
    for (const inv of invoices.data) {
      const status: InvoiceStatus = inv.status === "paid" ? "Paid" : inv.status === "open" ? "Pending" : "Failed";
      await recordInvoice(inv, user, status);
    }
  } catch {
    // Ignore stripe sync errors if network drops
  }
}

async function recordInvoice(inv: Stripe.Invoice, user: UserDoc, status: InvoiceStatus): Promise<void> {
  const billing: Billing = inv.lines?.data?.[0]?.price?.recurring?.interval === "year" ? "Yearly" : (user.billingCycle ?? "Monthly");
  const subObj = typeof inv.subscription === "object" ? inv.subscription : null;
  let planName = user.planName && user.planName !== "Free" ? user.planName : "Premium";
  if (subObj?.metadata?.planId) {
    const p = await planById(subObj.metadata.planId);
    if (p) planName = p.name;
  }
  const paidAt = status === "Paid" ? inv.status_transitions?.paid_at : null;
  const fields = {
    user: user._id, tx: inv.id as string, stripeInvoiceId: inv.id as string, hostedUrl: inv.hosted_invoice_url ?? undefined,
    planName, billing, planLabel: `${planName} (${billing})`, amount: (status === "Paid" ? inv.amount_paid : inv.amount_due) / 100,
    status, date: new Date((paidAt ?? inv.created) * 1000),
  };
  const existing = await Invoice.findOne({ stripeInvoiceId: inv.id });
  if (existing) { existing.set(fields); await existing.save(); } else await Invoice.create(fields);
}

export async function processEvent(event: Stripe.Event, api: StripeApi): Promise<"processed" | "duplicate"> {
  if (await WebhookEvent.exists({ eventId: event.id })) return "duplicate";

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription") break;
      const userId = session.client_reference_id ?? session.metadata?.userId;
      const user = userId && mongoose.isValidObjectId(userId) ? await User.findById(userId) : null;
      if (!user) break;
      const cust = customerId(session.customer);
      if (cust) user.stripeCustomerId = cust;
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (subId) await applySubscription(user, await api.subscriptions.retrieve(subId));
      else await user.save();
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = await api.subscriptions.retrieve(event.data.object.id);      // fresh copy, in the shape our library version expects
      const user = await User.findOne({ stripeCustomerId: customerId(sub.customer) });
      if (user) await applySubscription(user, sub);
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const inv = await api.invoices.retrieve(event.data.object.id as string, { expand: ["subscription"] });
      const user = await User.findOne({ stripeCustomerId: customerId(inv.customer) });
      if (!user) break;
      await recordInvoice(inv, user, event.type === "invoice.paid" ? "Paid" : "Failed");
      if (event.type === "invoice.paid" && typeof inv.subscription === "object" && inv.subscription) await applySubscription(user, inv.subscription);
      break;
    }
    default:
      break;   
  }
  await WebhookEvent.create({ eventId: event.id, type: event.type }).catch(() => undefined);
  return "processed";
}
