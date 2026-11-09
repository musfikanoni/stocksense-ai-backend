import { Router } from "express";
import { me, requireAuth } from "../middleware/auth.js";
import { Notification } from "../models/Notification.js";
import { ah } from "../utils/asyncHandler.js";

const r = Router();
r.use(requireAuth);

// The bell menu: newest 20 and how many are unread
r.get("/", ah(async (req, res) => {
  const user = me(req);
  const [items, unread] = await Promise.all([
    Notification.find({ user: user._id }).sort({ createdAt: -1 }).limit(20),
    Notification.countDocuments({ user: user._id, read: false }),
  ]);
  res.json({ items, unread });
}));

r.post("/read-all", ah(async (req, res) => {
  await Notification.updateMany({ user: me(req)._id, read: false }, { read: true });
  res.json({ unread: 0 });
}));

export default r;
