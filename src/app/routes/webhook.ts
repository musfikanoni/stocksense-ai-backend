import type { RequestHandler } from "express";
import type Stripe from "stripe";
import { env } from "../config/env.js";
import { processEvent, requireStripe } from "../services/payments.js";
import { AppError } from "../utils/AppError.js";
import { ah } from "../utils/asyncHandler.js";

// Stripe calls this URL after a payment. It needs the raw body (see app.ts) so the signature can be checked.
// Only a request signed with our webhook secret is believed. Nothing the browser sends can upgrade a plan.
export const stripeWebhook: RequestHandler = ah(async (req, res) => {
  const stripe = requireStripe();
  if (!env.stripe.webhookSecret) throw new AppError(503, "Payments are not set up on this server.");
  const signature = req.headers["stripe-signature"];
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, String(signature ?? ""), env.stripe.webhookSecret);
  } catch {
    throw new AppError(400, "Invalid webhook signature.");
  }
  const result = await processEvent(event, stripe);
  res.json({ received: true, result });
});
