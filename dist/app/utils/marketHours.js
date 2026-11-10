function newYork(d) {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
    return { weekday: p.weekday, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
export const newYorkMinutes = (d) => newYork(d).minutes;
export const isWeekday = (d) => !["Sat", "Sun"].includes(newYork(d).weekday);
export function isMarketOpen(d = new Date()) {
    const { minutes } = newYork(d);
    return isWeekday(d) && minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}
export const afterClose = (d = new Date()) => isWeekday(d) && newYork(d).minutes >= 16 * 60 + 30;
export const newYorkDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
//# sourceMappingURL=marketHours.js.map