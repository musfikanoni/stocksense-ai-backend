import { env } from "../config/env.js";
import { Alert } from "../models/Alert.js";
import { Notification } from "../models/Notification.js";
import { Stock } from "../models/Stock.js";
import { User } from "../models/User.js";
import { postToDiscord } from "../services/discord.js";
import { alertEmail } from "../services/emails.js";
import { sendMail } from "../services/mailer.js";
import { toView } from "../utils/stockView.js";
export function shouldFire(a, v) {
    switch (a.kind) {
        case "price":
        case "breakout":
            if (v.price === null || typeof a.value !== "number")
                return false;
            return a.direction === "below" ? v.price <= a.value : v.price >= a.value;
        case "signal":
            return v.signal !== null && v.signal === a.value && a.lastSeen !== v.signal; // only when it TURNS into this signal
        case "volume":
            return v.volumeM !== null && typeof a.value === "number" && v.volumeM >= a.value;
    }
}
export function describeAlert(a, v) {
    const price = v.price === null ? "" : `$${v.price.toFixed(2)}`;
    switch (a.kind) {
        case "price":
            return { title: `${v.symbol} reached $${a.value}`, body: `${v.name} is now ${price} (your alert: price at or ${a.direction === "below" ? "below" : "above"} $${a.value}).` };
        case "breakout":
            return { title: `${v.symbol} broke out`, body: `${v.name} is now ${price}, past your breakout level of $${a.value}.` };
        case "signal":
            return { title: `${v.symbol} signal turned ${v.signal}`, body: `The signal for ${v.name} is now ${v.signal} with ${v.confidence}% confidence. ${v.reason ?? ""}`.trim() };
        case "volume":
            return { title: `${v.symbol} volume passed ${a.value}M`, body: `Trading volume for ${v.name} is ${v.volume} (your alert: ${a.value}M).` };
    }
}
async function fire(alert, user, view) {
    const described = describeAlert(alert, view);
    const title = described.title;
    const body = env.marketMode === "simulated" ? `${described.body} (Simulated price, not real market data.)` : described.body;
    alert.active = false;
    alert.lastTriggeredAt = new Date();
    await alert.save();
    await Notification.create({ user: user._id, title, body, symbol: alert.symbol });
    if (alert.channels.email) {
        try {
            await sendMail({ to: user.email, ...alertEmail(title, body) });
        }
        catch (e) {
            console.warn(`Alert email to user ${user.id} failed: ${e.message}`);
        }
    }
    if (alert.channels.discord && user.discordWebhookUrl) {
        try {
            await postToDiscord(user.discordWebhookUrl, `**${title}**\n${body}\n${env.clientUrl}/alerts`);
        }
        catch (e) {
            console.warn(`Alert Discord post for user ${user.id} failed: ${e.message}`);
        }
    }
}
export async function evaluateAlerts(opts) {
    const alerts = await Alert.find({ active: true });
    if (!alerts.length)
        return { checked: 0, fired: 0 };
    const [users, stocks] = await Promise.all([
        User.find({ _id: { $in: [...new Set(alerts.map((a) => String(a.user)))] } }),
        Stock.find({ symbol: { $in: [...new Set(alerts.map((a) => a.symbol))] } }),
    ]);
    const userById = new Map(users.map((u) => [String(u._id), u]));
    const viewBySymbol = new Map(stocks.map((s) => [s.symbol, toView(s)]));
    let checked = 0, fired = 0;
    for (const alert of alerts) {
        const user = userById.get(String(alert.user));
        const view = viewBySymbol.get(alert.symbol);
        if (!user || user.blocked || !view)
            continue;
        if (!opts.includeFree && user.planName === "Free")
            continue;
        checked++;
        if (shouldFire(alert, view)) {
            await fire(alert, user, view);
            fired++;
        }
        else if (alert.kind === "signal" && view.signal && alert.lastSeen !== view.signal) {
            alert.lastSeen = view.signal;
            await alert.save();
        }
    }
    return { checked, fired };
}
//# sourceMappingURL=alerts.js.map