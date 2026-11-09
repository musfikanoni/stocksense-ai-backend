import { env } from "../config/env.js";
import { Stock } from "../models/Stock.js";
import { extendHistory, nextQuote, updateIntraday } from "../services/simulator.js";
import { ProviderError, fetchDaily, fetchQuote } from "../services/marketData.js";
import { isMarketOpen, newYorkDate } from "../utils/marketHours.js";

export const jobState = {
  lastQuotes: null as Date | null,
  lastDaily: null as Date | null,
  lastQuoteResult: null as { ok: number; failed: number } | null,
  lastDailyResult: null as { ok: number; failed: number } | null,
  lastError: null as string | null,
};

const symbolsFilter = (symbols?: string[]) => (symbols ? { symbol: { $in: symbols } } : {});


async function simulateDaily(symbols?: string[], now = new Date()): Promise<{ ok: number; failed: number }> {
  const stocks = await Stock.find(symbolsFilter(symbols));
  for (const s of stocks) {
    const h = extendHistory(s.symbol, { closes: [...s.closes], closeDates: [...s.closeDates] }, now);
    await Stock.updateOne({ _id: s._id }, { $set: { closes: h.closes, closeDates: h.closeDates, dailyUpdatedAt: now } });
  }
  jobState.lastDaily = now;
  jobState.lastDailyResult = { ok: stocks.length, failed: 0 };
  return jobState.lastDailyResult;
}

async function simulateQuotes(symbols?: string[], now = new Date()): Promise<{ ok: number; failed: number }> {
  const stocks = await Stock.find(symbolsFilter(symbols));
  let ok = 0;
  for (const s of stocks) {
    if (s.closes.length < 30) continue;                     
    const lastClose = s.closes[s.closes.length - 1];
    const q = nextQuote(s.symbol, lastClose, s.quote ?? undefined, now);
    const intraday = updateIntraday((s.intraday ?? []).map((p) => ({ at: p.at, price: p.price })), q.price, now, s.symbol, lastClose);
    await Stock.updateOne({ _id: s._id }, { $set: { quote: q, intraday } });
    ok++;
  }
  jobState.lastQuotes = now;
  jobState.lastQuoteResult = { ok, failed: 0 };
  return jobState.lastQuoteResult;
}


export async function refreshQuotes(symbols?: string[], now = new Date()): Promise<{ ok: number; failed: number }> {
  if (env.marketMode === "simulated") return simulateQuotes(symbols, now);
  const stocks = await Stock.find(symbolsFilter(symbols)).sort({ symbol: 1 });
  let ok = 0, failed = 0;
  for (const s of stocks) {
    try {
      const q = await fetchQuote(s.symbol);
      await Stock.updateOne({ _id: s._id }, { $set: { quote: { price: q.price, previousClose: q.previousClose, change: q.change, volume: q.volume, marketOpen: q.marketOpen, at: q.at }, ...(q.exchange && { exchange: q.exchange }) } });
      ok++;
    } catch (e) {
      failed++;
      jobState.lastError = `${s.symbol}: ${(e as Error).message}`;
      console.warn(`Price refresh failed for ${s.symbol}: ${(e as Error).message}`);
      if (e instanceof ProviderError && e.code === 429) break;      
    }
  }
  jobState.lastQuotes = new Date();
  jobState.lastQuoteResult = { ok, failed };
  return { ok, failed };
}


export async function refreshDaily(symbols?: string[], now = new Date()): Promise<{ ok: number; failed: number }> {
  if (env.marketMode === "simulated") return simulateDaily(symbols, now);
  const stocks = await Stock.find(symbolsFilter(symbols)).sort({ symbol: 1 });
  let ok = 0, failed = 0;
  for (const s of stocks) {
    try {
      const candles = await fetchDaily(s.symbol);
      
      if (isMarketOpen() && candles[candles.length - 1]?.date === newYorkDate()) candles.pop();
      if (candles.length < 30) throw new Error(`only ${candles.length} daily prices returned`);
      await Stock.updateOne({ _id: s._id }, { $set: { closes: candles.map((c) => c.close), closeDates: candles.map((c) => c.date), dailyUpdatedAt: new Date() } });
      ok++;
    } catch (e) {
      failed++;
      jobState.lastError = `${s.symbol}: ${(e as Error).message}`;
      console.warn(`Daily prices failed for ${s.symbol}: ${(e as Error).message}`);
      if (e instanceof ProviderError && e.code === 429) break;
    }
  }
  jobState.lastDaily = new Date();
  jobState.lastDailyResult = { ok, failed };
  return { ok, failed };
}
