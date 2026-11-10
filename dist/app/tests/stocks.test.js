// Stock, alert, notification and account-setting routes, using stocks with real-looking (made up) data.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { makeCloses, mockFetch } from "./fixtures.js";
import { boot, skipDb } from "./helpers.js";
describe("stock routes", { skip: skipDb && "set TEST_MONGODB_URI to run database tests" }, () => {
    let t;
    let Stock, User, Notification;
    const SYM = "ZSA", EMPTY = "ZSB";
    const mailAndDiscord = [];
    let m;
    const createdUsers = [];
    before(async () => {
        t = await boot({ SHOW_DEV_OTP: "true" });
        ({ Stock } = await import("../models/Stock.js"));
        ({ User } = await import("../models/User.js"));
        ({ Notification } = await import("../models/Notification.js"));
        await Stock.updateOne({ symbol: SYM }, { $set: { name: "Stock Test Co", kind: "stock", exchange: "NASDAQ", ...makeCloses(300, "up"), dailyUpdatedAt: new Date(), quote: { price: 280, previousClose: 278.5, change: 1.5, volume: 24_100_000, marketOpen: false, at: new Date() } } }, { upsert: true });
        await Stock.updateOne({ symbol: EMPTY }, { $set: { name: "No Data Co", kind: "stock", exchange: "NASDAQ", closes: [], closeDates: [] }, $unset: { quote: "" } }, { upsert: true });
        m = mockFetch((url, init) => { if (url.hostname === "discord.com") {
            mailAndDiscord.push(JSON.parse(String(init?.body)));
            return { status: 204, body: {} };
        } });
    });
    after(async () => {
        m?.restore();
        await Stock?.deleteMany({ symbol: { $in: [SYM, EMPTY] } });
        await User?.deleteMany({ _id: { $in: createdUsers } });
        await t?.close();
    });
    const user = async (label) => { const u = await t.signup(label); createdUsers.push(u.id); return u; };
    describe("stocks", () => {
        it("shows real numbers for a stock with data", async () => {
            const r = await t.call("GET", `/stocks/${SYM}`);
            assert.equal(r.status, 200);
            assert.equal(r.data.price, 280);
            assert.equal(r.data.change, 1.5);
            assert.equal(r.data.changePct, 0.54);
            assert.equal(r.data.volume, "24.1M");
            assert.equal(r.data.signal, "Bullish");
            assert.ok(r.data.support < r.data.price && r.data.resistance >= r.data.support && r.data.asOf);
        });
        it("shows nulls, not made-up numbers, for a stock with no data", async () => {
            const r = await t.call("GET", `/stocks/${EMPTY}`);
            assert.equal(r.status, 200);
            for (const k of ["price", "change", "volume", "signal", "confidence", "support", "asOf"])
                assert.equal(r.data[k], null, k);
        });
        it("lists stocks, searches, and refuses odd symbols", async () => {
            const all = await t.call("GET", "/stocks");
            assert.ok(all.data.some((s) => s.symbol === SYM));
            assert.deepEqual((await t.call("GET", "/stocks?q=stock%20test")).data.map((s) => s.symbol), [SYM]);
            assert.equal((await t.call("GET", "/stocks/ZZZZZ")).status, 404);
            assert.equal((await t.call("GET", "/stocks/A$B")).status, 400);
        });
        it("gives chart points for 1W, 1M and 1Y, and refuses a bad range", async () => {
            for (const [range, n] of [["1W", 5], ["1M", 22], ["1Y", 12]])
                assert.equal((await t.call("GET", `/stocks/${SYM}/history?range=${range}`)).data.length, n);
            assert.equal((await t.call("GET", `/stocks/${SYM}/history?range=5Y`)).status, 400);
        });
        it("says so when there is no history or no intraday source", async () => {
            assert.equal((await t.call("GET", `/stocks/${EMPTY}/history?range=1M`)).status, 503);
            assert.equal((await t.call("GET", `/stocks/${SYM}/history?range=1D`)).status, 503); // no price provider key in this test
        });
        it("explains the signal, and refuses when there is no data", async () => {
            const ok = await t.call("GET", `/stocks/${SYM}/summary`);
            assert.equal(ok.status, 200);
            assert.equal(ok.data.source, "rules");
            assert.match(ok.data.summary, /bullish/);
            assert.equal((await t.call("GET", `/stocks/${EMPTY}/summary`)).status, 503);
        });
        it("reports where the prices come from", async () => {
            const r = await t.call("GET", "/stocks/market/status");
            assert.equal(r.data.provider, "Twelve Data");
            assert.equal(typeof r.data.configured, "boolean");
            assert.ok(r.data.stocksTotal >= 2);
        });
        it("fills the dashboard from the stocks that have data", async () => {
            const u = await user("dash");
            const r = await t.call("GET", "/dashboard", { token: u.token });
            assert.equal(r.status, 200);
            assert.equal(r.data.dataReady, true);
            assert.ok(r.data.topOpportunities.some((x) => x.symbol === SYM));
            assert.equal(r.data.outlook.bullish + r.data.outlook.neutral + r.data.outlook.bearish > 0, true);
        });
    });
    describe("alerts", () => {
        it("remembers which side of the price an alert has to cross", async () => {
            const u = await user("alert");
            const up = await t.call("POST", "/alerts", { token: u.token, body: { symbol: SYM, conditions: { price: 300 } } });
            const down = await t.call("POST", "/alerts", { token: u.token, body: { symbol: SYM, conditions: { price: 250 } } });
            assert.equal(up.status, 201);
            assert.equal(up.data[0].direction, "above");
            assert.equal(down.data[0].direction, "below");
        });
        it("remembers the current signal for signal alerts", async () => {
            const u = await user("alert2");
            const r = await t.call("POST", "/alerts", { token: u.token, body: { symbol: SYM, conditions: { signal: "Bearish" } } });
            assert.equal(r.data[0].lastSeen, "Bullish");
        });
        it("re-arms an alert when it is switched back on or its target changes", async () => {
            const u = await user("alert3");
            const made = (await t.call("POST", "/alerts", { token: u.token, body: { symbol: SYM, conditions: { price: 300 } } })).data[0];
            assert.equal((await t.call("PATCH", `/alerts/${made.id}`, { token: u.token, body: { value: 250 } })).data.direction, "below");
            await t.call("PATCH", `/alerts/${made.id}`, { token: u.token, body: { active: false } });
            const back = await t.call("PATCH", `/alerts/${made.id}`, { token: u.token, body: { active: true } });
            assert.equal(back.data.active, true);
            assert.equal(back.data.direction, "below");
        });
    });
    describe("notifications", () => {
        it("lists new ones as unread and marks them read", async () => {
            const u = await user("notes");
            await Notification.create([{ user: u.id, title: "One", body: "a" }, { user: u.id, title: "Two", body: "b", symbol: SYM }]);
            const list = await t.call("GET", "/notifications", { token: u.token });
            assert.equal(list.data.unread, 2);
            assert.equal(list.data.items.length, 2);
            assert.equal(list.data.items[0].user, undefined);
            assert.equal((await t.call("POST", "/notifications/read-all", { token: u.token })).data.unread, 0);
            assert.equal((await t.call("GET", "/notifications", { token: u.token })).data.unread, 0);
        });
        it("shows each user only their own", async () => {
            const a = await user("notesA"), b = await user("notesB");
            await Notification.create({ user: a.id, title: "Mine", body: "x" });
            assert.equal((await t.call("GET", "/notifications", { token: b.token })).data.items.length, 0);
        });
        it("needs a login", async () => assert.equal((await t.call("GET", "/notifications")).status, 401));
    });
    describe("Discord webhook setting", () => {
        it("accepts a real-looking address, hides it, and can clear it", async () => {
            const u = await user("disc");
            const url = "https://discord.com/api/webhooks/123456789/abcDEF_ghi-123";
            const set = await t.call("PATCH", "/auth/me", { token: u.token, body: { discordWebhookUrl: url } });
            assert.equal(set.status, 200);
            assert.equal(set.data.user.discordConnected, true);
            assert.equal(set.data.user.discordWebhookUrl, undefined);
            const test = await t.call("POST", "/auth/me/discord/test", { token: u.token });
            assert.equal(test.status, 200);
            assert.ok(mailAndDiscord.some((p) => /connected/.test(p.content)));
            const cleared = await t.call("PATCH", "/auth/me", { token: u.token, body: { discordWebhookUrl: "" } });
            assert.equal(cleared.data.user.discordConnected, false);
            assert.equal((await t.call("POST", "/auth/me/discord/test", { token: u.token })).status, 400);
        });
        it("refuses an address that is not a Discord webhook", async () => {
            const u = await user("disc2");
            for (const bad of ["https://evil.example.com/api/webhooks/1/a", "http://discord.com/api/webhooks/1/a", "not a url", 5])
                assert.equal((await t.call("PATCH", "/auth/me", { token: u.token, body: { discordWebhookUrl: bad } })).status, 400);
        });
    });
    describe("admin system overview", () => {
        it("is for admins only and reports what is set up", async () => {
            const bcrypt = (await import("bcryptjs")).default;
            const email = `adm${Date.now()}@example.com`;
            const admin = await User.create({ firstName: "Ad", lastName: "Min", email, role: "admin", passwordHash: await bcrypt.hash("Admin@12345", 4) });
            createdUsers.push(admin._id);
            const normal = await user("sys");
            assert.equal((await t.call("GET", "/admin/system", { token: normal.token })).status, 403);
            const login = await t.call("POST", "/auth/login", { body: { email, password: "Admin@12345" } });
            const r = await t.call("GET", "/admin/system", { token: login.data.token });
            assert.equal(r.status, 200);
            assert.equal(r.data.email, null);
            assert.equal(r.data.marketData.configured, false);
            assert.equal(typeof r.data.stripe.checkout, "boolean");
        });
    });
});
//# sourceMappingURL=stocks.test.js.map