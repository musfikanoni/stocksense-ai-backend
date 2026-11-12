import { env } from "../config/env.js";
import { analyze } from "./signal.js";
const formatVolume = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : String(v));
const r2 = (n) => Math.round(n * 100) / 100;
function analysisCloses(s) {
    const q = s.quote;
    const lastDate = s.closeDates[s.closeDates.length - 1];
    if (typeof q?.price === "number" && q.at && lastDate && q.at.toISOString().slice(0, 10) > lastDate)
        return [...s.closes, q.price];
    return s.closes;
}
export function toView(s) {
    const q = s.quote;
    const n = s.closes.length;
    const live = typeof q?.price === "number" && typeof q.previousClose === "number";
    const price = live ? q.price : n ? s.closes[n - 1] : null;
    const change = live ? r2((q.change ?? q.price - q.previousClose)) : n > 1 ? r2(s.closes[n - 1] - s.closes[n - 2]) : null;
    const base = live ? q.previousClose : n > 1 ? s.closes[n - 2] : null;
    const closes = analysisCloses(s);
    const a = closes.length >= 30 ? analyze(closes) : null;
    const vol = typeof q?.volume === "number" ? q.volume : null;
    return {
        symbol: s.symbol, name: s.name, exchange: s.exchange,
        logoUrl: `https://assets.parqet.com/logos/symbol/${s.symbol}`,
        price, change, changePct: change !== null && base ? r2((change / base) * 100) : null,
        volume: vol !== null ? formatVolume(vol) : null, volumeM: vol !== null ? vol / 1e6 : null,
        asOf: (q?.at ?? s.dailyUpdatedAt)?.toISOString() ?? null, marketOpen: typeof q?.marketOpen === "boolean" ? q.marketOpen : null,
        signal: a?.signal ?? null, confidence: a?.confidence ?? null, support: a?.support ?? null, resistance: a?.resistance ?? null,
        breakout: a?.breakout ?? null, target: a?.target ?? null, reason: a?.reason ?? null,
        dataSource: env.marketMode === "simulated" ? "simulated" : "Twelve Data",
    };
}
//# sourceMappingURL=stockView.js.map