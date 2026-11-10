import { env } from "../config/env.js";
import { Stock } from "../models/Stock.js";
import { marketDataConfigured } from "../services/marketData.js";
import { lastCompletedWeekday } from "../services/simulator.js";
import { afterClose, isMarketOpen, newYorkDate } from "../utils/marketHours.js";
import { evaluateAlerts } from "./alerts.js";
import { jobState, refreshDaily, refreshQuotes } from "./marketRefresh.js";

const HOUR = 3600000;
let running = false;
let warned = false;
let lastEndOfDay: string | null = null;

export async function dailyDue(now: Date): Promise<boolean> {
  const stocks = await Stock.find({}).select(
    "symbol closeDates dailyUpdatedAt",
  );
  if (!stocks.length) return false;
  if (stocks.some((s) => s.closeDates.length < 30)) return true;
  if (env.marketMode === "simulated") {
    const target = lastCompletedWeekday(now);
    return stocks.some(
      (s) => (s.closeDates[s.closeDates.length - 1] ?? "") < target,
    );
  }
  const oldest = Math.min(
    ...stocks.map((s) => s.dailyUpdatedAt?.getTime() ?? 0),
  );
  return afterClose(now) && now.getTime() - oldest > 18 * HOUR;
}

export const quotesDue = (now: Date) => {
  if (!jobState.lastQuotes) return true;
  const age = now.getTime() - jobState.lastQuotes.getTime();
  return env.marketMode === "simulated"
    ? age >= 60000
    : isMarketOpen(now) && age >= env.quoteRefreshMinutes * 60000;
};

export const endOfDayDue = (now: Date) =>
  afterClose(now) && lastEndOfDay !== newYorkDate(now);

export async function tick(now = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    // if (!marketDataConfigured()) {
    //   if (!warned) { console.warn("TWELVE_DATA_API_KEY is not set: prices will not be fetched. (Set MARKET_DATA_MODE=simulated for simulated prices.)"); warned = true; }
    //   return;
    // }

    if (env.marketMode === "live" && !marketDataConfigured()) {
      if (!warned) {
        console.warn(
          "TWELVE_DATA_API_KEY is not set: live market prices will not be fetched.",
        );
        warned = true;
      }
      return;
    }
    if (await dailyDue(now)) {
      const r = await refreshDaily(undefined, now);
      console.log(`Daily prices ready: ${r.ok} ok, ${r.failed} failed`);
    }
    if (quotesDue(now)) {
      const r = await refreshQuotes(undefined, now);
      if (env.marketMode !== "simulated")
        console.log(`Prices refreshed: ${r.ok} ok, ${r.failed} failed`);
      const a = await evaluateAlerts({ includeFree: false });
      if (a.fired) console.log(`Alerts: ${a.fired} fired`);
    }
    if (endOfDayDue(now)) {
      lastEndOfDay = newYorkDate(now);
      const a = await evaluateAlerts({ includeFree: true });
      if (a.fired) console.log(`End-of-day alerts: ${a.fired} fired`);
    }
  } catch (e) {
    jobState.lastError = (e as Error).message;
    console.error("Background job failed:", e);
  } finally {
    running = false;
  }
}

export function startJobs(): NodeJS.Timeout {
  console.log(
    `Background jobs started (${env.marketMode} prices, alert checks).`,
  );
  void tick();
  return setInterval(() => void tick(), 60000);
}
