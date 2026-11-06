import { Stock } from "../models/Stock.js";
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

// Latest price, change and volume for every stock
export async function refreshQuotes(symbols?: string[]): Promise<{ ok: number; failed: number }> {
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
      if (e instanceof ProviderError && e.code === 429) break;       // out of requests, no point asking more
    }
  }
  jobState.lastQuotes = new Date();
  jobState.lastQuoteResult = { ok, failed };
  return { ok, failed };
}

// About a year of daily closes for every stock (the chart and the signal use these)
export async function refreshDaily(symbols?: string[]): Promise<{ ok: number; failed: number }> {
  const stocks = await Stock.find(symbolsFilter(symbols)).sort({ symbol: 1 });
  let ok = 0, failed = 0;
  for (const s of stocks) {
    try {
      const candles = await fetchDaily(s.symbol);
      // While the market is open the newest bar is today's unfinished one, so we leave it out
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
