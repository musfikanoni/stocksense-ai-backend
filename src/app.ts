import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { env } from "./app/config/env.js";
import { errorHandler, notFound } from "./app/middleware/error.js";
import { stripeWebhook } from "./app/routes/webhook.js";
import adminRoutes from "./app/routes/admin.js";
import alertRoutes from "./app/routes/alerts.js";
import authRoutes from "./app/routes/auth.js";
import billingRoutes from "./app/routes/billing.js";
import dashboardRoutes from "./app/routes/dashboard.js";
import notificationRoutes from "./app/routes/notifications.js";
import { plansRouter, policyRouter } from "./app/routes/plans.js";
import stockRoutes from "./app/routes/stocks.js";
import watchlistRoutes from "./app/routes/watchlist.js";

const app = express();
app.set("trust proxy", 1);                 // we run behind a proxy on Render/Railway, so rate limits see the real IP
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => (!origin || env.clientUrls.includes(origin) ? cb(null, true) : cb(new Error("Origin not allowed by CORS"))),
}));

const apiPrefixes = ["/api", "/api/v1"];

// Stripe needs the untouched request body to check its signature, so this route comes before express.json()
apiPrefixes.forEach((prefix) => {
  app.post(`${prefix}/billing/webhook`, express.raw({ type: "application/json", limit: "1mb" }), stripeWebhook);
});
app.use(express.json({ limit: "20kb" }));

const limiter = (limit: number) =>
  rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: "draft-7", legacyHeaders: false, skip: () => env.isTest, message: { message: "Too many requests. Try again in a few minutes." } });

apiPrefixes.forEach((prefix) => {
  app.use(prefix, limiter(600));
  app.use([
    `${prefix}/auth/login`,
    `${prefix}/auth/signup`,
    `${prefix}/auth/google`,
    `${prefix}/auth/forgot-password`,
    `${prefix}/auth/verify-otp`,
    `${prefix}/auth/reset-password`,
  ], limiter(30));
});

const apiStatus = (_req: express.Request, res: express.Response) => {
  res.json({
    name: "StockSense API",
    status: "healthy",
    endpoints: {
      health: "/api/health",
      stocks: "/api/stocks",
      plans: "/api/plans",
      auth: "/api/auth",
    },
  });
};

app.get("/", apiStatus);

const apiRouter = express.Router();
apiRouter.get("/", apiStatus);
apiRouter.get("/health", (_req, res) => { res.json({ ok: true }); });
apiRouter.use("/auth", authRoutes);
apiRouter.use("/stocks", stockRoutes);
apiRouter.use("/watchlist", watchlistRoutes);
apiRouter.use("/alerts", alertRoutes);
apiRouter.use("/plans", plansRouter);
apiRouter.use("/policy", policyRouter);
apiRouter.use("/billing", billingRoutes);
apiRouter.use("/dashboard", dashboardRoutes);
apiRouter.use("/notifications", notificationRoutes);
apiRouter.use("/admin", adminRoutes);

apiPrefixes.forEach((prefix) => {
  app.use(prefix, apiRouter);
});

app.use(notFound);
app.use(errorHandler);

export default app;
