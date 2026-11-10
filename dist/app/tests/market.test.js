// The price provider code, with fetch replaced by canned answers in the format Twelve Data documents.
process.env.TWELVE_DATA_API_KEY = "test_key_123";
process.env.MONGODB_URI ??= "mongodb://unused";
process.env.JWT_SECRET ??= "placeholder-secret-for-unit-tests";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mockFetch } from "./fixtures.js";
const md = await import("../services/marketData.js");
const { TokenBucket } = await import("../utils/rateLimiter.js");
const hours = await import("../utils/marketHours.js");
describe("price provider", () => {
    it("reads a quote and sends the key and symbol", async () => {
        const m = mockFetch(() => ({ body: { symbol: "AAPL", exchange: "NASDAQ", close: "175.30", previous_close: "174.90", change: "0.40", volume: "1234567", is_market_open: true, timestamp: 1773484500 } }));
        const q = await md.fetchQuote("AAPL");
        m.restore();
        assert.deepEqual({ price: q.price, previousClose: q.previousClose, change: q.change, volume: q.volume, marketOpen: q.marketOpen, exchange: q.exchange }, { price: 175.3, previousClose: 174.9, change: 0.4, volume: 1234567, marketOpen: true, exchange: "NASDAQ" });
        assert.equal(q.at.getTime(), 1773484500000);
        assert.equal(m.calls[0].url.pathname, "/quote");
        assert.equal(m.calls[0].url.searchParams.get("symbol"), "AAPL");
        assert.equal(m.calls[0].url.searchParams.get("apikey"), "test_key_123");
    });
    it("turns the provider's error answer into an error", async () => {
        const m = mockFetch(() => ({ body: { code: 400, message: "**symbol** not found", status: "error" } }));
        await assert.rejects(() => md.fetchQuote("NOPE"), (e) => e instanceof md.ProviderError && e.code === 400 && /not found/.test(e.message));
        m.restore();
    });
    it("refuses an answer without a usable price", async () => {
        const m = mockFetch(() => ({ body: { symbol: "AAPL", close: null, previous_close: "1" } }));
        await assert.rejects(() => md.fetchQuote("AAPL"), (e) => e instanceof md.ProviderError);
        m.restore();
    });
    it("returns daily closes oldest first, as numbers, and drops broken rows", async () => {
        const m = mockFetch(() => ({ body: { status: "ok", values: [
                    { datetime: "2026-10-28", close: "103.5" }, { datetime: "2026-10-27", close: "bad" }, { datetime: "2026-10-26", close: "102.25" }, { datetime: "2026-10-23", close: "101" }
                ] } }));
        const c = await md.fetchDaily("AAPL");
        m.restore();
        assert.deepEqual(c, [{ date: "2026-10-23", close: 101 }, { date: "2026-10-26", close: 102.25 }, { date: "2026-10-28", close: 103.5 }]);
        assert.equal(m.calls[0].url.searchParams.get("interval"), "1day");
    });
    it("keeps only the newest session for the 1D chart, and remembers it for 10 minutes", async () => {
        const m = mockFetch(() => ({ body: { status: "ok", values: [
                    { datetime: "2026-10-28 15:30:00", close: "11" }, { datetime: "2026-10-28 09:30:00", close: "10" }, { datetime: "2026-10-27 15:30:00", close: "9" }
                ] } }));
        const first = await md.fetchIntraday("MSFT");
        const second = await md.fetchIntraday("MSFT");
        m.restore();
        assert.deepEqual(first, [{ label: "09:30", price: 10 }, { label: "15:30", price: 11 }]);
        assert.deepEqual(second, first);
        assert.equal(m.calls.length, 1);
    });
    it("tells a waiting visitor to try later instead of using up the minute's requests", async () => {
        const m = mockFetch(() => ({ body: { close: "1", previous_close: "1" } }));
        let failure;
        for (let i = 0; i < 10 && !failure; i++) {
            try {
                await md.fetchQuote("AAPL", false);
            }
            catch (e) {
                failure = e;
            }
        }
        m.restore();
        assert.ok(failure instanceof md.ProviderError);
        assert.equal(failure.code, 429);
    });
});
describe("request limiter", () => {
    it("hands out tokens, keeps a reserve and refills over time", async () => {
        const b = new TokenBucket(3, 60); // 60 a minute = one a second
        assert.equal(b.tryTake(2), true); // 3 -> 2
        assert.equal(b.tryTake(2), false); // only the reserve is left
        assert.equal(b.tryTake(), true);
        assert.equal(b.tryTake(), true);
        assert.equal(b.tryTake(), false);
        await new Promise((ok) => setTimeout(ok, 1100));
        assert.equal(b.tryTake(), true);
    });
});
describe("market hours", () => {
    it("is open on a weekday during New York trading hours (summer time)", () => {
        assert.equal(hours.isMarketOpen(new Date("2026-10-28T15:00:00Z")), true); // 11:00 in New York
        assert.equal(hours.isMarketOpen(new Date("2026-10-28T13:00:00Z")), false); // 09:00, before the open
        assert.equal(hours.isMarketOpen(new Date("2026-10-28T20:30:00Z")), false); // 16:30, after the close
    });
    it("handles winter time too", () => {
        assert.equal(hours.isMarketOpen(new Date("2026-12-15T15:00:00Z")), true); // 10:00 in New York
        assert.equal(hours.isMarketOpen(new Date("2026-12-15T14:00:00Z")), false); // 09:00
    });
    it("is closed at the weekend", () => assert.equal(hours.isMarketOpen(new Date("2026-10-31T15:00:00Z")), false));
    it("knows when the day's final prices are out", () => {
        assert.equal(hours.afterClose(new Date("2026-10-28T20:45:00Z")), true); // 16:45
        assert.equal(hours.afterClose(new Date("2026-10-28T19:00:00Z")), false); // 15:00
        assert.equal(hours.afterClose(new Date("2026-10-31T21:00:00Z")), false); // Saturday
    });
    it("gives the New York date", () => assert.equal(hours.newYorkDate(new Date("2026-10-29T02:00:00Z")), "2026-10-28"));
});
//# sourceMappingURL=market.test.js.map