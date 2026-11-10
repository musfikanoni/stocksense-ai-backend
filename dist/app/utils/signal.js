const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const r2 = (n) => Math.round(n * 100) / 100;
export function analyze(closes) {
    const n = closes.length;
    const last = closes[n - 1];
    const month = closes.slice(-30);
    const avg = mean(month);
    const vsAvg = ((last - avg) / avg) * 100;
    const momentum = ((last - closes[n - 6]) / closes[n - 6]) * 100;
    const score = vsAvg * 0.6 + momentum * 0.4;
    const signal = score > 0.8 ? "Bullish" : score < -0.8 ? "Bearish" : "Neutral";
    const confidence = clamp(Math.round(48 + Math.abs(score) * 7), 48, 95);
    const support = r2(Math.min(...month));
    const resistance = r2(Math.max(...month));
    const side = vsAvg >= 0 ? "above" : "below";
    const reason = {
        Bullish: `Price is ${Math.abs(vsAvg).toFixed(1)}% ${side} its 30-day average with positive 5-day momentum.`,
        Bearish: `Price is ${Math.abs(vsAvg).toFixed(1)}% ${side} its 30-day average and momentum has turned negative.`,
        Neutral: "Price is moving close to its 30-day average with no clear direction.",
    }[signal];
    return { signal, confidence, support, resistance, breakout: r2(resistance * 1.01), target: r2(last * (1 + clamp(score, -8, 8) / 100)), reason };
}
//# sourceMappingURL=signal.js.map