// The price simulator (used when MARKET_DATA_MODE=simulated). No database needed.
process.env.MONGODB_URI ??= "mongodb://unused";
process.env.JWT_SECRET ??= "placeholder-secret-for-unit-tests";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
const sim = await import("../services/simulator.js");
const NOW = new Date("2026-10-28T15:00:00Z"); // Wednesday, 11:00 in New York
const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const isWeekend = (d) => [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay());
describe("simulated daily history", () => {
    const h = sim.generateHistory("AAPL", NOW);
    it("makes about a year of weekday closes, ending on the last completed weekday", () => {
        assert.equal(h.closes.length, 260);
        assert.equal(h.closeDates.length, 260);
        assert.equal(h.closeDates[259], "2026-10-27");
        assert.ok(h.closeDates.every((d) => !isWeekend(d)));
        assert.deepEqual([...h.closeDates].sort(), h.closeDates);
        assert.ok(h.closes.every((c) => c > 0));
    });
    it("is the same every time for the same stock and day, and different for another stock", () => {
        assert.deepEqual(sim.generateHistory("AAPL", NOW), h);
        assert.notDeepEqual(sim.generateHistory("MSFT", NOW).closes, h.closes);
    });
    it("skips the weekend when finding the last completed day", () => {
        assert.equal(sim.lastCompletedWeekday(new Date("2026-11-02T15:00:00Z")), "2026-10-30"); // Monday, so Friday
        assert.equal(sim.lastCompletedWeekday(new Date("2026-10-31T15:00:00Z")), "2026-10-30"); // Saturday
    });
    it("adds only the missing weekdays, and leaves an up-to-date history alone", () => {
        const old = { closes: h.closes.slice(0, 257), closeDates: h.closeDates.slice(0, 257) }; // missing the last 3 weekdays
        const ext = sim.extendHistory("AAPL", old, NOW);
        assert.equal(ext.closeDates[ext.closeDates.length - 1], "2026-10-27");
        assert.equal(ext.closes.length, 260);
        assert.deepEqual(ext.closes.slice(0, 257), old.closes);
        assert.equal(sim.extendHistory("AAPL", h, NOW), h);
    });
    it("starts over when it has been off for a long time or is empty", () => {
        assert.equal(sim.extendHistory("AAPL", { closes: [], closeDates: [] }, NOW).closes.length, 260);
        const stale = { closes: h.closes.slice(0, 100), closeDates: h.closeDates.slice(0, 100) };
        assert.equal(sim.extendHistory("AAPL", stale, NOW).closeDates[259], "2026-10-27");
    });
});
describe("simulated live price", () => {
    it("moves a little each minute and always stays near the last close", () => {
        const rnd = seeded(42);
        let prev;
        const seen = new Set();
        for (let i = 0; i < 2000; i++) {
            const q = sim.nextQuote("TSLA", 250, prev, new Date(NOW.getTime() + i * 60000), rnd);
            assert.ok(q.price >= 250 * 0.88 && q.price <= 250 * 1.12, `price ${q.price}`);
            assert.equal(q.change, Math.round((q.price - 250) * 100) / 100);
            assert.equal(q.previousClose, 250);
            seen.add(q.price);
            prev = q;
        }
        assert.ok(seen.size > 100);
    });
    it("starts the day's volume at a believable level, adds to it, and starts again on a new day", () => {
        const rnd = seeded(7);
        const a = sim.nextQuote("AAPL", 230, undefined, NOW, rnd); // 11:00 in New York, about 46% of the day
        assert.ok(a.volume > 15e6 && a.volume < 40e6, `volume ${a.volume}`);
        const b = sim.nextQuote("AAPL", 230, a, new Date(NOW.getTime() + 60000), rnd);
        assert.ok(b.volume > a.volume);
        const earlyNextDay = sim.nextQuote("AAPL", 230, b, new Date("2026-10-29T04:30:00Z"), rnd); // 00:30 the next day
        assert.ok(earlyNextDay.volume < 5e6, `volume ${earlyNextDay.volume}`);
    });
});
describe("simulated 1D chart", () => {
    it("starts with 24 hours of points ending at the current price", () => {
        const list = sim.updateIntraday([], 231.5, NOW, "AAPL", 230);
        assert.equal(list.length, 48);
        assert.equal(list[47].price, 231.5);
        assert.ok(list.every((p, i) => i === 0 || p.at > list[i - 1].at));
    });
    it("keeps the newest point following the price, and adds a point every 30 minutes", () => {
        const first = sim.updateIntraday([], 231.5, NOW, "AAPL", 230);
        const soon = sim.updateIntraday(first, 232, new Date(NOW.getTime() + 60000), "AAPL", 230);
        assert.equal(soon.length, 48);
        assert.equal(soon[47].price, 232);
        const later = sim.updateIntraday(soon, 233, new Date(NOW.getTime() + 31 * 60000), "AAPL", 230);
        assert.equal(later.length, 48);
        assert.equal(later[47].price, 233);
        assert.notEqual(later[0].at, soon[0].at);
    });
    it("labels the points and drops old ones", () => {
        const list = sim.updateIntraday([], 100, NOW, "AAPL", 100);
        const pts = sim.intradayPoints(list, NOW);
        assert.ok(pts.length >= 40 && pts.every((p) => /^\d{2}:\d{2}$/.test(p.label)));
        assert.equal(sim.intradayPoints(list, new Date(NOW.getTime() + 48 * 3600000)).length, 0);
    });
});
it("labels itself clearly", () => assert.match(sim.SIMULATED_LABEL, /not real market data/));
//# sourceMappingURL=simulator.test.js.map