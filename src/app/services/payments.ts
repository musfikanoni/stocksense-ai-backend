import mongoose from "mongoose";
import Stripe from "stripe";
import { env } from "../config/env.js";
import { Invoice, type InvoiceStatus } from "../models/Invoice.js";
import { Plan, type PlanDoc } from "../models/Plan.js";
import { User, fullName, type Billing, type UserDoc } from "../models/User.js";
import { WebhookEvent } from "../models/WebhookEvent.js";
import { AppError } from "../utils/appError.js";

export const stripe: Stripe | null = env.stripe.secretKey
  ? new Stripe(env.stripe.secretKey, { maxNetworkRetries: 2, timeout: 15000 })
  : null;

export const requireStripe = (): Stripe => {
  if (!stripe)
    throw new AppError(503, "Payments are not set up on this server.");
  return stripe;
};

const ACTIVE = ["active", "trialing", "past_due"];
const ENDED = ["canceled", "unpaid", "incomplete_expired"];

// ---------------------------------------------------------------- creating a checkout

// One Stripe price per plan and billing cycle. If an admin changes the plan price, a new price is created.
async function priceFor(plan: PlanDoc, cycle: Billing): Promise<string> {
  const s = requireStripe();
  const amount = Math.round(
    (cycle === "Yearly" ? plan.price * 10 : plan.price) * 100,
  ); // yearly = 10 months, in cents
  const cached = plan.stripe?.prices?.[cycle];
  if (cached && cached.amount === amount) return cached.id;

  const productId =
    plan.stripe?.productId ??
    (
      await s.products.create({
        name: `StockSense ${plan.name}`,
        metadata: { planId: String(plan._id) },
      })
    ).id;
  const price = await s.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: amount,
    recurring: { interval: cycle === "Yearly" ? "year" : "month" },
    metadata: { planId: String(plan._id), cycle },
  });
  plan.stripe = {
    productId,
    prices: { ...plan.stripe?.prices, [cycle]: { id: price.id, amount } },
  };
  plan.markModified("stripe");
  await plan.save();
  return price.id;
}

export async function createCheckout(
  user: UserDoc,
  plan: PlanDoc,
  cycle: Billing,
): Promise<string> {
  const s = requireStripe();
  if (plan.price <= 0)
    throw new AppError(
      400,
      "The Free plan needs no payment. To go back to Free, cancel your subscription in Manage billing.",
    );
  if (user.subscriptionStatus && ACTIVE.includes(user.subscriptionStatus))
    throw new AppError(
      409,
      "You already have a subscription. Use Manage billing to change or cancel it.",
    );

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    customerId = (
      await s.customers.create({
        email: user.email,
        name: fullName(user),
        metadata: { userId: String(user.id) },
      })
    ).id;
    user.stripeCustomerId = customerId;
    await user.save();
  }
  const meta = { userId: String(user.id), planId: String(plan._id), cycle };
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: String(user.id),
    line_items: [{ price: await priceFor(plan, cycle), quantity: 1 }],
    success_url: `${env.clientUrl}/subscription?checkout=success`,
    cancel_url: `${env.clientUrl}/subscription?checkout=cancelled`,
    metadata: meta,
    subscription_data: { metadata: meta },
  });
  if (!session.url)
    throw new AppError(502, "Could not start the checkout. Try again.");
  return session.url;
}

// Stripe's hosted page where the customer updates the card, changes plan or cancels
export async function createPortal(user: UserDoc): Promise<string> {
  const s = requireStripe();
  if (!user.stripeCustomerId)
    throw new AppError(
      400,
      "You have no billing account yet. Subscribe to a plan first.",
    );
  const session = await s.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${env.clientUrl}/subscription`,
  });
  return session.url;
}

// ---------------------------------------------------------------- reacting to Stripe events (webhook)

export type StripeApi = Pick<Stripe, "invoices" | "subscriptions">;
type CustomerRef = string | Stripe.Customer | Stripe.DeletedCustomer | null;
const customerId = (c: CustomerRef): string | undefined =>
  typeof c === "string" ? c : c?.id;

async function planById(id: string | undefined): Promise<PlanDoc | null> {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  return Plan.findById(id);
}

// Copies the state of a Stripe subscription onto our user. Safe to run many times.
async function applySubscription(
  user: UserDoc,
  sub: Stripe.Subscription,
): Promise<void> {
  user.stripeSubscriptionId = sub.id;
  user.subscriptionStatus = sub.status;
  user.cancelAtPeriodEnd = sub.cancel_at_period_end;
  user.currentPeriodEnd = new Date(sub.current_period_end * 1000);
  if (ACTIVE.includes(sub.status)) {
    const plan = await planById(sub.metadata?.planId);
    if (plan) user.planName = plan.name;
    user.billingCycle =
      sub.items.data[0]?.price.recurring?.interval === "year"
        ? "Yearly"
        : "Monthly";
  } else if (ENDED.includes(sub.status)) {
    user.planName = "Free";
    user.billingCycle = undefined;
    user.stripeSubscriptionId = undefined;
    user.currentPeriodEnd = undefined;
    user.cancelAtPeriodEnd = false;
  }
  await user.save();
}

async function recordInvoice(
  inv: Stripe.Invoice,
  user: UserDoc,
  status: InvoiceStatus,
): Promise<void> {
  const billing: Billing =
    inv.lines.data[0]?.price?.recurring?.interval === "year"
      ? "Yearly"
      : "Monthly";
  const subObj = typeof inv.subscription === "object" ? inv.subscription : null;
  const planName =
    (await planById(subObj?.metadata?.planId))?.name ?? user.planName;
  const paidAt = status === "Paid" ? inv.status_transitions?.paid_at : null;
  const fields = {
    user: user._id,
    tx: inv.id as string,
    stripeInvoiceId: inv.id as string,
    hostedUrl: inv.hosted_invoice_url ?? undefined,
    planName,
    billing,
    planLabel: `${planName} (${billing})`,
    amount: (status === "Paid" ? inv.amount_paid : inv.amount_due) / 100,
    status,
    date: new Date((paidAt ?? inv.created) * 1000),
  };
  const existing = await Invoice.findOne({ stripeInvoiceId: inv.id });
  if (existing) {
    existing.set(fields);
    await existing.save();
  } else await Invoice.create(fields);
}

export async function processEvent(
  event: Stripe.Event,
  api: StripeApi,
): Promise<"processed" | "duplicate"> {
  if (await WebhookEvent.exists({ eventId: event.id })) return "duplicate";

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription") break;
      const userId = session.client_reference_id ?? session.metadata?.userId;
      const user =
        userId && mongoose.isValidObjectId(userId)
          ? await User.findById(userId)
          : null;
      if (!user) break;
      const cust = customerId(session.customer);
      if (cust) user.stripeCustomerId = cust;
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
      if (subId)
        await applySubscription(user, await api.subscriptions.retrieve(subId));
      else await user.save();
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = await api.subscriptions.retrieve(event.data.object.id); // fresh copy, in the shape our library version expects
      const user = await User.findOne({
        stripeCustomerId: customerId(sub.customer),
      });
      if (user) await applySubscription(user, sub);
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const inv = await api.invoices.retrieve(event.data.object.id as string, {
        expand: ["subscription"],
      });
      const user = await User.findOne({
        stripeCustomerId: customerId(inv.customer),
      });
      if (!user) break;
      await recordInvoice(
        inv,
        user,
        event.type === "invoice.paid" ? "Paid" : "Failed",
      );
      if (
        event.type === "invoice.paid" &&
        typeof inv.subscription === "object" &&
        inv.subscription
      )
        await applySubscription(user, inv.subscription);
      break;
    }
    default:
      break; // events we do not need
  }
  await WebhookEvent.create({ eventId: event.id, type: event.type }).catch(
    () => undefined,
  );
  return "processed";
}
