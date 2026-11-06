// Made-up prices for tests only. The app itself never invents prices.
export function makeCloses(n = 60, trend: "up" | "down" | "flat" = "up", start = 100): { closes: number[]; closeDates: string[] } {
  const closes = Array.from({ length: n }, (_, i) => +(start + (trend === "up" ? i * 0.6 : trend === "down" ? -i * 0.6 : 0) + Math.sin(i / 3) * 0.2).toFixed(2));
  const end = Date.UTC(2026, 9, 28);
  const closeDates = Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * 86400000).toISOString().slice(0, 10));
  return { closes, closeDates };
}

// Replaces fetch for one test file and remembers the calls
export type Handler = (url: URL, init?: RequestInit) => { status?: number; body: unknown } | undefined;
export function mockFetch(handler: Handler) {
  const real = globalThis.fetch;
  const calls: { url: URL; init?: RequestInit }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const out = handler(url, init);
    if (!out) return real(input, init);          // our own test server keeps working
    calls.push({ url, init });
    const status = out.status ?? 200;
    const empty = status === 204 || status === 205 || status === 304;       // these answers may not have a body
    return new Response(empty ? null : JSON.stringify(out.body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = real; } };
}
