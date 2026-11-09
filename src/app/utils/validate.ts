import { AppError } from "./AppError.js";

export const email = (v: unknown): string => {
  if (typeof v !== "string" || v.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) throw new AppError(400, "Enter a valid email address.");
  return v.trim().toLowerCase();
};
export const text = (v: unknown, min: number, max: number, label: string): string => {
  if (typeof v !== "string" || v.trim().length < min || v.trim().length > max) throw new AppError(400, `${label} must be ${min} to ${max} characters.`);
  return v.trim();
};

export const password = (v: unknown, label = "Password"): string => {
  if (typeof v !== "string" || v.length < 8 || v.length > 72) throw new AppError(400, `${label} must be 8 to 72 characters.`);
  return v;
};
export const symbol = (v: unknown): string => {
  if (typeof v !== "string" || !/^[A-Za-z.]{1,10}$/.test(v)) throw new AppError(400, "Enter a valid stock symbol.");
  return v.toUpperCase();
};
export const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const oneOf = <T extends string>(v: unknown, list: readonly T[], label: string): T => {
  if (!list.includes(v as T)) throw new AppError(400, `${label} must be one of: ${list.join(", ")}.`);
  return v as T;
};
export const pageOf = (q: Record<string, unknown>) => {
  const page = Math.max(1, parseInt(String(q.page)) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(q.limit)) || 20));
  return { page, limit, skip: (page - 1) * limit };
};
