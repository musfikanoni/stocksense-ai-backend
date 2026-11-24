import type { Analysis, Signal } from "../app/utils/signal.js";
import type { Point } from "../app/utils/history.js";

export interface Candle {
  date: string;
  close: number;
}

export interface RawTimeSeriesReply {
  meta?: {
    symbol?: string;
    interval?: string;
    currency?: string;
    exchange_timezone?: string;
    exchange?: string;
    type?: string;
  };
  values?: Array<{
    datetime: string;
    open?: string;
    high?: string;
    low?: string;
    close: string;
    volume?: string;
  }>;
  status?: string;
}

export interface NormalizedMarketData {
  symbol: string;
  candles: Candle[];
  closes: number[];
  closeDates: string[];
  analysis: Analysis | null;
  charts: {
    "1W": Point[];
    "1M": Point[];
    "1Y": Point[];
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Optimized technical analysis:
 * - Single-pass loop replaces .slice(), .reduce(), Math.min(...spread), Math.max(...spread)
 * - Zero intermediate array allocations
 */
function fastAnalyze(closes: number[]): Analysis {
  const n = closes.length;
  const last = closes[n - 1];

  let sum = 0;
  let min = closes[n - 30];
  let max = min;

  for (let i = n - 30; i < n; i++) {
    const val = closes[i];
    sum += val;
    if (val < min) min = val;
    if (val > max) max = val;
  }

  const avg = sum / 30;
  const vsAvg = ((last - avg) / avg) * 100;
  const c6 = closes[n - 6];
  const momentum = ((last - c6) / c6) * 100;
  const score = vsAvg * 0.6 + momentum * 0.4;

  const signal: Signal = score > 0.8 ? "Bullish" : score < -0.8 ? "Bearish" : "Neutral";
  const confidence = Math.min(95, Math.max(48, Math.round(48 + Math.abs(score) * 7)));
  const support = Math.round(min * 100) / 100;
  const resistance = Math.round(max * 100) / 100;
  const side = vsAvg >= 0 ? "above" : "below";
  const reason =
    signal === "Bullish"
      ? `Price is ${Math.abs(vsAvg).toFixed(1)}% ${side} its 30-day average with positive 5-day momentum.`
      : signal === "Bearish"
      ? `Price is ${Math.abs(vsAvg).toFixed(1)}% ${side} its 30-day average and momentum has turned negative.`
      : "Price is moving close to its 30-day average with no clear direction.";

  const clampScore = Math.min(8, Math.max(-8, score));
  return {
    signal,
    confidence,
    support,
    resistance,
    breakout: Math.round(resistance * 1.01 * 100) / 100,
    target: Math.round(last * (1 + clampScore / 100) * 100) / 100,
    reason,
  };
}

/**
 * Optimized series generation:
 * - Fast calendar lookup replaces repeated new Date().toLocaleDateString()
 * - Pre-allocated array avoids dynamic resizing
 */
function fastSeries(closes: number[], dates: string[], range: "1W" | "1M" | "1Y"): Point[] {
  const n = closes.length < dates.length ? closes.length : dates.length;
  if (range === "1W") {
    const count = n < 5 ? n : 5;
    const start = n - count;
    const points: Point[] = new Array(count);
    for (let k = 0; k < count; k++) {
      const idx = start + k;
      const d = dates[idx];
      const dayIdx = new Date(d + "T12:00:00Z").getUTCDay();
      points[k] = { label: DAYS[dayIdx], price: closes[idx] };
    }
    return points;
  }

  if (range === "1M") {
    const count = n < 22 ? n : 22;
    const start = n - count;
    const points: Point[] = new Array(count);
    for (let k = 0; k < count; k++) {
      const idx = start + k;
      const d = dates[idx];
      const mIdx = (d.charCodeAt(5) - 48) * 10 + (d.charCodeAt(6) - 48) - 1;
      const dayNum = (d.charCodeAt(8) - 48) * 10 + (d.charCodeAt(9) - 48);
      points[k] = { label: `${MONTHS[mIdx]} ${dayNum}`, price: closes[idx] };
    }
    return points;
  }

  // 1Y
  const points: Point[] = [];
  for (let m = 0; m < 12; m++) {
    const idx = n - 1 - (11 - m) * 21;
    if (idx >= 0) {
      const d = dates[idx];
      const mIdx = (d.charCodeAt(5) - 48) * 10 + (d.charCodeAt(6) - 48) - 1;
      points.push({ label: MONTHS[mIdx], price: closes[idx] });
    }
  }
  return points;
}

/**
 * Optimized normalizeMarketData:
 * 1. Single-pass reverse traversal replaces .map().filter().reverse().map().map()
 * 2. Inlines extraction of candles, closes, and closeDates in O(N)
 * 3. High-performance technical analysis without array slicing or spreading
 * 4. Microsecond date label formatting without ICU/Intl overhead
 */
export async function normalizeMarketData(rawData: RawTimeSeriesReply): Promise<NormalizedMarketData> {
  const rawValues = rawData.values ?? [];
  const rawLen = rawValues.length;

  const candles: Candle[] = [];
  const closes: number[] = [];
  const closeDates: string[] = [];

  // Single-pass reverse loop (O(N) time, zero intermediate throwaway arrays)
  for (let i = rawLen - 1; i >= 0; i--) {
    const row = rawValues[i];
    const closeNum = typeof row.close === "number" ? row.close : Number(row.close);
    if (Number.isFinite(closeNum)) {
      const date = row.datetime.length > 10 ? row.datetime.slice(0, 10) : row.datetime;
      candles.push({ date, close: closeNum });
      closes.push(closeNum);
      closeDates.push(date);
    }
  }

  // Optimized analysis & indicators
  const analysis = closes.length >= 30 ? fastAnalyze(closes) : null;

  // Optimized multi-timeframe chart generation
  const chart1W = fastSeries(closes, closeDates, "1W");
  const chart1M = fastSeries(closes, closeDates, "1M");
  const chart1Y = fastSeries(closes, closeDates, "1Y");

  return {
    symbol: rawData.meta?.symbol ?? "UNKNOWN",
    candles,
    closes,
    closeDates,
    analysis,
    charts: {
      "1W": chart1W,
      "1M": chart1M,
      "1Y": chart1Y,
    },
  };
}
