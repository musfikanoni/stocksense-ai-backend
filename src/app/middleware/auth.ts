import type { Request, RequestHandler } from "express";
import { User, type Role, type UserDoc } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { ah } from "../utils/asyncHandler.js";
import { verify, type TokenPayload } from "../utils/token.js";

// Reads the Bearer token, checks it, and loads the user. Runs on every protected route.
export const requireAuth: RequestHandler = ah(async (req, _res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new AppError(401, "Please log in.");
  let payload: TokenPayload;
  try {
    payload = verify(token);
  } catch {
    throw new AppError(401, "Your session has expired. Please log in again.");
  }
  if (payload.purpose) throw new AppError(401, "Please log in.");
  const user = await User.findById(payload.sub);
  if (!user) throw new AppError(401, "Please log in.");
  if (user.blocked)
    throw new AppError(403, "This account is blocked. Contact support.");
  // A password change raises the version, so every token made before it stops working
  if ((payload.v ?? 0) !== (user.tokenVersion ?? 0))
    throw new AppError(401, "Password changed. Please log in again.");
  req.user = user;
  next();
});

export const requireRole =
  (role: Role): RequestHandler =>
  (req, _res, next) =>
    req.user?.role === role
      ? next()
      : next(new AppError(403, "You do not have access to this."));

// Inside a route that already passed requireAuth, this gives the user with a proper type
export const me = (req: Request): UserDoc => {
  if (!req.user) throw new AppError(401, "Please log in.");
  return req.user;
};
