import { Router } from "express";
import type { FilterQuery, Types } from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { env } from "../config/env.js";
import { jobState } from "../jobs/marketRefresh.js";
import { Invoice, type IInvoice } from "../models/Invoice.js";
import { Plan } from "../models/Plan.js";
import { Policy } from "../models/Policy.js";
import { User, fullName, type IUser } from "../models/User.js";
import { AppError } from "../utils/appError.js";
import { ah } from "../utils/asyncHandler.js";
import { mailProvider } from "../services/mailer.js";
import {
  marketDataConfigured,
  requestsUsedToday,
} from "../services/marketData.js";
import { escapeRegex, oneOf, pageOf, text } from "../utils/validate.js";

const r = Router();
r.use(requireAuth, requireRole("admin")); // every route below is admin-only

const DAY = 86400000;
const PLAN_LABELS = ["Free", "Premium (Monthly)", "Premium (Yearly)"] as const;

// "Jon Menson" matches first name AND last name; every word must match somewhere
const searchFilter = (q: unknown): FilterQuery<IUser>[] => {
  const words = String(q ?? "")
    .trim()
    .slice(0, 60)
    .split(/\s+/)
    .filter(Boolean);
  return words.map((w) => {
    const rx = new RegExp(escapeRegex(w), "i");
    return { $or: [{ firstName: rx }, { lastName: rx }, { email: rx }] };
  });
};

// Which optional services are set up on this server, to check a new deployment
r.get("/system", (_req, res) => {
  res.json({
    email: mailProvider(),
    marketData: {
      configured: marketDataConfigured(),
      requestsUsedToday: requestsUsedToday(),
      ...jobState,
    },
    stripe: {
      checkout: Boolean(env.stripe.secretKey),
      webhook: Boolean(env.stripe.webhookSecret),
    },
    google: Boolean(env.googleClientId),
    cloudinary: Boolean(
      env.cloudinary.cloudName &&
      env.cloudinary.apiKey &&
      env.cloudinary.apiSecret,
    ),
    backgroundJobs: env.jobsEnabled,
  });
});

r.get(
  "/stats",
  ah(async (_req, res) => {
    const base = { role: "user" } as const;
    const [total, active, paid, blocked, newThisMonth] = await Promise.all([
      User.countDocuments(base),
      User.countDocuments({
        ...base,
        lastLoginAt: { $gte: new Date(Date.now() - DAY) },
      }),
      User.countDocuments({ ...base, planName: { $ne: "Free" } }),
      User.countDocuments({ ...base, blocked: true }),
      User.countDocuments({
        ...base,
        joinedAt: { $gte: new Date(Date.now() - 30 * DAY) },
      }),
    ]);
    res.json({ total, active, paid, blocked, newThisMonth });
  }),
);

r.get(
  "/users",
  ah(async (req, res) => {
    const { page, limit, skip } = pageOf(req.query);
    const and: FilterQuery<IUser>[] = [
      { role: "user" },
      ...searchFilter(req.query.q),
    ];
    if (req.query.status) {
      const s = oneOf(
        req.query.status,
        ["Active", "Blocked"] as const,
        "status",
      );
      and.push({ blocked: s === "Blocked" });
    }
    if (req.query.plan) {
      const p = oneOf(req.query.plan, PLAN_LABELS, "plan");
      and.push(
        p === "Free"
          ? { planName: "Free" }
          : {
              planName: { $ne: "Free" },
              billingCycle: p.includes("Yearly") ? "Yearly" : "Monthly",
            },
      );
    }
    const filter: FilterQuery<IUser> = { $and: and };
    const [users, total] = await Promise.all([
      User.find(filter).sort({ joinedAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);
    res.json({
      users,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

r.get(
  "/users/:id",
  ah(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, role: "user" });
    if (!user) throw new AppError(404, "User not found.");
    res.json({
      user,
      invoices: await Invoice.find({ user: user._id }).sort({ date: -1 }),
    });
  }),
);

r.patch(
  "/users/:id/block",
  ah(async (req, res) => {
    if (typeof req.body?.blocked !== "boolean")
      throw new AppError(400, "blocked must be true or false.");
    const user = await User.findOne({ _id: req.params.id, role: "user" });
    if (!user) throw new AppError(404, "User not found.");
    user.blocked = req.body.blocked;
    await user.save();
    res.json({ user });
  }),
);

type Customer = {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
};

r.get(
  "/billing",
  ah(async (req, res) => {
    const { page, limit, skip } = pageOf(req.query);
    const match: FilterQuery<IInvoice> = {};
    if (req.query.status)
      match.status = oneOf(
        req.query.status,
        ["Paid", "Pending", "Failed"] as const,
        "status",
      );
    if (req.query.plan)
      match.planLabel = oneOf(
        req.query.plan,
        ["Premium (Monthly)", "Premium (Yearly)"] as const,
        "plan",
      );
    const words = searchFilter(req.query.q);
    if (words.length) {
      const ids = await User.find({ $and: words }).distinct("_id");
      const rx = new RegExp(
        escapeRegex(String(req.query.q).trim().slice(0, 60)),
        "i",
      );
      match.$or = [{ user: { $in: ids } }, { tx: rx }];
    }
    const [rows, total, paidSum, paidUsers] = await Promise.all([
      Invoice.find(match)
        .populate<{ user: Customer | null }>("user", "firstName lastName email")
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      Invoice.countDocuments(match),
      Invoice.aggregate<{ _id: null; total: number }>([
        { $match: { status: "Paid" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Invoice.distinct("user", { status: "Paid" }),
    ]);
    res.json({
      totalRevenue: paidSum[0]?.total ?? 0,
      paidUsers: paidUsers.length,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      rows: rows.map((i) => ({
        id: String(i._id),
        tx: i.tx,
        plan: i.planLabel,
        amount: i.amount,
        status: i.status,
        date: i.date,
        hostedUrl: i.hostedUrl ?? null,
        user: i.user
          ? {
              id: String(i.user._id),
              name: fullName(i.user),
              email: i.user.email,
            }
          : null,
      })),
    });
  }),
);

// ---- plans
const planBody = (b: Record<string, unknown> = {}) => {
  const price = Number(b.price);
  if (
    typeof b.price === "boolean" ||
    b.price === "" ||
    b.price === null ||
    !Number.isFinite(price) ||
    price < 0 ||
    price > 100000
  )
    throw new AppError(400, "Enter a valid price.");
  if (!Array.isArray(b.features) || b.features.length > 20)
    throw new AppError(400, "Features must be a list of up to 20 items.");
  return {
    name: text(b.name, 1, 40, "Plan name"),
    price,
    highlight: b.highlight === true,
    features: b.features.map((f) => text(f, 1, 100, "Feature")),
  };
};
r.post(
  "/plans",
  ah(async (req, res) => {
    res.status(201).json(await Plan.create(planBody(req.body)));
  }),
);
r.put(
  "/plans/:id",
  ah(async (req, res) => {
    const plan = await Plan.findByIdAndUpdate(
      req.params.id,
      planBody(req.body),
      { new: true, runValidators: true },
    );
    if (!plan) throw new AppError(404, "Plan not found.");
    res.json(plan);
  }),
);

// ---- policy text
r.put(
  "/policy/:key",
  ah(async (req, res) => {
    const key = oneOf(req.params.key, ["privacy", "terms"] as const, "Policy");
    const body = text(req.body?.text, 20, 20000, "Policy text");
    const doc = await Policy.findOneAndUpdate(
      { key },
      { text: body, updatedAt: new Date() },
      { new: true },
    );
    if (!doc) throw new AppError(404, "Policy not found. Run the seed script.");
    res.json(doc);
  }),
);

// ---- bell menu: newest sign-ups and payments
r.get(
  "/notifications",
  ah(async (_req, res) => {
    const [users, invoices] = await Promise.all([
      User.find({ role: "user" }).sort({ joinedAt: -1 }).limit(3),
      Invoice.find({ status: "Paid" }).sort({ date: -1 }).limit(3),
    ]);
    const items = [
      ...users.map((u) => ({
        text: `New user registered. ${fullName(u)} created a new account.`,
        at: u.joinedAt,
      })),
      ...invoices.map((i) => ({
        text: `Payment received. $${i.amount} ${i.planLabel} payment completed successfully.`,
        at: i.date,
      })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());
    res.json(items);
  }),
);

export default r;
