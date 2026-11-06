import { Router } from "express";
import { me, requireAuth } from "../middleware/auth.js";
import { Alert } from "../models/Alert.js";
import { Stock } from "../models/Stock.js";
import { ah } from "../utils/asyncHandler.js";
import type { Signal } from "../utils/signal.js";
import { toView, type StockView } from "../utils/stockView.js";

const r = Router();
r.use(requireAuth);
const avg = (a: number[]) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);
type Analysed = StockView & { signal: Signal; confidence: number };
const analysed = (v: StockView): v is Analysed => v.signal !== null && v.confidence !== null;

r.get("/", ah(async (req, res) => {
  const views = (await Stock.find({ kind: "stock" })).map(toView).filter(analysed);
  const by = (sig: Signal) => views.filter((v) => v.signal === sig);
  const top = [...by("Bullish")].sort((a, b) => b.confidence - a.confidence);
  const lead = top[0] ?? [...views].sort((a, b) => b.confidence - a.confidence)[0];
  const alerts = await Alert.find({ user: me(req)._id }).sort({ createdAt: -1 }).limit(5);

  res.json({
    topOpportunities: top.slice(0, 5).map((v) => ({ symbol: v.symbol, name: v.name, signal: v.signal, confidence: v.confidence, target: v.target })),
    outlook: lead ? {
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      summary: `${by("Bullish").length} of ${views.length} tracked stocks show bullish setups. ${lead.symbol} has the strongest signal at ${lead.confidence}% confidence.`,
      bias: avg(top.map((v) => v.confidence)), confidence: avg(views.map((v) => v.confidence)),
      bullish: by("Bullish").length, neutral: by("Neutral").length, bearish: by("Bearish").length, reason: lead.reason,
    } : null,
    highConfidence: lead ? { symbol: lead.symbol, name: lead.name, label: lead.signal === "Bullish" && lead.confidence >= 75 ? "Strong Buy" : lead.signal, reason: lead.reason } : null,
    recentAlerts: alerts.map((a) => ({ id: String(a._id), symbol: a.symbol, kind: a.kind, value: a.value, active: a.active, lastTriggeredAt: a.lastTriggeredAt ?? null })),
    dataReady: views.length > 0,
  });
}));

export default r;
