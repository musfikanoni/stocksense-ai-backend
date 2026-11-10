import { env } from "../config/env.js";
import { processEvent, requireStripe } from "../services/payments.js";
import { AppError } from "../utils/AppError.js";
import { ah } from "../utils/asyncHandler.js";
export const stripeWebhook = ah(async (req, res) => {
    const stripe = requireStripe();
    if (!env.stripe.webhookSecret)
        throw new AppError(503, "Payments are not set up on this server.");
    const signature = req.headers["stripe-signature"];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, String(signature ?? ""), env.stripe.webhookSecret);
    }
    catch {
        throw new AppError(400, "Invalid webhook signature.");
    }
    const result = await processEvent(event, stripe);
    res.json({ received: true, result });
});
//# sourceMappingURL=webhook.js.map