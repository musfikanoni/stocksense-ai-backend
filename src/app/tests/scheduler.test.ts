// When the background job decides to fetch prices. Uses its own throw-away database so it never touches your other data.
const base = process.env.TEST_MONGODB_URI;
const dbName = `sched_test_${Date.now()}`;
if (base) process.env.TEST_MONGODB_URI = base.replace(/\/([^/?]*)(\?|$)/, `/${dbName}$2`);
Object.assign(process.env, {
  NODE_ENV: "test", MONGODB_URI: process.env.TEST_MONGODB_URI ?? "mongodb://unused", JWT_SECRET: "test-secret-test-secret-test-secret",
  BCRYPT_ROUNDS: "4", CLIENT_URL: "http://localhost:3000", TWELVE_DATA_API_KEY: "test_key_sched", QUOTE_REFRESH_MINUTES: "30",
});

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { boot, skipDb } from "./helpers.js";
import { makeCloses, mockFetch } from "./fixtures.js";

const jobs = await import("../jobs/index.js");
const { jobState } = await import("../jobs/marketRefresh.js");

const OPEN = new Date("2026-10-28T15:00:00Z");           // Wednesday 11:00 in New York, market open
const AFTER_CLOSE = new Date("2026-10-28T21:00:00Z");    // 17:00 in New York
const MORNING = new Date("2026-10-28T12:00:00Z");        // 08:00 in New York, before the open

describe("when prices are refreshed", () => {
  it("fetches quotes at start-up, then only while the market is open and the interval has passed", () => {
    jobState.lastQuotes = null;
    assert.equal(jobs.quotesDue(MORNING), true);                                   // nothing fetched yet
    jobState.lastQuotes = new Date(MORNING.getTime() - 3600000);
    assert.equal(jobs.quotesDue(MORNING), false);                                  // market closed
    jobState.lastQuotes = new Date(OPEN.getTime() - 10 * 60000);
    assert.equal(jobs.quotesDue(OPEN), false);                                     // 10 minutes ago, interval is 30
    jobState.lastQuotes = new Date(OPEN.getTime() - 31 * 60000);
    assert.equal(jobs.quotesDue(OPEN), true);
    jobState.lastQuotes = null;
  });
});

describe("daily history schedule", { skip: skipDb && "set TEST_MONGODB_URI to run database tests" }, () => {
  let t: Awaited<ReturnType<typeof boot>>;
  let Stock: any, mongoose: any;
  let m: ReturnType<typeof mockFetch>;
  const fetched: string[] = [];

  before(async () => {
    t = await boot({ TWELVE_DATA_API_KEY: "test_key_sched" });
    ({ Stock } = await import("../models/Stock.js"));
    mongoose = (await import("mongoose")).default;
    m = mockFetch((url) => {
      if (url.hostname !== "api.twelvedata.com") return undefined;
      fetched.push(url.pathname);
      if (url.pathname === "/quote") return { body: { close: "120", previous_close: "119", change: "1", volume: "1000000", is_market_open: false, timestamp: 1793000000 } };
      return { body: { status: "ok", values: Array.from({ length: 60 }, (_, i) => ({ datetime: new Date(Date.UTC(2026, 9, 27) - i * 86400000).toISOString().slice(0, 10), close: String(100 - i * 0.1) })) } };
    });
  });
  after(async () => {
    m?.restore();
    if (mongoose?.connection.name?.startsWith("sched_test_")) await mongoose.connection.dropDatabase();      // only our own throw-away database
    await t?.close();
  });

  it("does nothing when there are no stocks", async () => assert.equal(await jobs.dailyDue(AFTER_CLOSE), false));

  it("is due when a stock has no history", async () => {
    await Stock.create({ symbol: "ZSCA", name: "Sched A", kind: "stock", exchange: "NASDAQ", closes: [], closeDates: [] });
    await Stock.create({ symbol: "ZSCB", name: "Sched B", kind: "stock", exchange: "NASDAQ", closes: [], closeDates: [] });
    assert.equal(await jobs.dailyDue(OPEN), true);
  });

  it("one check fetches the missing history and the first prices, and stores them", async () => {
    jobState.lastQuotes = null;
    await jobs.tick(OPEN);
    assert.ok(fetched.includes("/time_series") && fetched.includes("/quote"));
    const a = await Stock.findOne({ symbol: "ZSCA" });
    assert.ok(a.closes.length >= 30 && a.quote.price === 120 && a.dailyUpdatedAt);
    assert.ok(jobState.lastQuotes && jobState.lastDaily);
  });

  it("then waits: no new request when nothing is due", async () => {
    const n = fetched.length;
    await jobs.tick(new Date(OPEN.getTime() + 5 * 60000));
    assert.equal(fetched.length, n);
  });

  it("is due again once a day after the close, not before", async () => {
    await Stock.updateMany({}, { dailyUpdatedAt: new Date(AFTER_CLOSE.getTime() - 20 * 3600000) });
    assert.equal(await jobs.dailyDue(MORNING), false);
    assert.equal(await jobs.dailyDue(AFTER_CLOSE), true);
    await Stock.updateMany({}, { dailyUpdatedAt: new Date(AFTER_CLOSE.getTime() - 3600000) });
    assert.equal(await jobs.dailyDue(AFTER_CLOSE), false);
  });
});
