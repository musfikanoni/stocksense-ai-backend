// Calls the running API from start to finish.   1) npm run dev   2) npm run seed   3) npm run smoke
// The server needs SHOW_DEV_OTP=true (see .env.example) so the password reset step can read the code.
const BASE = process.env.API_URL || "http://localhost:5000/api";
const ADMIN = { email: process.env.ADMIN_EMAIL || "admin@stocksense.dev", password: process.env.ADMIN_PASSWORD || "Admin@12345" };
let failed = 0;

type Opts = { token?: string; body?: unknown };
type Reply = { status: number; data: any };

async function call(method: string, path: string, { token, body }: Opts = {}): Promise<Reply> {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let data: any = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
function check(name: string, cond: unknown, extra = ""): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  " + extra}`);
  if (!cond) failed++;
}

const email = `smoke${Date.now()}@example.com`;
let r: Reply = await call("GET", "/health"); check("health", r.status === 200);
r = await call("GET", "/plans"); check("plans are public", r.status === 200 && r.data.length >= 2); const premium = r.data.find((p: any) => p.name === "Premium");

r = await call("POST", "/auth/signup", { body: { name: "Smoke Tester", email, password: "short" } }); check("signup rejects a short password", r.status === 400);
r = await call("POST", "/auth/signup", { body: { name: "Smoke Tester", email, password: "Smoke@1234" } }); check("signup", r.status === 201 && r.data.token); let token: string = r.data?.token;
r = await call("POST", "/auth/signup", { body: { name: "Smoke Tester", email, password: "Smoke@1234" } }); check("signup twice gives 409", r.status === 409);
r = await call("POST", "/auth/login", { body: { email, password: "wrong-password" } }); check("login with a wrong password gives 401", r.status === 401);
r = await call("POST", "/auth/login", { body: { email, password: "Smoke@1234" } }); check("login", r.status === 200 && r.data.token); token = r.data.token;
r = await call("GET", "/auth/me"); check("me without token gives 401", r.status === 401);
r = await call("GET", "/auth/me", { token }); check("me", r.status === 200 && r.data.user.email === email && !("passwordHash" in r.data.user));
r = await call("PATCH", "/auth/me", { token, body: { firstName: "Smokey" } }); check("update profile", r.data?.user?.firstName === "Smokey");

r = await call("POST", "/auth/google", { body: { credential: "not-a-real-google-token-0123456789" } }); check("Google sign-in rejects a fake token (401, or 503 if not set up)", [401, 503].includes(r.status), String(r.status));
r = await call("POST", "/auth/me/avatar/signature", { token }); check("avatar signature (200 when Cloudinary is set up, otherwise 503)", [200, 503].includes(r.status), String(r.status));
r = await call("PATCH", "/auth/me/avatar", { token, body: { url: "https://evil.example.com/x.png" } }); check("avatar rejects a foreign address", r.status === 400);
r = await call("GET", "/stocks"); check("stock list (15 stocks; prices appear once the price provider key is set)", r.status === 200 && r.data.length === 15 && "signal" in r.data[0]); const hasData = r.data?.some((s: any) => s.price !== null);
r = await call("GET", "/stocks/aapl"); check("stock detail", r.data?.symbol === "AAPL" && (r.data.price === null || (r.data.support <= r.data.price && r.data.resistance >= r.data.support)), JSON.stringify(r.data));
r = await call("GET", "/stocks/NOPE"); check("unknown stock gives 404", r.status === 404);
for (const [range, n] of [["1W", 5], ["1M", 22], ["1Y", 12]] as const) { r = await call("GET", `/stocks/AAPL/history?range=${range}`); check(`history ${range} (data, or 503 until prices are fetched)`, hasData ? r.status === 200 && r.data.length >= 2 : r.status === 503, String(r.status)); }
r = await call("GET", "/stocks/AAPL/history?range=1D"); check("history 1D (200, or 503 when the provider is not set up)", [200, 503].includes(r.status), String(r.status));
r = await call("GET", "/stocks/AAPL/history?range=5Y"); check("bad range gives 400", r.status === 400);
r = await call("GET", "/stocks/market/bias"); check("market bias", r.data?.length === 3);
r = await call("GET", "/stocks/market/status"); check("market status", r.status === 200 && r.data.provider && typeof r.data.configured === "boolean");
r = await call("GET", "/stocks/AAPL/summary"); check("AI summary (text, or 503 until prices are fetched)", hasData ? r.status === 200 && r.data.summary : r.status === 503, String(r.status));

for (const s of ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA"]) await call("POST", "/watchlist", { token, body: { symbol: s } });
r = await call("GET", "/watchlist", { token }); check("watchlist has 5", r.data?.length === 5);
r = await call("POST", "/watchlist", { token, body: { symbol: "META" } }); check("Free plan blocks the 6th stock", r.status === 403);
r = await call("DELETE", "/watchlist/TSLA", { token }); check("remove from watchlist", r.data?.length === 4);

r = await call("POST", "/alerts", { token, body: { symbol: "AAPL", conditions: { price: 235, signal: "Bullish" }, channels: { email: true } } }); check("create 2 alerts", r.status === 201 && r.data.length === 2); const alertId = r.data?.[0]?.id;
r = await call("POST", "/alerts", { token, body: { symbol: "AAPL", conditions: { price: -1 } } }); check("bad alert value gives 400", r.status === 400);
r = await call("POST", "/alerts", { token, body: { symbol: "AAPL", conditions: { volume: 2, breakout: 250 } } }); check("Free plan blocks more than 3 alerts", r.status === 403);
r = await call("PATCH", `/alerts/${alertId}`, { token, body: { active: false, value: 240 } }); check("edit and disable alert", r.data?.active === false && r.data.value === 240);
r = await call("GET", "/alerts?status=disabled", { token }); check("filter disabled alerts", r.data?.length === 1);
r = await call("GET", `/dashboard`, { token }); check("dashboard", r.status === 200 && Array.isArray(r.data.topOpportunities) && Array.isArray(r.data.recentAlerts) && typeof r.data.dataReady === "boolean");
r = await call("GET", "/notifications", { token }); check("notifications", r.status === 200 && Array.isArray(r.data.items) && typeof r.data.unread === "number");
r = await call("POST", "/auth/me/discord/test", { token }); check("Discord test refuses when no webhook is saved", r.status === 400);
r = await call("PATCH", "/auth/me", { token, body: { discordWebhookUrl: "https://example.com/not-discord" } }); check("bad Discord address gives 400", r.status === 400);

r = await call("GET", "/admin/stats", { token }); check("a normal user cannot open admin routes", r.status === 403);
r = await call("POST", "/billing/checkout", { token, body: { planId: premium.id, cycle: "Monthly" } }); check("checkout gives a Stripe address (200), or 503 when Stripe is not set up", [200, 503].includes(r.status) && (r.status === 503 || String(r.data.url).startsWith("https://")), JSON.stringify(r.data));
r = await call("POST", "/billing/webhook", { body: { id: "evt_fake" } }); check("webhook refuses an unsigned request (400, or 503 when not set up)", [400, 503].includes(r.status), String(r.status));
r = await call("POST", "/billing/subscribe", { token, body: { planId: premium.id } }); check("there is no free-upgrade route", r.status === 404);
r = await call("GET", "/billing", { token }); check("billing info shows the Free plan and no invoices yet", r.data?.plan?.name === "Free" && r.data.invoices.length === 0, JSON.stringify(r.data));
const userId = (await call("GET", "/auth/me", { token })).data.user.id;

r = await call("POST", "/auth/login", { body: ADMIN }); check("admin login (did you run npm run seed?)", r.status === 200 && r.data.user.role === "admin"); const admin = r.data?.token;
r = await call("GET", "/admin/stats", { token: admin }); check("admin stats", r.status === 200 && r.data.total >= 1, JSON.stringify(r.data));
r = await call("GET", "/admin/users?q=smokey&plan=Free", { token: admin }); check("admin user search and plan filter", r.data?.users?.some((u: any) => u.id === userId), JSON.stringify(r.data));
r = await call("GET", `/admin/users/${userId}`, { token: admin }); check("admin user detail", r.data?.user?.id === userId && Array.isArray(r.data?.invoices));
r = await call("PATCH", `/admin/users/${userId}/block`, { token: admin, body: { blocked: true } }); check("admin blocks user", r.data?.user?.blocked === true);
r = await call("GET", "/auth/me", { token }); check("blocked user is locked out at once", r.status === 403);
r = await call("POST", "/auth/login", { body: { email, password: "Smoke@1234" } }); check("blocked user cannot log in", r.status === 403);
r = await call("PATCH", `/admin/users/${userId}/block`, { token: admin, body: { blocked: false } }); check("admin unblocks user", r.data?.user?.blocked === false);
r = await call("GET", "/admin/billing?status=Paid", { token: admin }); check("admin billing", r.status === 200 && typeof r.data.totalRevenue === "number" && Array.isArray(r.data.rows), JSON.stringify(r.data).slice(0, 200));
r = await call("POST", "/admin/plans", { token: admin, body: { name: `Test${Date.now() % 100000}`, price: 9, highlight: false, features: ["One", "Two"] } }); check("admin creates plan", r.status === 201); const planId = r.data?.id;
r = await call("PUT", `/admin/plans/${planId}`, { token: admin, body: { name: r.data?.name, price: 19, highlight: true, features: ["One"] } }); check("admin edits plan", r.data?.price === 19 && r.data.highlight === true);
r = await call("PUT", "/admin/policy/privacy", { token: admin, body: { text: "Updated privacy policy text for the smoke test." } }); check("admin edits policy", r.status === 200);
r = await call("GET", "/policy"); check("policy is public", r.data?.privacy?.text?.startsWith("Updated"));
r = await call("GET", "/admin/system", { token: admin }); check("admin system overview", r.status === 200 && "email" in r.data && "marketData" in r.data, JSON.stringify(r.data).slice(0, 150));
r = await call("GET", "/admin/system", { token }); check("normal user cannot see the system overview", r.status === 403);
r = await call("GET", "/admin/notifications", { token: admin }); check("admin notifications", r.status === 200 && r.data.length > 0);

r = await call("PATCH", "/auth/me/password", { token, body: { currentPassword: "Smoke@1234", newPassword: "Changed@5678" } }); check("change password", r.status === 200 && r.data.token); const fresh = r.data?.token;
r = await call("GET", "/auth/me", { token }); check("old token stops working after a password change", r.status === 401);
r = await call("GET", "/auth/me", { token: fresh }); check("new token works", r.status === 200);

r = await call("POST", "/auth/forgot-password", { body: { email } }); check("forgot password", r.status === 200); const otp = r.data?.devOtp;
r = await call("POST", "/auth/forgot-password", { body: { email: "nobody@example.com" } }); check("unknown email gets the same answer", r.status === 200 && !r.data.devOtp);
if (otp) {
  r = await call("POST", "/auth/verify-otp", { body: { email, otp: otp === "111111" ? "222222" : "111111" } }); check("wrong code is rejected", r.status === 400);
  r = await call("POST", "/auth/verify-otp", { body: { email, otp } }); check("right code gives a reset token", r.status === 200 && r.data.resetToken); const rt = r.data?.resetToken;
  r = await call("GET", "/auth/me", { token: rt }); check("reset token cannot be used as a login token", r.status === 401);
  r = await call("POST", "/auth/reset-password", { body: { resetToken: rt, password: "Reset@9999" } }); check("reset password", r.status === 200);
  r = await call("POST", "/auth/login", { body: { email, password: "Reset@9999" } }); check("login with the reset password", r.status === 200); token = r.data?.token;
} else console.log("SKIP  reset flow (start the server with SHOW_DEV_OTP=true)");

r = await call("DELETE", "/auth/me", { token, body: { password: "wrong" } }); check("delete account needs the right password", r.status === 400);
r = await call("DELETE", "/auth/me", { token, body: { password: "Reset@9999" } }); check("delete account", r.status === 200);
r = await call("POST", "/auth/login", { body: { email, password: "Reset@9999" } }); check("deleted account cannot log in", r.status === 401);
r = await call("GET", "/nothing-here"); check("unknown route gives 404", r.status === 404);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
