# StockSense API

Backend for the StockSense frontend. Node.js, Express, TypeScript, MongoDB (Mongoose) and JWT.
Keep this in its own Git repository, separate from the frontend.

## What it does
- Sign up, log in, password reset with a 6-digit code, change password, delete account
- Stock prices, real (Twelve Data) or clearly labelled simulated, refreshed in the background, with a simple explainable signal (Bullish / Neutral / Bearish), price levels and charts
- Per-user watchlist and alerts, with Free plan limits (5 stocks, 3 alerts). Alerts really fire: in-app notification, email and Discord
- Subscriptions paid through Stripe Checkout, with a signed webhook that upgrades the plan, records invoices and handles cancellations
- Admin panel data: stats, users (search, filters, block), billing, plan editor, policy editor, notifications
- Password reset codes and alert messages sent by email (Resend or Gmail SMTP)
- Optional AI summary through the Gemini API (falls back to a rule-based text)

## Setup

### 1. Install
```bash
npm install
```
Create your settings file. It must be named exactly `.env` (not `.env.txt`; on Windows turn on "File name extensions" in File Explorer to check):
```bash
copy .env.example .env      # Windows
cp .env.example .env        # Mac / Linux
```

### 2. Create a free MongoDB Atlas database
1. Sign up at mongodb.com/atlas and create a free **M0** cluster.
2. **Database Access** > add a database user (username + password). Avoid `@ : /` in the password.
3. **Network Access** > add your IP address (for quick testing you can allow `0.0.0.0/0`, then tighten it later).
4. **Connect** > **Drivers** > copy the connection string. Replace `<password>` and add the database name before the `?`:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/stocksense?retryWrites=true&w=majority`
5. Paste it into `.env` as `MONGODB_URI`.

### 3. Fill in `.env`
- `JWT_SECRET`: a long random string. Create one with
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `CLIENT_URL`: where the frontend runs (`http://localhost:3000`). After deploying, add the Vercel address too, separated by a comma.
- Keep `SHOW_DEV_OTP=true` while developing, so the password reset code appears in the response.

### 4. Seed and run
```bash
npm run seed       # plans, stocks, policies and the admin account
npm run seed:sample   # (optional, local only) also adds a demo user and 12 sample customers
npm run dev        # http://localhost:5000, restarts when you save a file
npm run smoke      # (in a second terminal) runs about 60 checks against the live API
npm test           # unit tests (add TEST_MONGODB_URI to also run the database tests)
```
Other scripts: `npm run typecheck` (TypeScript check only), `npm run build` (compiles to `dist/`), `npm start` (runs the compiled build).

Accounts created by `npm run seed`: the admin only. `npm run seed:sample` adds the rest, for local development only (never on a live site):

| Who | Email | Password |
|---|---|---|
| Admin (`seed`) | admin@stocksense.dev | Admin@12345 (or `ADMIN_PASSWORD` from `.env`) |
| Demo user, Premium (`seed:sample`) | demo@stocksense.dev | Demo@12345 |
| 12 sample customers (`seed:sample`) | aisha@example.com ... | User@12345 |

Change the admin password before you share a public deployment.

### Postman
The `postman/` folder has a collection (50 requests with tests and notes) and an environment. Import both, pick the **StockSense Local** environment and press **Run**.

## Troubleshooting
- **`Missing MONGODB_URI`**: there is no `.env` file in this folder, or it is empty. Do step 1 and 3 above, and run the command from inside the `stocksense-api` folder.
- **`MongoServerSelectionError`**: Atlas cannot be reached. Check Network Access (your IP), the password in the connection string, and that the string has no `<` `>` left in it.
- **`EADDRINUSE`**: port 5000 is busy. Change `PORT` in `.env`.

## Folder guide
- `src/server.ts` starts the server, `src/app.ts` sets up Express (security, CORS, routes)
- `src/routes/` one file per area (auth, stocks, watchlist, alerts, billing, dashboard, admin)
- `src/models/` Mongoose models with TypeScript types
- `src/middleware/` login check, admin check, error handler
- `src/services/` price provider, email, Discord, Stripe payments
- `src/jobs/` background price refresh and the alert engine
- `src/utils/` signal rule, chart points, market hours, validation, tokens
- `src/seed/` the list of stocks, plans, policies and the seed script
- `src/tests/` unit and database tests (`npm test`)

## Endpoints
Send the token as `Authorization: Bearer <token>`. Errors look like `{ "message": "..." }`.

| Area | Method and path | Notes |
|---|---|---|
| Auth | `POST /api/auth/signup` | `{ name, email, password }` returns `{ token, user }` |
| | `POST /api/auth/login` | `{ email, password }` |
| | `POST /api/auth/forgot-password` | `{ email }` |
| | `POST /api/auth/verify-otp` | `{ email, otp }` returns `{ resetToken }` |
| | `POST /api/auth/reset-password` | `{ resetToken, password }` |
| | `GET /api/auth/me` | |
| | `PATCH /api/auth/me` | `{ firstName, lastName, discordWebhookUrl }` (empty text removes the Discord address) |
| | `POST /api/auth/me/discord/test` | sends a test message to the saved Discord webhook |
| | `PATCH /api/auth/me/password` | `{ currentPassword, newPassword }` returns a new token |
| | `DELETE /api/auth/me` | `{ password }` (Google-only accounts send `{ confirm: "<their email>" }`) |
| | `POST /api/auth/google` | `{ credential }` the Google ID token, returns `{ token, user }` |
| | `POST /api/auth/me/avatar/signature` | signed ticket for uploading a profile picture |
| | `PATCH /api/auth/me/avatar` | `{ url }` saves the picture address |
| | `DELETE /api/auth/me/avatar` | removes the picture |
| Stocks | `GET /api/stocks?q=` | list with price, change, signal, confidence |
| | `GET /api/stocks/:symbol` | adds support, resistance, breakout, target, reason. Every number can be `null` when no price has been fetched yet |
| | `GET /api/stocks/:symbol/history?range=1D\|1W\|1M\|1Y` | `[{ label, price }]`. 503 until prices are fetched |
| | `GET /api/stocks/:symbol/summary` | AI summary |
| | `GET /api/stocks/market/bias` | SPY, QQQ, IWM |
| | `GET /api/stocks/market/status` | price mode (`live` or `simulated`), notice, market open or closed, last refresh |
| Watchlist | `GET`, `POST {symbol}`, `DELETE /:symbol` on `/api/watchlist` | login needed |
| Alerts | `GET ?status=active\|disabled`, `POST`, `PATCH /:id`, `DELETE /:id` on `/api/alerts` | `POST { symbol, conditions: { price, breakout, signal, volume }, channels: { email, push, discord } }` |
| Notifications | `GET /api/notifications`, `POST /api/notifications/read-all` | the bell menu: newest 20 and the unread count |
| Dashboard | `GET /api/dashboard` | top opportunities, outlook, high confidence, recent alerts |
| Plans | `GET /api/plans` | public |
| Policy | `GET /api/policy` | public |
| Billing | `GET /api/billing` | your plan, Stripe status and invoices |
| | `POST /api/billing/checkout` | `{ planId, cycle }` returns `{ url }` of a Stripe Checkout |
| | `POST /api/billing/portal` | returns `{ url }` of Stripe's page to update the card or cancel |
| | `POST /api/billing/webhook` | called by Stripe only (checks its signature) |
| Admin | `GET /api/admin/stats` | admin role only, for everything below |
| | `GET /api/admin/users?q&status&plan&page&limit` | |
| | `GET /api/admin/users/:id`, `PATCH /api/admin/users/:id/block { blocked }` | |
| | `GET /api/admin/billing?q&status&plan` | rows plus total revenue |
| | `POST /api/admin/plans`, `PUT /api/admin/plans/:id` | |
| | `PUT /api/admin/policy/:key` | `privacy` or `terms` |
| | `GET /api/admin/notifications` | |
| | `GET /api/admin/system` | which optional services are set up, price mode and last refresh |

## How the signal works
`src/utils/signal.ts`. It blends two numbers from the daily closing prices: how far today's price is from its 30-day average, and the 5-day change. Above +0.8 is Bullish, below -0.8 is Bearish, otherwise Neutral. Support and resistance are the 30-day low and high. It is simple on purpose, so you can explain it in an interview. It is for learning, not for investing.

## Stock prices: two modes
Set `MARKET_DATA_MODE` in `.env`:

| Mode | Prices | Use it for |
|---|---|---|
| `live` | Real prices from Twelve Data (needs `TWELVE_DATA_API_KEY`) | Your own computer: developing, testing the real integration, recording a demo video |
| `simulated` | Made up by the server, moving like a market. Every screen must say so | A public site (see the licence note below) |

The default is `live`. Without a key it shows no prices (the API answers `null` and 503 for charts), it never invents numbers on its own. Simulated prices exist only when you switch that mode on, and the API then reports it everywhere: `GET /api/stocks/market/status` has `mode: "simulated"` and a `notice`, and each stock has `dataSource: "simulated"`. The frontend must show a clear "Simulated prices, not real market data" label.

### Simulated mode
No key and no internet service needed. On start-up the server makes about a year of daily history for each stock (`src/services/simulator.ts`), then a new price every minute, around the clock. Everything else is the real code: the signal, support and resistance, charts, the 1D chart (one point every 30 minutes for the last 24 hours), the alert engine and the notifications. Alert messages say "Simulated price". Because a simulated market never closes, a visitor can set an alert a little above or below the price and watch it fire within minutes. (Free plan alerts are still checked only once a day, so to see it quickly a visitor upgrades with Stripe's test card and uses a Premium alert.)

### Live mode (Twelve Data)
A background job (see "Background jobs") fetches:
- the latest quote (price, change, volume) for each symbol, every `QUOTE_REFRESH_MINUTES` (default 30) while the US market is open, and once when the server starts, so there is always a last price to show;
- about a year of daily closes once a day after the market closes (16:30 New York time), and at start-up if they are missing. The signal, the support and resistance levels, and the 1W, 1M and 1Y charts are worked out from these;
- the 1D chart is fetched live when a visitor opens it and kept for 10 minutes.

Set up: create a free account at twelvedata.com, copy the key into `.env` as `TWELVE_DATA_API_KEY`, restart, and check `GET /api/stocks/market/status`. The first fetch takes a few minutes because the free plan allows 8 requests a minute. The server keeps below that and below the daily limit of 800.

### Please read: why a public site should use simulated mode
Free market-data plans are meant for personal use. At the time of writing, Twelve Data's free "Basic" plan is described as for internal, non-display use, and showing its data to other people needs its business plan (about 149 dollars a month). Other providers are similar: Finnhub's free key is described as for personal, non-commercial projects, and FMP says a public portfolio or demo site needs a licence check even on a free plan. So a public site that shows real prices from a free key may go against the plan's terms. That is why a public deployment should use `MARKET_DATA_MODE=simulated`, and real prices stay on your own machine. If a provider gives you written permission, switch the public site to `live`. All provider code is in `src/services/marketData.ts`, so another provider means rewriting that one file.

## Email
Used for password reset codes and for alert emails. Choose one option in `.env`:

| Option | Settings | Good for | Careful |
|---|---|---|---|
| Resend | `RESEND_API_KEY`, `MAIL_FROM` | Works over HTTPS, so it works on Render | You can only send to other people after verifying a domain you own in Resend. Until then Resend only delivers to your own account email |
| Gmail SMTP | `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS` | Sends to anyone from your Gmail, good on your own computer or a VPS | Needs 2-Step Verification and an App Password (not your normal password). Render's free plan blocks SMTP, so it cannot work there |

If both are set, Resend is used. Without either, the server logs a warning, and password reset codes cannot reach anyone (set `SHOW_DEV_OTP=true` locally to see them in the response instead).

Alert emails go to the address the person signed up with. Email addresses are not verified at sign-up yet, so someone could register with another person's address. Adding an email check is on the to-do list.

## Alerts
- **What can be set:** a price (the alert remembers whether the price has to rise to the target or fall to it, from where it is today), a breakout level, a signal change ("tell me when it turns Bullish") and a volume in millions.
- **When they are checked:** Premium alerts after every price refresh (during market hours). Free plan alerts once a day after the close ("end-of-day alerts", as the plan says).
- **What happens when one fires:** the alert switches itself off (so you are never spammed), a notification is saved for the bell menu (`/api/notifications`), and, if ticked in the alert, an email is sent and a message is posted to the user's Discord. Switching an alert back on, or changing its target, arms it again from the current price.
- **Discord:** the user creates a webhook in their own Discord server (Server settings, Integrations, Webhooks, New webhook, Copy URL) and saves it with `PATCH /api/auth/me`. `POST /api/auth/me/discord/test` sends a test message.
- **"Push Notification"** in the alert window means the in-app notification in the bell menu. Browser push (a service worker) is not built.

## Background jobs
`src/jobs/` runs inside the server: one check a minute that fetches prices and checks alerts when something is due. Set `JOBS_ENABLED=false` to turn it off. Things to know:
- It runs in one server process. Do not run two copies of the API against the same database, or alerts could fire twice.
- A sleeping server runs nothing. Render's free plan sleeps after about 15 minutes without visitors, so alerts are only checked while it is awake. For reliable alerts use a server that is always on (a VPS, or a paid Render plan).

## Payments (Stripe)
The plan is never changed by the browser. The flow is:
1. The frontend calls `POST /api/billing/checkout`. The server creates a Stripe customer (once), a Stripe price for the plan (once per plan and cycle, a new one if the admin changes the price) and a Checkout session, and returns its address.
2. The customer pays on Stripe's own page.
3. Stripe calls `POST /api/billing/webhook`. The server checks Stripe's signature, then updates the plan, saves the invoice (with a link to Stripe's invoice page), and handles renewals, failed payments and cancellations. Each event is applied once, even if Stripe sends it again.
4. The customer changes the card or cancels from Stripe's billing portal (`POST /api/billing/portal`).

Without Stripe keys the server answers 503 on these routes. It never pretends a payment worked.

### Set up (test mode, no real money)
1. Create a Stripe account and switch to **test mode** (also called a sandbox). Stripe does not offer new merchant accounts in every country, so check that sign-up works for you first.
2. **Developers > API keys**: copy the **Secret key** (`sk_test_...`) into `.env` as `STRIPE_SECRET_KEY`. You do not need the publishable key, because the card is typed on Stripe's page.
3. **Settings > Billing > Customer portal**: turn the portal on and save (needed once, for the "Manage billing" button).
4. Webhook while developing: install the Stripe CLI, run `stripe login`, then
   `stripe listen --forward-to localhost:5000/api/billing/webhook`
   It prints a signing secret that starts with `whsec_`. Put it in `.env` as `STRIPE_WEBHOOK_SECRET` and restart the server. Keep the CLI window open while you test.
5. Test: start a checkout (Postman: "Start checkout (Stripe)"), open the returned address, pay with card `4242 4242 4242 4242`, any future date, any 3-digit code. Watch the CLI window: the events arrive and the plan changes. Card `4000 0000 0000 0341` is accepted at checkout and then fails on renewal, so you can see a failed payment.
6. Live site: **Developers > Webhooks > Add endpoint**, address `https://YOUR-API.onrender.com/api/billing/webhook`, and select these events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Copy that endpoint's signing secret into the host's environment variables as `STRIPE_WEBHOOK_SECRET`.

Notes: yearly billing costs 10 months. Changing a plan price in the admin panel affects new checkouts only, people already subscribed keep their price. Prices are in US dollars.

## Optional: Continue with Google
Without this the "Continue With Google" button cannot log anyone in. Email and password login works without it.

1. Open Google Cloud Console, create (or pick) a project.
2. **Google Auth Platform > Branding**: fill in the app name and your support email, then save.
3. **Google Auth Platform > Clients > Create client**, application type **Web application**. Under **Authorized JavaScript origins** add `http://localhost:3000` (later also your Vercel address: scheme and host only, no path). Create it and copy the **Client ID** (it ends with `.apps.googleusercontent.com`). You do not need the client secret for this flow.
4. Put it in `.env` as `GOOGLE_CLIENT_ID=...`. The frontend uses the same ID.
5. While the app is in "Testing" status, only the Google accounts you list as test users (Google Auth Platform > Audience) can sign in.

How it works: the browser shows Google's button and gets an ID token from Google, then sends it to `POST /api/auth/google`. The server checks Google's signature and that the token was made for your client ID, then logs the person in or creates their account. If an account with the same email already exists with a password, the answer is 409 and the person logs in with the password. We do not merge them automatically, because someone could have signed up with that email without proving they own it. Accounts made through Google have no password; "Forgot password" can add one.

## Optional: profile pictures (Cloudinary)
1. Sign up free at cloudinary.com.
2. On your dashboard copy the **Cloud name**, **API Key** and **API Secret**.
3. Put them in `.env` as `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. The secret stays on the server only.

How it works: the picture goes from the browser straight to Cloudinary, so the server never handles the file.
1. `POST /api/auth/me/avatar/signature` returns `{ uploadUrl, apiKey, timestamp, signature, fields }`.
2. The browser POSTs a form to `uploadUrl` with `file`, `api_key`, `timestamp`, `signature` and every item of `fields`. Cloudinary answers with JSON that has `secure_url`.
3. `PATCH /api/auth/me/avatar` with `{ url: secure_url }`.

Each user has one picture: uploading again replaces it. `user.avatarUrl` is already a 256px square. The server cannot limit the file size, so the frontend should check the size (about 2 MB) and the type (JPG, PNG, WEBP) before uploading.

## Tests
`npm test` runs the unit tests. To also run the database tests (accounts, password reset, Google, profile picture, Stripe flow), point `TEST_MONGODB_URI` at a MongoDB you do not mind filling with test data (a separate free Atlas database is fine):
```bash
TEST_MONGODB_URI="mongodb+srv://..." npm test        # Mac / Linux
$env:TEST_MONGODB_URI="mongodb+srv://..."; npm test   # Windows PowerShell
```
The Stripe tests replace Stripe's network calls with fakes and use real signed webhook requests, so no Stripe account is needed to run them.

## Security choices (good interview material)
- Passwords hashed with bcrypt. Login takes the same time whether or not the email exists.
- JWT access token (7 days) in the `Authorization` header. Every request also reloads the user, so a blocked or deleted user is locked out immediately. Each token carries a version number, and a password change raises it, so all older tokens stop working at once.
- Password reset: 6-digit code, hashed, expires in 10 minutes, 5 tries. After the code step the user gets a separate 10-minute reset token that cannot be used to log in. "Forgot password" gives the same answer for any email.
- Input checks on every route (types, lengths, allowed values), which also stops MongoDB operator injection such as `{ "$ne": "" }`.
- `helmet` headers, CORS limited to `CLIENT_URL`, rate limits (stricter on auth routes), request size limit.
- Payment changes only come from Stripe's signed webhook (checked with the raw request body), and every event is applied once.
- Admin routes sit behind `requireRole("admin")`. Alerts and watchlists are always filtered by the logged-in user.

## Known limits
- **Email addresses are not verified** at sign-up (see Email above).
- **Browser push notifications** are not built. In-app, email and Discord are.
- **The token is kept by the frontend.** A production setup would use an httpOnly cookie with refresh tokens.
- **Price data licence:** see "Stock prices: two modes". A free key may not be shown publicly, so a public site should use simulated mode.
- **US market holidays** are not known to the job. On those days it fetches prices that do not change.
- **No Google/Stripe/Cloudinary/email keys means those features answer 503**, they are never faked.

## Deploy
**Which host:** the API needs to stay awake to refresh prices and fire alerts, and email over SMTP needs open mail ports.
- **A VPS** (you already know it) fits best: always on, Gmail SMTP works if your provider allows outbound port 465 or 587.
- **Render free plan** works for demos, but it sleeps when idle (alerts pause, first request takes 30 to 60 seconds) and it blocks SMTP, so use Resend there.

**Steps (Render):**
1. Push this folder to its own GitHub repository.
2. Render > New > Web Service > connect the repo. **Build command:** `npm install --include=dev && npm run build`. **Start command:** `npm start`.
3. Environment variables: `NODE_ENV=production`, `MARKET_DATA_MODE=simulated` (for a public site, see "Stock prices"), `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL` (your Vercel address), and the optional ones you set up: `TWELVE_DATA_API_KEY`, `RESEND_API_KEY` + `MAIL_FROM`, `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`, `CLOUDINARY_*`, `GEMINI_API_KEY`. Do **not** set `SHOW_DEV_OTP`.
4. In Atlas Network Access allow Render (`0.0.0.0/0` on the free tier).
5. Seed the live database once from your own computer: put the production `MONGODB_URI` in `.env` and run `npm run seed`.
6. Log in as admin and call `GET /api/admin/system` to see which services are connected.
