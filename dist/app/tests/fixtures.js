// Made-up prices for tests only. The app itself never invents prices.
export function makeCloses(n = 60, trend = "up", start = 100) {
    const closes = Array.from({ length: n }, (_, i) => +(start + (trend === "up" ? i * 0.6 : trend === "down" ? -i * 0.6 : 0) + Math.sin(i / 3) * 0.2).toFixed(2));
    const end = Date.UTC(2026, 9, 28);
    const closeDates = Array.from({ length: n }, (_, i) => new Date(end - (n - 1 - i) * 86400000).toISOString().slice(0, 10));
    return { closes, closeDates };
}
export function mockFetch(handler) {
    const real = globalThis.fetch;
    const calls = [];
    globalThis.fetch = (async (input, init) => {
        const url = new URL(String(input));
        const out = handler(url, init);
        if (!out)
            return real(input, init); // our own test server keeps working
        calls.push({ url, init });
        const status = out.status ?? 200;
        const empty = status === 204 || status === 205 || status === 304; // these answers may not have a body
        return new Response(empty ? null : JSON.stringify(out.body), { status, headers: { "Content-Type": "application/json" } });
    });
    return { calls, restore: () => { globalThis.fetch = real; } };
}
//# sourceMappingURL=fixtures.js.map