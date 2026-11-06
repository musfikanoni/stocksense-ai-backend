import { Router } from "express";
import { FREE_LIMITS } from "../config/env.js";
import { me, requireAuth } from "../middleware/auth.js";
import { Stock } from "../models/Stock.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/appError.js";
import { ah } from "../utils/asyncHandler.js";
import { toView } from "../utils/stockView.js";
import { symbol as sym } from "../utils/validate.js";

const r = Router();
r.use(requireAuth);

// Returns the user's stocks in the order they were added
const listFor = async (symbols: string[]) => {
  const docs = await Stock.find({ symbol: { $in: symbols } });
  return symbols.flatMap((s) => docs.filter((d) => d.symbol === s)).map(toView);
};

r.get(
  "/",
  ah(async (req, res) => {
    res.json(await listFor(me(req).watchlist));
  }),
);

r.post(
  "/",
  ah(async (req, res) => {
    const user = me(req);
    const s = sym(req.body?.symbol);
    if (!(await Stock.exists({ symbol: s, kind: "stock" })))
      throw new AppError(404, "Stock not found.");
    if (!user.watchlist.includes(s)) {
      if (
        user.planName === "Free" &&
        user.watchlist.length >= FREE_LIMITS.watchlist
      )
        throw new AppError(
          403,
          `The Free plan allows ${FREE_LIMITS.watchlist} stocks in your watchlist. Upgrade to Premium for unlimited.`,
        );
      user.watchlist.push(s);
      await User.updateOne({ _id: user._id }, { $addToSet: { watchlist: s } });
    }
    res.status(201).json(await listFor(user.watchlist));
  }),
);

r.delete(
  "/:symbol",
  ah(async (req, res) => {
    const user = me(req);
    const s = sym(req.params.symbol);
    await User.updateOne({ _id: user._id }, { $pull: { watchlist: s } });
    res.json(await listFor(user.watchlist.filter((x) => x !== s)));
  }),
);

export default r;
