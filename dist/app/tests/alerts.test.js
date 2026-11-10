// The alert engine: which alerts fire, and who gets told (email, Discord, in-app).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { boot, skipDb } from "./helpers.js";
import { makeCloses, mockFetch } from "./fixtures.js";
const DISCORD = "https://discord.com/api/webhooks/123456789/abcDEF_ghi-123";
// The settings must be in place before the app code is loaded, because it reads them once
Object.assign(process.env, {
    NODE_ENV: "test", MONGODB_URI: process.env.TEST_MONGODB_URI ?? "mongodb://unused", JWT_SECRET: "test-secret-test-secret-test-secret",
    BCRYPT_ROUNDS: "4", CLIENT_URL: "http://localhost:3000", RESEND_API_KEY: "re_test", MAIL_FROM: "StockSense <no-reply@example.com>",
});
const { shouldFire, describeAlert } = await import("../jobs/alerts.js");
// Offline: the rules on their own
describe("alert rules", () => {
    const view = { symbol: "AAPL", name: "Apple Inc.", price: 150, volume: "12.5M", volumeM: 12.5, signal: "Bullish", confidence: 80, reason: "Because." };
    it("price: fires when the price reaches the target from the side it was on", () => {
        assert.equal(shouldFire({ kind: "price", value: 140, direction: "above" }, view), true);
        assert.equal(shouldFire({ kind: "price", value: 160, direction: "above" }, view), false);
        assert.equal(shouldFire({ kind: "price", value: 160, direction: "below" }, view), true);
        assert.equal(shouldFire({ kind: "price", value: 140, direction: "below" }, view), false);
        assert.equal(shouldFire({ kind: "breakout", value: 150, direction: "above" }, view), true);
    });
    it("price: never fires without a price", () => assert.equal(shouldFire({ kind: "price", value: 1, direction: "above" }, { ...view, price: null }), false));
    it("signal: fires only when the signal turns into the wanted one", () => {
        assert.equal(shouldFire({ kind: "signal", value: "Bullish", lastSeen: "Neutral" }, view), true);
        assert.equal(shouldFire({ kind: "signal", value: "Bullish", lastSeen: "Bullish" }, view), false);
        assert.equal(shouldFire({ kind: "signal", value: "Bearish", lastSeen: "Neutral" }, view), false);
    });
    it("volume: compares in millions", () => {
        assert.equal(shouldFire({ kind: "volume", value: 10 }, view), true);
        assert.equal(shouldFire({ kind: "volume", value: 13 }, view), false);
        assert.equal(shouldFire({ kind: "volume", value: 1 }, { ...view, volumeM: null }), false);
    });
    it("writes a clear message", () => {
        assert.equal(describeAlert({ kind: "price", value: 140, direction: "above" }, view).title, "AAPL reached $140");
        assert.match(describeAlert({ kind: "signal", value: "Bullish" }, view).title, /signal turned Bullish/);
        assert.match(describeAlert({ kind: "volume", value: 10 }, view).body, /12\.5M/);
    });
});
describe("alert engine", { skip: skipDb && "set TEST_MONGODB_URI to run database tests" }, () => {
    let t;
    let M;
    let evaluateAlerts;
    let env;
    const tag = `${Date.now()}`.slice(-6);
    const SYM = `ZA${String.fromCharCode(65 + Number(tag.slice(-1)))}`; // a symbol made of letters only
    const made = { users: [] };
    const mails = [], posts = [];
    let mocks;
    const newUser = async (over = {}) => {
        const u = await M.User.create({ firstName: "Eng", lastName: "Test", email: `eng${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`, passwordHash: "x", ...over });
        made.users.push(u._id);
        return u;
    };
    const newAlert = (user, over = {}) => M.Alert.create({ user: user._id, symbol: SYM, kind: "price", value: 140, direction: "above", channels: { email: true, push: false, discord: true }, ...over });
    before(async () => {
        t = await boot();
        ({ env } = await import("../config/env.js"));
        ({ evaluateAlerts } = await import("../jobs/alerts.js"));
        M = { Alert: (await import("../models/Alert.js")).Alert, User: (await import("../models/User.js")).User, Stock: (await import("../models/Stock.js")).Stock, Notification: (await import("../models/Notification.js")).Notification };
        await M.Stock.updateOne({ symbol: SYM }, { $set: { name: "Engine Test Co", kind: "stock", exchange: "NASDAQ", ...makeCloses(60, "up"), quote: { price: 150, previousClose: 148, change: 2, volume: 12_500_000, marketOpen: true, at: new Date() } } }, { upsert: true });
        mocks = mockFetch((url, init) => {
            if (url.hostname === "api.resend.com") {
                mails.push(JSON.parse(String(init?.body)));
                return { body: { id: "m1" } };
            }
            if (url.hostname === "discord.com") {
                posts.push(JSON.parse(String(init?.body)));
                return { status: 204, body: {} };
            }
        });
    });
    after(async () => {
        mocks?.restore();
        await M?.Alert.deleteMany({ user: { $in: made.users } });
        await M?.Notification.deleteMany({ user: { $in: made.users } });
        await M?.User.deleteMany({ _id: { $in: made.users } });
        await M?.Stock.deleteMany({ symbol: SYM });
        await t?.close();
    });
    it("fires a reached price alert: switches it off, notifies in-app, by email and on Discord", async () => {
        mails.length = posts.length = 0;
        const user = await newUser({ planName: "Premium", discordWebhookUrl: DISCORD });
        const alert = await newAlert(user);
        await evaluateAlerts({ includeFree: false });
        const after = await M.Alert.findById(alert._id);
        assert.equal(after.active, false);
        assert.ok(after.lastTriggeredAt);
        const notes = await M.Notification.find({ user: user._id });
        assert.equal(notes.length, 1);
        assert.equal(notes[0].title, `${SYM} reached $140`);
        assert.equal(notes[0].read, false);
        const mail = mails.find((m) => m.to[0] === user.email);
        assert.ok(mail && mail.subject.includes(SYM));
        assert.ok(posts.some((p) => p.content.includes(SYM)));
    });
    it("does not fire the same alert twice", async () => {
        const user = await newUser({ planName: "Premium" });
        await newAlert(user, { channels: { email: false, push: true, discord: false } });
        await evaluateAlerts({ includeFree: false });
        await evaluateAlerts({ includeFree: false });
        assert.equal(await M.Notification.countDocuments({ user: user._id }), 1);
    });
    it("leaves an alert alone when its condition is not met", async () => {
        const user = await newUser({ planName: "Premium" });
        const alert = await newAlert(user, { value: 200 });
        await evaluateAlerts({ includeFree: false });
        assert.equal((await M.Alert.findById(alert._id)).active, true);
        assert.equal(await M.Notification.countDocuments({ user: user._id }), 0);
    });
    it("checks Free plan alerts only in the end-of-day run", async () => {
        const user = await newUser({ planName: "Free" });
        const alert = await newAlert(user, { channels: { email: false, push: true, discord: false } });
        await evaluateAlerts({ includeFree: false });
        assert.equal((await M.Alert.findById(alert._id)).active, true);
        await evaluateAlerts({ includeFree: true });
        assert.equal((await M.Alert.findById(alert._id)).active, false);
    });
    it("fires a price-drop alert and a volume alert", async () => {
        const user = await newUser({ planName: "Premium" });
        const down = await newAlert(user, { value: 155, direction: "below", channels: { email: false, push: true, discord: false } });
        const volume = await newAlert(user, { kind: "volume", value: 10, direction: undefined, channels: { email: false, push: true, discord: false } });
        await evaluateAlerts({ includeFree: false });
        assert.equal((await M.Alert.findById(down._id)).active, false);
        assert.equal((await M.Alert.findById(volume._id)).active, false);
    });
    it("signal alerts react to a change and remember what they last saw", async () => {
        const user = await newUser({ planName: "Premium" });
        const same = await newAlert(user, { kind: "signal", value: "Bullish", direction: undefined, lastSeen: "Bullish", channels: { email: false, push: true, discord: false } });
        const turned = await newAlert(user, { kind: "signal", value: "Bullish", direction: undefined, lastSeen: "Neutral", channels: { email: false, push: true, discord: false } });
        const other = await newAlert(user, { kind: "signal", value: "Bearish", direction: undefined, lastSeen: "Neutral", channels: { email: false, push: true, discord: false } });
        await evaluateAlerts({ includeFree: false });
        assert.equal((await M.Alert.findById(same._id)).active, true);
        assert.equal((await M.Alert.findById(turned._id)).active, false);
        const o = await M.Alert.findById(other._id);
        assert.equal(o.active, true);
        assert.equal(o.lastSeen, "Bullish");
    });
    it("skips blocked users", async () => {
        const user = await newUser({ planName: "Premium", blocked: true });
        const alert = await newAlert(user);
        await evaluateAlerts({ includeFree: true });
        assert.equal((await M.Alert.findById(alert._id)).active, true);
    });
    it("still records the alert when email sending fails", async () => {
        const real = mocks;
        real.restore();
        const failing = mockFetch((url) => (url.hostname === "api.resend.com" ? { status: 500, body: { message: "down" } } : undefined));
        try {
            const user = await newUser({ planName: "Premium" });
            const alert = await newAlert(user, { channels: { email: true, push: false, discord: false } });
            await evaluateAlerts({ includeFree: false });
            assert.equal((await M.Alert.findById(alert._id)).active, false);
            assert.equal(await M.Notification.countDocuments({ user: user._id }), 1);
        }
        finally {
            failing.restore();
            mocks = mockFetch((url, init) => {
                if (url.hostname === "api.resend.com") {
                    mails.push(JSON.parse(String(init?.body)));
                    return { body: { id: "m1" } };
                }
                if (url.hostname === "discord.com") {
                    posts.push(JSON.parse(String(init?.body)));
                    return { status: 204, body: {} };
                }
            });
        }
    });
    it("does not send Discord messages to users without a webhook", async () => {
        posts.length = 0;
        const user = await newUser({ planName: "Premium" });
        await newAlert(user, { channels: { email: false, push: false, discord: true } });
        await evaluateAlerts({ includeFree: false });
        assert.equal(posts.length, 0);
        assert.equal(await M.Notification.countDocuments({ user: user._id }), 1);
    });
});
//# sourceMappingURL=alerts.test.js.map