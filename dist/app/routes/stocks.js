import { Router } from "express";
import { env } from "../config/env.js";
import { jobState } from "../jobs/marketRefresh.js";
import { Stock } from "../models/Stock.js";
import { SIMULATED_LABEL, intradayPoints } from "../services/simulator.js";
import { PROVIDER_NAME, ProviderError, fetchIntraday, marketDataConfigured } from "../services/marketData.js";
import { AppError } from "../utils/AppError.js";
import { ah } from "../utils/asyncHandler.js";
import { series } from "../utils/history.js";
import { isMarketOpen } from "../utils/marketHours.js";
import { toView } from "../utils/stockView.js";
import { escapeRegex, oneOf, symbol as sym } from "../utils/validate.js";
const r = Router();
const find = async (raw) => {
    const s = await Stock.findOne({ symbol: sym(raw) });
    if (!s)
        throw new AppError(404, "Stock not found.");
    return s;
};
r.get("/", ah(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 40) : "";
    const filter = { kind: "stock" };
    if (q) {
        const rx = new RegExp(escapeRegex(q), "i");
        filter.$or = [{ symbol: rx }, { name: rx }];
    }
    res.json((await Stock.find(filter).sort({ symbol: 1 })).map(toView));
}));
r.get("/market/bias", ah(async (_req, res) => {
    const idx = await Stock.find({ kind: "index" }).sort({ symbol: 1 });
    res.json(idx.map((s) => { const v = toView(s); return { symbol: s.symbol, name: s.name, signal: v.signal, pct: v.confidence }; }));
}));
r.get("/market/status", ah(async (_req, res) => {
    const stocks = await Stock.find({}).select("closeDates quote");
    res.json({
        mode: env.marketMode, provider: env.marketMode === "simulated" ? "simulated" : PROVIDER_NAME,
        notice: env.marketMode === "simulated" ? SIMULATED_LABEL : null,
        configured: marketDataConfigured(), marketOpen: env.marketMode === "simulated" ? true : isMarketOpen(),
        stocksWithPrices: stocks.filter((s) => typeof s.quote?.price === "number" || s.closeDates.length > 0).length, stocksTotal: stocks.length,
        lastPriceRefresh: jobState.lastQuotes, lastHistoryRefresh: jobState.lastDaily,
    });
}));
r.get("/:symbol", ah(async (req, res) => { res.json(toView(await find(req.params.symbol))); }));
r.get("/:symbol/history", ah(async (req, res) => {
    const range = oneOf(req.query.range || "1M", ["1D", "1W", "1M", "1Y"], "range");
    const s = await find(req.params.symbol);
    if (range === "1D" && env.marketMode === "simulated") {
        const points = intradayPoints(s.intraday);
        if (points.length < 2)
            throw new AppError(503, "Prices are still being prepared. Try again in a minute.");
        return void res.json(points);
    }
    if (range === "1D") {
        try {
            const points = await fetchIntraday(s.symbol);
            if (!points.length)
                throw new AppError(503, "No intraday prices for this stock yet.");
            return void res.json(points);
        }
        catch (e) {
            if (e instanceof AppError)
                throw e;
            throw new AppError(503, e instanceof ProviderError ? e.message : "Intraday prices are not available right now.");
        }
    }
    if (s.closes.length < 5)
        throw new AppError(503, "Price history is not available yet. Try again in a few minutes.");
    res.json(series(s.closes, s.closeDates, range));
}));
const cache = new Map();
const ONE_HOUR = 3600000;
r.get("/:symbol/summary", ah(async (req, res) => {
    const s = await find(req.params.symbol);
    const v = toView(s);
    if (v.signal === null || v.price === null)
        throw new AppError(503, "There is no price data for this stock yet.");
    const key = `${s.symbol}:${v.signal}:${v.confidence}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ONE_HOUR)
        return void res.json({ summary: hit.text, source: hit.source });
    let text = `${v.symbol} shows a ${v.signal.toLowerCase()} signal with ${v.confidence}% confidence. ${v.reason} Support is near $${v.support} and resistance near $${v.resistance}. This is for learning, not financial advice.`;
    let source = "rules";
    if (env.geminiKey) {
        try {
            const prompt = `You explain stocks to beginners in an educational app. In 2 or 3 short sentences, explain this signal in plain English. Do not give financial advice or tell the reader to buy or sell.\nStock: ${v.name} (${v.symbol})\nPrice: $${v.price}\nSignal: ${v.signal} (${v.confidence}% confidence)\nReason: ${v.reason}\nSupport: $${v.support}  Resistance: $${v.resistance}`;
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.geminiModel}:generateContent`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-goog-api-key": env.geminiKey },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                signal: AbortSignal.timeout(8000),
            });
            const data = (await resp.json());
            const out = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (resp.ok && out) {
                text = out;
                source = "gemini";
            }
        }
        catch (e) {
            console.warn("Gemini request failed, using rule-based summary:", e.message);
        }
    }
    cache.set(key, { text, source, at: Date.now() });
    res.json({ summary: text, source });
}));
export default r;
//# sourceMappingURL=stocks.js.map