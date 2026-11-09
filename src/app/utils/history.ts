
export type Range = "1D" | "1W" | "1M" | "1Y";
export interface Point {
  label: string;
  price: number;
}


const fmt = (date: string, o: Intl.DateTimeFormatOptions) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });

export function series(closes: number[], dates: string[], range: "1W" | "1M" | "1Y"): Point[] {
  const n = Math.min(closes.length, dates.length);
  const at = (i: number, o: Intl.DateTimeFormatOptions): Point => ({ label: fmt(dates[i], o), price: closes[i] });
  if (range === "1W") return Array.from({ length: Math.min(5, n) }, (_, k) => at(n - Math.min(5, n) + k, { weekday: "short" }));
  if (range === "1M") return Array.from({ length: Math.min(22, n) }, (_, k) => at(n - Math.min(22, n) + k, { month: "short", day: "numeric" }));

  const idx = Array.from({ length: 12 }, (_, m) => n - 1 - (11 - m) * 21).filter((i) => i >= 0);
  return idx.map((i) => at(i, { month: "short" }));
}
