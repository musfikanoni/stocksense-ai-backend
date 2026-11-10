import { newYorkDate, newYorkMinutes } from "../utils/marketHours.js";
export const SIMULATED_LABEL = "Simulated prices, not real market data";
const BASE = {
    AAPL: [230, 0.014, 55], MSFT: [420, 0.013, 22], GOOGL: [175, 0.016, 28], AMZN: [190, 0.017, 40], TSLA: [250, 0.032, 90],
    META: [560, 0.019, 14], NFLX: [700, 0.02, 3], NVDA: [130, 0.03, 220], ADBE: [480, 0.018, 3], PYPL: [70, 0.02, 12],
    INTC: [25, 0.025, 45], CSCO: [55, 0.012, 20], AMD: [150, 0.028, 55], UBER: [75, 0.022, 18], DIS: [100, 0.017, 10],
    SPY: [580, 0.008, 55], QQQ: [500, 0.011, 35], IWM: [220, 0.013, 25],
};
const FALLBACK = [100, 0.018, 10];
const DAY = 86400000;
function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const seedOf = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const gauss = (rnd) => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
const r2 = (n) => Math.round(n * 100) / 100;
const isoDay = (d) => d.toISOString().slice(0, 10);
const isWeekend = (d) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
function weekdaysBetween(after, upTo) {
    const out = [];
    for (let d = new Date(`${after}T12:00:00Z`);;) {
        d = new Date(d.getTime() + DAY);
        if (isoDay(d) > upTo)
            break;
        if (!isWeekend(d))
            out.push(isoDay(d));
    }
    return out;
}
export function lastCompletedWeekday(now = new Date()) {
    let d = new Date(`${newYorkDate(now)}T12:00:00Z`);
    do {
        d = new Date(d.getTime() - DAY);
    } while (isWeekend(d));
    return isoDay(d);
}
function weekdaysEndingAt(end, count) {
    const out = [];
    for (let d = new Date(`${end}T12:00:00Z`); out.length < count; d = new Date(d.getTime() - DAY))
        if (!isWeekend(d))
            out.push(isoDay(d));
    return out.reverse();
}
const KEEP = 260;
export function generateHistory(symbol, now = new Date(), days = KEEP) {
    const [base, vol] = BASE[symbol] ?? FALLBACK;
    const rnd = mulberry32(seedOf(symbol));
    const closeDates = weekdaysEndingAt(lastCompletedWeekday(now), days);
    let p = base;
    const raw = closeDates.map(() => (p *= Math.exp(gauss(rnd) * vol + 0.0003)));
    const k = (base * (0.96 + rnd() * 0.08)) / raw[raw.length - 1];
    return { closes: raw.map((v) => r2(v * k)), closeDates };
}
export function extendHistory(symbol, h, now = new Date()) {
    const target = lastCompletedWeekday(now);
    const last = h.closeDates[h.closeDates.length - 1];
    if (!last || h.closes.length < 30)
        return generateHistory(symbol, now);
    if (last >= target)
        return h;
    const missing = weekdaysBetween(last, target);
    if (missing.length > 60)
        return generateHistory(symbol, now);
    const [, vol] = BASE[symbol] ?? FALLBACK;
    const rnd = mulberry32(seedOf(symbol + target));
    const closes = [...h.closes], closeDates = [...h.closeDates];
    let p = closes[closes.length - 1];
    for (const day of missing) {
        p = r2(p * Math.exp(gauss(rnd) * vol + 0.0003));
        closes.push(p);
        closeDates.push(day);
    }
    return { closes: closes.slice(-KEEP), closeDates: closeDates.slice(-KEEP) };
}
export function nextQuote(symbol, lastClose, prev, now = new Date(), rnd = Math.random) {
    const [, vol, volumeM] = BASE[symbol] ?? FALLBACK;
    const p0 = prev?.price ?? lastClose;
    const sigma = (vol / Math.sqrt(390)) * 1.5;
    const pull = ((lastClose - p0) / lastClose) * 0.003;
    const price = Math.min(lastClose * 1.12, Math.max(lastClose * 0.88, p0 * Math.exp(gauss(rnd) * sigma + pull)));
    const sameDay = prev?.at && newYorkDate(prev.at) === newYorkDate(now);
    const start = sameDay && typeof prev?.volume === "number" ? prev.volume : Math.floor(volumeM * 1e6 * (newYorkMinutes(now) / 1440));
    const volume = start + Math.floor(((volumeM * 1e6) / 1440) * (0.5 + rnd()));
    return { price: r2(price), previousClose: lastClose, change: r2(price - lastClose), volume, marketOpen: true, at: now };
}
const STEP = 30 * 60000;
export function updateIntraday(list, price, now, symbol, lastClose) {
    let out = [...list];
    if (!out.length) {
        const rnd = mulberry32(seedOf(symbol + "intraday"));
        const [, vol] = BASE[symbol] ?? FALLBACK;
        let p = price;
        for (let i = 47; i >= 0; i--) {
            out.unshift({ at: new Date(now.getTime() - (47 - i) * STEP - 1), price: r2(p) });
            p = Math.max(lastClose * 0.9, p * Math.exp(gauss(rnd) * (vol / Math.sqrt(13))));
        }
    }
    const last = out[out.length - 1];
    if (!last || now.getTime() - last.at.getTime() >= STEP)
        out.push({ at: now, price });
    else
        out[out.length - 1] = { at: last.at, price };
    return out.slice(-48);
}
const labelOf = (d) => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });
export const intradayPoints = (list, now = new Date()) => (list ?? []).filter((p) => now.getTime() - p.at.getTime() <= 25 * 3600000).map((p) => ({ label: labelOf(p.at), price: p.price }));
//# sourceMappingURL=simulator.js.map