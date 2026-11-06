import { Router } from "express";
import { Plan } from "../models/Plan.js";
import { Policy } from "../models/Policy.js";
import { ah } from "../utils/asyncHandler.js";

export const plansRouter = Router();
plansRouter.get("/", ah(async (_req, res) => { res.json(await Plan.find().sort({ price: 1 })); }));

// Public: the policy text shown on the Settings > Policy & Agreement tab
export const policyRouter = Router();
policyRouter.get("/", ah(async (_req, res) => {
  const docs = await Policy.find();
  res.json(Object.fromEntries(docs.map((d) => [d.key, { title: d.title, text: d.text, updatedAt: d.updatedAt }])));
}));
