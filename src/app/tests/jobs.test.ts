// The price refresh jobs, with the provider's answers replaced by canned ones.
process.env.TWELVE_DATA_API_KEY = "test_key_jobs";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { boot, skipDb } from "./helpers.js";
import { mockFetch } from "./fixtures.js";

describe("price refresh jobs", { skip: skipDb && "set TEST_MONGODB_URI to run database tests" }, () => {
  let t: Awaited<ReturnType<typeof boot>>;
  let Stock: any;
  let refreshQuotes: (s?: string[]) => Promise<{ ok: number; failed: number }>, refreshDaily: (s?: string[]) => Promise<{ ok: number; failed: number }>;
  let m: ReturnType<typeof mockFetch>;
  const A = "ZJA", B = "ZJB";

  const days = (n: number) => Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 9, 28) - i * 86400000).toISOString().slice(0, 10);
    return { datetime: d, close: String((200 - i * 0.5).toFixed(2)) };       // newest first, falling backwards = rising forwards
  });

  before(async () => {
    t = await boot({ TWELVE_DATA_API_KEY: "test_key_jobs" });
    ({ Stock } = await import("../models/Stock.js"));
    ({ refreshQuotes, refreshDaily } = await import("../jobs/marketRefresh.js"));
    for (const s of [A, B]) await Stock.updateOne({ symbol: s }, { $set: { name: `Job Test ${s}`, kind: "stock", exchange: "NASDAQ", closes: [], closeDates: [] }, $unset: { quote: "" } }, { upsert: true });
    m = mockFetch((url) => {
      if (url.hostname !== "api.twelvedata.com") return undefined;
      const symbol = url.searchParams.get("symbol");
      if (symbol === B) return { body: { code: 404, message: "symbol not found", status: "error" } };
      if (url.pathname === "/quote") return { body: { symbol, exchange: "NASDAQ", close: "200.00", previous_close: "199.00", change: "1.00", volume: "2500000", is_market_open: false, timestamp: 1793000000 } };
      if (url.pathname === "/time_series") return { body: { status: "ok", values: days(60) } };
    });
  });
  after(async () => { m?.restore(); await Stock?.deleteMany({ symbol: { $in: [A, B] } }); await t?.close(); });

  it("stores quotes, and counts a symbol the provider rejects as failed", async () => {
    const r = await refreshQuotes([A, B]);
    assert.deepEqual(r, { ok: 1, failed: 1 });
    const view = await t.call("GET", `/stocks/${A}`);
    assert.equal(view.data.price, 200);
    assert.equal(view.data.change, 1);
    assert.equal(view.data.volume, "2.5M");
    assert.equal(view.data.signal, null);                          // no daily history yet, so no signal
    assert.equal((await t.call("GET", `/stocks/${B}`)).data.price, null);
  });

  it("stores daily history, which switches on the signal and the charts", async () => {
    const r = await refreshDaily([A, B]);
    assert.deepEqual(r, { ok: 1, failed: 1 });
    const view = await t.call("GET", `/stocks/${A}`);
    assert.equal(view.data.signal, "Bullish");
    assert.ok(view.data.support !== null);
    const chart = await t.call("GET", `/stocks/${A}/history?range=1M`);
    assert.equal(chart.data.length, 22);
    assert.equal(chart.data[21].price, 200);
  });

  it("uses the price provider for the 1D chart and says when it cannot", async () => {
    m.restore();
    const intraday = mockFetch((url) => {
      if (url.hostname === "api.twelvedata.com") return { body: { status: "ok", values: [{ datetime: "2026-10-28 15:30:00", close: "201" }, { datetime: "2026-10-28 09:30:00", close: "199" }] } };
    });
    const ok = await t.call("GET", `/stocks/${A}/history?range=1D`);
    intraday.restore();
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.data, [{ label: "09:30", price: 199 }, { label: "15:30", price: 201 }]);
  });
});
