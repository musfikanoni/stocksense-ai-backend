import { Router } from "express";
import type { FilterQuery, HydratedDocument } from "mongoose";
import { FREE_LIMITS } from "../config/env.js";
import { me, requireAuth } from "../middleware/auth.js";
import { Alert, type AlertKind, type IAlert } from "../models/Alert.js";
import { Stock } from "../models/Stock.js";
import { toView, type StockView } from "../utils/stockView.js";
import { AppError } from "../utils/AppError.js";
import { ah } from "../utils/asyncHandler.js";
import type { Signal } from "../utils/signal.js";
import { oneOf, symbol as sym } from "../utils/validate.js";

const r = Router();
r.use(requireAuth);

const KINDS = ["price", "breakout", "signal", "volume"] as const;
const CHANNELS = ["email", "push", "discord"] as const;

// price, breakout and volume need a positive number. signal needs Bullish, Neutral or Bearish.
function condition(kind: AlertKind, value: unknown): number | Signal {
  if (kind === "signal")
    return oneOf(value, ["Bullish", "Neutral", "Bearish"] as const, "Signal");
  const n =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000)
    throw new AppError(400, `The ${kind} alert needs a positive number.`);
  return n;
}

// "Armed" means: from now on, wait for the price to reach the target from the side it is on today
function arm(
  a: {
    kind: AlertKind;
    value: number | Signal;
    direction?: "above" | "below";
    lastSeen?: string;
  },
  view: StockView,
): void {
  if (a.kind === "price" || a.kind === "breakout")
    a.direction =
      typeof a.value === "number" && view.price !== null && a.value < view.price
        ? "below"
        : "above";
  if (a.kind === "signal" && view.signal) a.lastSeen = view.signal;
}

const withNames = async (alerts: HydratedDocument<IAlert>[]) => {
  const stocks = await Stock.find({
    symbol: { $in: [...new Set(alerts.map((a) => a.symbol))] },
  });
  return alerts.map((a) => ({
    ...a.toJSON(),
    name: stocks.find((s) => s.symbol === a.symbol)?.name ?? "",
  }));
};

r.get(
  "/",
  ah(async (req, res) => {
    const filter: FilterQuery<IAlert> = { user: me(req)._id };
    if (req.query.status === "active") filter.active = true;
    if (req.query.status === "disabled") filter.active = false;
    res.json(await withNames(await Alert.find(filter).sort({ createdAt: -1 })));
  }),
);


r.post(
  "/",
  ah(async (req, res) => {
    const user = me(req);
    const b = req.body || {};
    const s = sym(b.symbol);
    const stock = await Stock.findOne({ symbol: s, kind: "stock" });
    if (!stock) throw new AppError(404, "Stock not found.");
    const view = toView(stock);
    const conds = KINDS.filter(
      (k) => b.conditions?.[k] !== undefined && b.conditions[k] !== null,
    );
    if (!conds.length)
      throw new AppError(400, "Choose at least one alert type.");
    const channels = Object.fromEntries(
      CHANNELS.map((c) => [c, b.channels?.[c] === true]),
    ) as IAlert["channels"];
    if (user.planName === "Free") {
      const have = await Alert.countDocuments({ user: user._id });
      if (have + conds.length > FREE_LIMITS.alerts)
        throw new AppError(
          403,
          `The Free plan allows ${FREE_LIMITS.alerts} alerts. Upgrade to Premium for unlimited.`,
        );
    }
    const rows = conds.map((k) => {
      const row: {
        user: typeof user._id;
        symbol: string;
        kind: AlertKind;
        value: number | Signal;
        channels: IAlert["channels"];
        direction?: "above" | "below";
        lastSeen?: string;
      } = {
        user: user._id,
        symbol: s,
        kind: k,
        value: condition(k, b.conditions[k]),
        channels,
      };
      arm(row, view);
      return row;
    });
    const docs = await Alert.create(rows);
    res.status(201).json(await withNames(docs));
  }),
);

r.patch(
  "/:id",
  ah(async (req, res) => {
    const a = await Alert.findOne({ _id: req.params.id, user: me(req)._id });
    if (!a) throw new AppError(404, "Alert not found.");
    const b = req.body || {};
    if (b.kind !== undefined) a.kind = oneOf(b.kind, KINDS, "Kind");
    if (b.value !== undefined || b.kind !== undefined)
      a.value = condition(a.kind, b.value !== undefined ? b.value : a.value);
    const rearmed =
      (typeof b.active === "boolean" && b.active && !a.active) ||
      b.value !== undefined ||
      b.kind !== undefined;
    if (typeof b.active === "boolean") a.active = b.active;
    if (rearmed) {
      const stock = await Stock.findOne({ symbol: a.symbol });
      if (stock) arm(a, toView(stock));
      if (a.active) a.lastTriggeredAt = undefined;
    }
    if (b.channels && typeof b.channels === "object")
      for (const c of CHANNELS)
        if (typeof b.channels[c] === "boolean") a.channels[c] = b.channels[c];
    await a.save();
    res.json((await withNames([a]))[0]);
  }),
);

r.delete(
  "/:id",
  ah(async (req, res) => {
    const out = await Alert.deleteOne({
      _id: req.params.id,
      user: me(req)._id,
    });
    if (!out.deletedCount) throw new AppError(404, "Alert not found.");
    res.json({ message: "Alert deleted." });
  }),
);

export default r;
