import { Router } from "express";
import { me, requireAuth } from "../middleware/auth.js";
import { Invoice } from "../models/Invoice.js";
import { Plan } from "../models/Plan.js";
import { planLabelOf } from "../models/User.js";
import { createCheckout, createPortal } from "../services/payments.js";
import { AppError } from "../utils/AppError.js";
import { ah } from "../utils/asyncHandler.js";
import { oneOf } from "../utils/validate.js";
const r = Router();
r.use(requireAuth);
r.get("/", ah(async (req, res) => {
    const user = me(req);
    const invoices = await Invoice.find({ user: user._id }).sort({ date: -1 });
    res.json({
        plan: {
            name: user.planName, billing: user.billingCycle ?? null, label: planLabelOf(user), status: user.subscriptionStatus ?? null,
            cancelAtPeriodEnd: user.cancelAtPeriodEnd ?? false, currentPeriodEnd: user.currentPeriodEnd ?? null,
        },
        invoices,
    });
}));
r.post("/checkout", ah(async (req, res) => {
    const plan = await Plan.findById(String(req.body?.planId ?? ""));
    if (!plan)
        throw new AppError(404, "Plan not found.");
    const cycle = oneOf(req.body?.cycle ?? "Monthly", ["Monthly", "Yearly"], "Billing cycle");
    res.json({ url: await createCheckout(me(req), plan, cycle) });
}));
r.post("/portal", ah(async (req, res) => { res.json({ url: await createPortal(me(req)) }); }));
export default r;
//# sourceMappingURL=billing.js.map