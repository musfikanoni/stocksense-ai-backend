import { Router } from "express";
import { me, requireAuth } from "../middleware/auth.js";
import { Review } from "../models/Review.js";
import { AppError } from "../utils/AppError.js";
import { ah } from "../utils/asyncHandler.js";

const r = Router();

// Public: list approved reviews for the landing page
r.get("/public", ah(async (_req, res) => {
  const reviews = await Review.find({ status: "approved" })
    .sort({ createdAt: -1 })
    .limit(16);
  res.json(reviews);
}));

// User's own review
r.get("/mine", requireAuth, ah(async (req, res) => {
  const user = me(req);
  const review = await Review.findOne({ user: user._id });
  res.json({ review: review || null });
}));

// Create or update review
r.post("/", requireAuth, ah(async (req, res) => {
  const user = me(req);
  const { rating, role, comment } = req.body || {};

  if (!comment || typeof comment !== "string" || !comment.trim()) {
    throw new AppError(400, "Review comment is required.");
  }

  const numRating = Number(rating);
  if (isNaN(numRating) || numRating < 1 || numRating > 5) {
    throw new AppError(400, "Rating must be between 1 and 5.");
  }

  const cleanRole = typeof role === "string" && role.trim() ? role.trim().slice(0, 50) : "Trader";
  const cleanComment = comment.trim().slice(0, 600);
  const userName =
    user.name || (user.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "Trader");

  const review = await Review.findOneAndUpdate(
    { user: user._id },
    {
      user: user._id,
      name: userName,
      avatarUrl: user.avatarUrl || "",
      role: cleanRole,
      rating: numRating,
      comment: cleanComment,
      status: "approved",
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  res.json({ message: "Review saved successfully.", review });
}));

// Delete user's own review
r.delete("/mine", requireAuth, ah(async (req, res) => {
  const user = me(req);
  await Review.deleteOne({ user: user._id });
  res.json({ message: "Review removed successfully." });
}));

export default r;
