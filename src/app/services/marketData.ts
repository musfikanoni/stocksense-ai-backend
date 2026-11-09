import { env } from "../config/env.js";
import { TokenBucket } from "../utils/rateLimiter.js";


export const PROVIDER_NAME = "Twelve Data";
const BASE = "https://api.twelvedata.com";
const DAILY_LIMIT = 800;
const DAILY_SAFETY = 40;      

export class ProviderError extends Error {
  code: number;
  constructor(code: number, message: string) { super(message); this.code = code; }
}

export interface Quote { price: number; previousClose: number; change: number; volume: number | null; marketOpen: boolean; exchange?: string; at: Date }
export interface Candle { date: string; close: number }
export interface IntradayPoint { label: string; price: number }

const bucket = new TokenBucket(7, 7);                
const usage = { day: "", used: 0 };
const today = () => new Date().toISOString().slice(0, 10);
function count(): void {
  if (usage.day !== today()) { usage.day = today(); usage.used = 0; }
  usage.used += 1;
}
export const requestsUsedToday = () => (usage.day === today() ? usage.used : 0);

export const marketDataConfigured = () => env.marketMode === "simulated" || Boolean(env.twelveDataKey);
export const dailyBudgetLeft = () => DAILY_LIMIT - DAILY_SAFETY - requestsUsedToday();

const num = (v: unknown): number | null => {
  const x = typeof v === "string" || typeof v === "number" ? Number(v) : NaN;
  return Number.isFinite(x) ? x : null;
};

interface ApiReply { status?: string; code?: number; message?: string }


async function get<T extends ApiReply>(path: string, params: Record<string, string>, background: boolean): Promise<T> {
  if (!env.twelveDataKey) throw new ProviderError(503, "Market data is not set up on this server.");
  if (background) {
    if (dailyBudgetLeft() <= 0) throw new ProviderError(429, "Daily request limit of the price provider reached.");
    await bucket.take(2);
  } else if (!bucket.tryTake()) throw new ProviderError(429, "Too many price requests right now. Try again in a minute.");
  count();
  const res = await fetch(`${BASE}${path}?${new URLSearchParams({ ...params, apikey: env.twelveDataKey })}`, { signal: AbortSignal.timeout(10000) });
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok || data.status === "error") throw new ProviderError(data.code ?? res.status, data.message ?? `Price provider answered ${res.status}`);
  return data;
}

interface TdQuote extends ApiReply { close?: string; previous_close?: string; change?: string; volume?: string; is_market_open?: boolean; exchange?: string; timestamp?: number }
export async function fetchQuote(symbol: string, background = true): Promise<Quote> {
  const q = await get<TdQuote>("/quote", { symbol }, background);
  const price = num(q.close);
  const previousClose = num(q.previous_close);
  if (price === null || previousClose === null) throw new ProviderError(502, `The provider has no price for ${symbol}.`);
  return {
    price, previousClose, change: num(q.change) ?? price - previousClose, volume: num(q.volume), marketOpen: q.is_market_open === true,
    exchange: q.exchange, at: typeof q.timestamp === "number" ? new Date(q.timestamp * 1000) : new Date(),
  };
}

interface TdSeries extends ApiReply { values?: { datetime: string; close: string }[] }

export async function fetchDaily(symbol: string, background = true): Promise<Candle[]> {
  const d = await get<TdSeries>("/time_series", { symbol, interval: "1day", outputsize: "260" }, background);
  return (d.values ?? [])
    .map((v) => ({ date: v.datetime.slice(0, 10), close: num(v.close) }))
    .filter((c): c is Candle => c.close !== null)
    .reverse();
}


const intradayCache = new Map<string, { at: number; points: IntradayPoint[] }>();
export async function fetchIntraday(symbol: string): Promise<IntradayPoint[]> {
  const hit = intradayCache.get(symbol);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.points;
  const d = await get<TdSeries>("/time_series", { symbol, interval: "30min", outputsize: "14" }, false);
  const values = d.values ?? [];
  const day = values[0]?.datetime.slice(0, 10);
  const points = values
    .filter((v) => v.datetime.slice(0, 10) === day)
    .map((v) => ({ label: v.datetime.slice(11, 16), price: num(v.close) }))
    .filter((p): p is IntradayPoint => p.price !== null)
    .reverse();
  intradayCache.set(symbol, { at: Date.now(), points });
  return points;
}
