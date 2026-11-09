// Simulated mode end to end: jobs, API and alerts, with no price provider involved.
Object.assign(process.env, {
  NODE_ENV: "test", MONGODB_URI: process.env.TEST_MONGODB_URI ?? "mongodb://unused", JWT_SECRET: "test-secret-test-secret-test-secret",
  BCRYPT_ROUNDS: "4", CLIENT_URL: "http://localhost:3000", MARKET_DATA_MODE: "simulated",
});
delete process.env.TWELVE_DATA_API_KEY;

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { boot, skipDb } from "./helpers.js";
import { mockFetch } from "./fixtures.js";

const jobs = await import("../jobs/index.js");
const { jobState } = await import("../jobs/marketRefresh.js");

describe("simulated schedule", () => {
  it("makes a new price every minute, all day", () => {
    jobState.lastQuotes = null;
    assert.equal(jobs.quotesDue(new Date("2026-10-31T03:00:00Z")), true);                  // Saturday night: still runs
    jobState.lastQuotes = new Date("2026-10-31T03:00:00Z");
    assert.equal(jobs.quotesDue(new Date("2026-10-31T03:00:59Z")), false);
    assert.equal(jobs.quotesDue(new Date("2026-10-31T03:01:01Z")), true);
    jobState.lastQuotes = null;
  });
});

describe("simulated prices", { skip: skipDb && "set TEST_MONGODB_URI to run database tests" }, () => {
  let t: Awaited<ReturnType<typeof boot>>;
  let Stock: any, User: any, Alert: any, Notification: any;
  let refreshQuotes: any, refreshDaily: any, evaluateAlerts: any;
  let m: ReturnType<typeof mockFetch>;
  const A = "ZMA", B = "ZMB";
  const users: any[] = [];

  before(async () => {
    t = await boot();
    ({ Stock } = await import("../models/Stock.js"));
    ({ User } = await import("../models/User.js"));
    ({ Alert } = await import("../models/Alert.js"));
    ({ Notification } = await import("../models/Notification.js"));
    ({ refreshQuotes, refreshDaily } = await import("../jobs/marketRefresh.js"));
    ({ evaluateAlerts } = await import("../jobs/alerts.js"));
    for (const s of [A, B]) await Stock.updateOne({ symbol: s }, { $set: { name: `Sim ${s}`, kind: "stock", exchange: "NASDAQ", closes: [], closeDates: [], intraday: [] }, $unset: { quote: "" } }, { upsert: true });
    m = mockFetch((url) => { if (url.hostname === "api.twelvedata.com") throw new Error("the simulator must not call the price provider"); return undefined; });
  });
  after(async () => {
    m?.restore();
    await Stock?.deleteMany({ symbol: { $in: [A, B] } });
    await Alert?.deleteMany({ user: { $in: users } });
    await Notification?.deleteMany({ user: { $in: users } });
    await User?.deleteMany({ _id: { $in: users } });
    await t?.close();
  });

  it("shows no price before anything has run", async () => {
    const v = await t.call("GET", `/stocks/${A}`);
    assert.equal(v.data.price, null);
    assert.equal(v.data.dataSource, "simulated");
  });

  it("makes history, then prices, and the whole API works on them", async () => {
    assert.deepEqual(await refreshDaily([A, B]), { ok: 2, failed: 0 });
    assert.deepEqual(await refreshQuotes([A, B]), { ok: 2, failed: 0 });
    const v = await t.call("GET", `/stocks/${A}`);
    assert.ok(typeof v.data.price === "number" && v.data.price > 0);
    assert.ok(["Bullish", "Neutral", "Bearish"].includes(v.data.signal));
    assert.equal(v.data.dataSource, "simulated");
    assert.ok(v.data.volume);
    for (const [range, n] of [["1W", 5], ["1M", 22], ["1Y", 12]] as const) assert.equal((await t.call("GET", `/stocks/${A}/history?range=${range}`)).data.length, n);
    const day = await t.call("GET", `/stocks/${A}/history?range=1D`);
    assert.equal(day.status, 200);
    assert.ok(day.data.length >= 40);
    assert.equal((await t.call("GET", `/stocks/${A}/summary`)).status, 200);
  });

  it("moves the price on every refresh", async () => {
    const prices = new Set<number>();
    for (let i = 0; i < 6; i++) { await refreshQuotes([A]); prices.add((await t.call("GET", `/stocks/${A}`)).data.price); }
    assert.ok(prices.size >= 3);
  });

  it("says plainly that the prices are simulated", async () => {
    const s = await t.call("GET", "/stocks/market/status");
    assert.equal(s.data.mode, "simulated");
    assert.equal(s.data.provider, "simulated");
    assert.match(s.data.notice, /not real market data/);
    assert.equal(s.data.configured, true);
  });

  it("fires a Premium alert on a simulated price and marks the message as simulated", async () => {
    const price = (await t.call("GET", `/stocks/${A}`)).data.price;
    const user = await User.create({ firstName: "Sim", lastName: "Tester", email: `sim${Date.now()}@example.com`, passwordHash: "x", planName: "Premium" });
    users.push(user._id);
    await Alert.create({ user: user._id, symbol: A, kind: "price", value: price + 5, direction: "below", channels: { email: false, push: true, discord: false } });
    const r = await evaluateAlerts({ includeFree: false });
    assert.ok(r.fired >= 1);
    const notes = await Notification.find({ user: user._id });
    assert.equal(notes.length, 1);
    assert.match(notes[0].body, /Simulated price/);
  });

  it("is listed in the admin overview", async () => {
    const bcrypt = (await import("bcryptjs")).default;
    const email = `simadm${Date.now()}@example.com`;
    const admin = await User.create({ firstName: "Ad", lastName: "Min", email, role: "admin", passwordHash: await bcrypt.hash("Admin@12345", 4) });
    users.push(admin._id);
    const login = await t.call("POST", "/auth/login", { body: { email, password: "Admin@12345" } });
    const r = await t.call("GET", "/admin/system", { token: login.data.token });
    assert.equal(r.data.marketData.mode, "simulated");
    assert.equal(r.data.marketData.configured, true);
  });
});
