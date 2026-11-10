// With no Stripe keys the server must refuse payments, never pretend they worked.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { boot, skipDb } from "./helpers.js";
describe("payments without Stripe keys", { skip: skipDb && "set TEST_MONGODB_URI to run database tests" }, () => {
    let t;
    let plan, Plan;
    before(async () => {
        delete process.env.STRIPE_SECRET_KEY;
        delete process.env.STRIPE_WEBHOOK_SECRET;
        t = await boot({ STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "" });
        ({ Plan } = await import("../models/Plan.js"));
        plan = await Plan.create({ name: `NoKeyPlan${Date.now()}`, price: 5, features: [] });
    });
    after(async () => { await Plan?.deleteMany({ _id: plan?._id }); await t?.close(); });
    it("checkout answers 503", async () => {
        const u = await t.signup("nokey");
        const r = await t.call("POST", "/billing/checkout", { token: u.token, body: { planId: String(plan._id) } });
        assert.equal(r.status, 503);
        assert.match(r.data.message, /not set up/);
    });
    it("the webhook answers 503", async () => assert.equal((await t.call("POST", "/billing/webhook", { rawBody: "{}" })).status, 503));
    it("there is no free upgrade route any more", async () => {
        const u = await t.signup("noupgrade");
        assert.equal((await t.call("POST", "/billing/subscribe", { token: u.token, body: { planId: "x", cycle: "Monthly" } })).status, 404);
    });
});
//# sourceMappingURL=billing-unconfigured.test.js.map