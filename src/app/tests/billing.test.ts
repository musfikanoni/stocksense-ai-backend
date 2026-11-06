// Stripe payment flow. Stripe's network calls are replaced with fakes, everything else is real:
// the webhook signature check, the database and the HTTP routes.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import Stripe from "stripe";
import { boot, skipDb } from "./helpers.js";

const SECRET = "whsec_test_secret_for_tests";

describe("Stripe payments", { skip: skipDb && "set TEST_MONGODB_URI to run database tests" }, () => {
  let t: Awaited<ReturnType<typeof boot>>;
  let stripe: any;
  let Plan: any, Stock: any;
  const SYMBOLS = ["ZZA", "ZZB", "ZZC", "ZZD", "ZZE", "ZZF", "ZZG"];
  let plan: any, freePlan: any;
  const calls = { retrieveSub: 0, prices: 0, products: 0, customers: 0 };
  const FUTURE = Math.floor(Date.now() / 1000) + 30 * 86400;
  const signer = new Stripe("sk_test_unused");
  let evt = 0;

  const sub = (customer: string, over: Record<string, unknown> = {}) => ({
    id: "sub_test_1", status: "active", cancel_at_period_end: false, current_period_end: FUTURE, customer,
    metadata: { planId: String(plan._id), cycle: "Monthly" }, items: { data: [{ price: { recurring: { interval: "month" } } }] }, ...over,
  });
  const send = (type: string, object: Record<string, unknown>, opts: { id?: string; secret?: string; unsigned?: boolean } = {}) => {
    const payload = JSON.stringify({ id: opts.id ?? `evt_test_${Date.now()}_${evt++}`, object: "event", type, data: { object } });
    const headers: Record<string, string> = opts.unsigned ? {} : { "stripe-signature": signer.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? SECRET }), "Content-Type": "application/json" };
    return t.call("POST", "/billing/webhook", { rawBody: payload, headers });
  };

  before(async () => {
    t = await boot({ STRIPE_SECRET_KEY: "sk_test_fake_key_for_tests", STRIPE_WEBHOOK_SECRET: SECRET });
    ({ stripe } = await import("../services/payments.js"));
    ({ Plan } = await import("../models/Plan.js"));
    ({ Stock } = await import("../models/Stock.js"));
    const { makeCloses } = await import("./fixtures.js");
    for (const sym of SYMBOLS) await Stock.updateOne({ symbol: sym }, { $set: { name: `Test ${sym}`, kind: "stock", exchange: "NASDAQ", ...makeCloses(40) } }, { upsert: true });
    const tag = Date.now();
    plan = await Plan.create({ name: `TestPlan${tag}`, price: 12, features: ["x"] });
    freePlan = await Plan.create({ name: `TestFree${tag}`, price: 0, features: [] });
    // Replace every call that would reach Stripe's servers
    stripe.customers.create = async () => { calls.customers++; return { id: `cus_test_${calls.customers}_${tag}` }; };
    stripe.products.create = async () => { calls.products++; return { id: "prod_test_1" }; };
    stripe.prices.create = async (p: any) => { calls.prices++; (stripe as any).lastPrice = p; return { id: `price_test_${calls.prices}` }; };
    stripe.checkout.sessions.create = async (p: any) => { (stripe as any).lastSession = p; return { url: "https://checkout.stripe.test/session/abc" }; };
    stripe.billingPortal.sessions.create = async (p: any) => { (stripe as any).lastPortal = p; return { url: "https://billing.stripe.test/portal/abc" }; };
  });
  after(async () => {
    await Plan?.deleteMany({ _id: { $in: [plan?._id, freePlan?._id] } });
    await Stock?.deleteMany({ symbol: { $in: SYMBOLS } });
    await t?.close();
  });

  describe("webhook signature", () => {
    it("rejects a request with no signature", async () => assert.equal((await send("invoice.paid", { id: "in_x" }, { unsigned: true })).status, 400));
    it("rejects a request signed with the wrong secret", async () => assert.equal((await send("invoice.paid", { id: "in_x" }, { secret: "whsec_wrong" })).status, 400));
    it("accepts a correctly signed event that we do not care about", async () => assert.equal((await send("customer.created", { id: "cus_x" })).status, 200));
  });

  describe("starting a checkout", () => {
    it("needs a login", async () => assert.equal((await t.call("POST", "/billing/checkout", { body: { planId: String(plan._id) } })).status, 401));

    it("creates a Stripe subscription checkout and never upgrades the plan by itself", async () => {
      const u = await t.signup("checkout");
      const r = await t.call("POST", "/billing/checkout", { token: u.token, body: { planId: String(plan._id), cycle: "Monthly" } });
      assert.equal(r.status, 200);
      assert.equal(r.data.url, "https://checkout.stripe.test/session/abc");
      const s = stripe.lastSession;
      assert.equal(s.mode, "subscription");
      assert.equal(s.client_reference_id, u.id);
      assert.deepEqual(s.line_items, [{ price: "price_test_1", quantity: 1 }]);
      assert.equal(s.success_url, "http://localhost:3000/subscription?checkout=success");
      assert.equal(s.metadata.planId, String(plan._id));
      assert.equal(stripe.lastPrice.unit_amount, 1200);
      assert.equal(stripe.lastPrice.recurring.interval, "month");
      const me = await t.call("GET", "/auth/me", { token: u.token });
      assert.equal(me.data.user.planName, "Free");
    });

    it("reuses the Stripe price on the next checkout", async () => {
      const before = calls.prices;
      const u = await t.signup("reuse");
      await t.call("POST", "/billing/checkout", { token: u.token, body: { planId: String(plan._id), cycle: "Monthly" } });
      assert.equal(calls.prices, before);
    });

    it("makes a yearly price worth 10 months", async () => {
      const u = await t.signup("yearly");
      await t.call("POST", "/billing/checkout", { token: u.token, body: { planId: String(plan._id), cycle: "Yearly" } });
      assert.equal(stripe.lastPrice.unit_amount, 12000);
      assert.equal(stripe.lastPrice.recurring.interval, "year");
    });

    it("makes a new Stripe price when the plan price changes", async () => {
      await Plan.updateOne({ _id: plan._id }, { price: 15 });
      const before = calls.prices;
      const u = await t.signup("newprice");
      await t.call("POST", "/billing/checkout", { token: u.token, body: { planId: String(plan._id), cycle: "Monthly" } });
      assert.equal(calls.prices, before + 1);
      assert.equal(stripe.lastPrice.unit_amount, 1500);
    });

    it("refuses a free plan, an unknown plan and a bad cycle", async () => {
      const u = await t.signup("refuse");
      assert.equal((await t.call("POST", "/billing/checkout", { token: u.token, body: { planId: String(freePlan._id) } })).status, 400);
      assert.equal((await t.call("POST", "/billing/checkout", { token: u.token, body: { planId: "64b64b64b64b64b64b64b64b" } })).status, 404);
      assert.equal((await t.call("POST", "/billing/checkout", { token: u.token, body: { planId: String(plan._id), cycle: "Weekly" } })).status, 400);
    });
  });

  describe("after Stripe confirms payment (webhook)", () => {
    let user: { token: string; id: string }, customer: string;
    const retrieveSub = (over: Record<string, unknown> = {}) => { stripe.subscriptions.retrieve = async () => { calls.retrieveSub++; return sub(customer, over); }; };

    before(async () => {
      user = await t.signup("paid");
      customer = `cus_paid_${Date.now()}`;
    });

    it("checkout.session.completed upgrades the user", async () => {
      retrieveSub();
      const r = await send("checkout.session.completed", { id: "cs_1", mode: "subscription", client_reference_id: user.id, customer, subscription: "sub_test_1", metadata: {} });
      assert.equal(r.status, 200);
      const b = await t.call("GET", "/billing", { token: user.token });
      assert.equal(b.data.plan.name, plan.name);
      assert.equal(b.data.plan.billing, "Monthly");
      assert.equal(b.data.plan.status, "active");
      assert.ok(b.data.plan.currentPeriodEnd);
    });

    it("applies a re-delivered event only once", async () => {
      retrieveSub();
      const fixed = "evt_same_event_twice_" + Date.now();
      const obj = { id: "cs_2", mode: "subscription", client_reference_id: user.id, customer, subscription: "sub_test_1", metadata: {} };
      const a = await send("checkout.session.completed", obj, { id: fixed });
      const n = calls.retrieveSub;
      const b = await send("checkout.session.completed", obj, { id: fixed });
      assert.equal(a.data.result, "processed");
      assert.equal(b.data.result, "duplicate");
      assert.equal(calls.retrieveSub, n);
    });

    it("refuses a second checkout while a subscription is active", async () => {
      const r = await t.call("POST", "/billing/checkout", { token: user.token, body: { planId: String(plan._id) } });
      assert.equal(r.status, 409);
    });

    it("the Premium plan lifts the Free limits", async () => {
      for (const s of SYMBOLS) assert.equal((await t.call("POST", "/watchlist", { token: user.token, body: { symbol: s } })).status, 201);
      const r = await t.call("GET", "/watchlist", { token: user.token });
      assert.equal(r.data.length, 7);
    });

    it("a Free user is still stopped at 5 stocks", async () => {
      const free = await t.signup("freelimit");
      for (const s of SYMBOLS.slice(0, 5)) assert.equal((await t.call("POST", "/watchlist", { token: free.token, body: { symbol: s } })).status, 201);
      assert.equal((await t.call("POST", "/watchlist", { token: free.token, body: { symbol: SYMBOLS[5] } })).status, 403);
    });

    it("invoice.paid records the invoice once, even if it arrives twice", async () => {
      const invoice = {
        id: "in_test_1", customer, amount_paid: 1200, amount_due: 0, created: Math.floor(Date.now() / 1000), status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
        hosted_invoice_url: "https://invoice.stripe.test/i/abc", lines: { data: [{ price: { recurring: { interval: "month" } } }] }, subscription: sub(customer),
      };
      stripe.invoices.retrieve = async () => invoice;
      await send("invoice.paid", { id: "in_test_1" });
      await send("invoice.paid", { id: "in_test_1" });
      const b = await t.call("GET", "/billing", { token: user.token });
      assert.equal(b.data.invoices.length, 1);
      assert.equal(b.data.invoices[0].amount, 12);
      assert.equal(b.data.invoices[0].status, "Paid");
      assert.equal(b.data.invoices[0].hostedUrl, "https://invoice.stripe.test/i/abc");
      assert.equal(b.data.invoices[0].planLabel, `${plan.name} (Monthly)`);
    });

    it("invoice.payment_failed records a failed invoice", async () => {
      stripe.invoices.retrieve = async () => ({
        id: "in_test_2", customer, amount_paid: 0, amount_due: 1200, created: Math.floor(Date.now() / 1000), status_transitions: {}, hosted_invoice_url: null,
        lines: { data: [{ price: { recurring: { interval: "month" } } }] }, subscription: sub(customer),
      });
      await send("invoice.payment_failed", { id: "in_test_2" });
      const b = await t.call("GET", "/billing", { token: user.token });
      const failed = b.data.invoices.find((i: any) => i.tx === "in_test_2");
      assert.equal(failed.status, "Failed");
      assert.equal(failed.amount, 12);
    });

    it("customer.subscription.updated shows a cancellation at the end of the period", async () => {
      retrieveSub({ cancel_at_period_end: true });
      await send("customer.subscription.updated", { id: "sub_test_1" });
      const b = await t.call("GET", "/billing", { token: user.token });
      assert.equal(b.data.plan.cancelAtPeriodEnd, true);
      assert.equal(b.data.plan.name, plan.name);
    });

    it("opens the Stripe billing portal for a customer", async () => {
      const r = await t.call("POST", "/billing/portal", { token: user.token });
      assert.equal(r.status, 200);
      assert.equal(stripe.lastPortal.customer, customer);
      assert.equal(stripe.lastPortal.return_url, "http://localhost:3000/subscription");
    });

    it("customer.subscription.deleted sends the user back to Free", async () => {
      retrieveSub({ status: "canceled" });
      await send("customer.subscription.deleted", { id: "sub_test_1" });
      const b = await t.call("GET", "/billing", { token: user.token });
      assert.equal(b.data.plan.name, "Free");
      assert.equal(b.data.plan.billing, null);
      assert.equal(b.data.plan.cancelAtPeriodEnd, false);
    });

    it("ignores events for a customer we do not know", async () => {
      retrieveSub();
      stripe.subscriptions.retrieve = async () => sub("cus_nobody_knows");
      const r = await send("customer.subscription.updated", { id: "sub_other" });
      assert.equal(r.status, 200);
    });

    it("the portal needs a billing account first", async () => {
      const fresh = await t.signup("noportal");
      assert.equal((await t.call("POST", "/billing/portal", { token: fresh.token })).status, 400);
    });
  });
});
