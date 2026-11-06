import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { stripeWebhook } from "./routes/webhook.js";
import adminRoutes from "./routes/admin.js";
import alertRoutes from "./routes/alerts.js";
import authRoutes from "./routes/auth.js";
import billingRoutes from "./routes/billing.js";
import dashboardRoutes from "./routes/dashboard.js";
import notificationRoutes from "./routes/notifications.js";
import { plansRouter, policyRouter } from "./routes/plans.js";
import stockRoutes from "./routes/stocks.js";
import watchlistRoutes from "./routes/watchlist.js";

const app = express();
app.set("trust proxy", 1);                 // we run behind a proxy on Render/Railway, so rate limits see the real IP
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => (!origin || env.clientUrls.includes(origin) ? cb(null, true) : cb(new Error("Origin not allowed by CORS"))),
}));
// Stripe needs the untouched request body to check its signature, so this route comes before express.json()
app.post("/api/billing/webhook", express.raw({ type: "application/json", limit: "1mb" }), stripeWebhook);
app.use(express.json({ limit: "20kb" }));

const limiter = (limit: number) =>
  rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: "draft-7", legacyHeaders: false, skip: () => env.isTest, message: { message: "Too many requests. Try again in a few minutes." } });
app.use("/api", limiter(600));
app.use(["/api/auth/login", "/api/auth/signup", "/api/auth/google", "/api/auth/forgot-password", "/api/auth/verify-otp", "/api/auth/reset-password"], limiter(30));

app.get("/api/health", (_req, res) => { res.json({ ok: true }); });
app.use("/api/auth", authRoutes);
app.use("/api/stocks", stockRoutes);
app.use("/api/watchlist", watchlistRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/plans", plansRouter);
app.use("/api/policy", policyRouter);
app.use("/api/billing", billingRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
