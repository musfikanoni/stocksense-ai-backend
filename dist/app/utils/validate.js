import { AppError } from "./AppError.js";
export const email = (v) => {
    if (typeof v !== "string" || v.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()))
        throw new AppError(400, "Enter a valid email address.");
    return v.trim().toLowerCase();
};
export const text = (v, min, max, label) => {
    if (typeof v !== "string" || v.trim().length < min || v.trim().length > max)
        throw new AppError(400, `${label} must be ${min} to ${max} characters.`);
    return v.trim();
};
export const password = (v, label = "Password") => {
    if (typeof v !== "string" || v.length < 8 || v.length > 72)
        throw new AppError(400, `${label} must be 8 to 72 characters.`);
    return v;
};
export const symbol = (v) => {
    if (typeof v !== "string" || !/^[A-Za-z.]{1,10}$/.test(v))
        throw new AppError(400, "Enter a valid stock symbol.");
    return v.toUpperCase();
};
export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const oneOf = (v, list, label) => {
    if (!list.includes(v))
        throw new AppError(400, `${label} must be one of: ${list.join(", ")}.`);
    return v;
};
export const pageOf = (q) => {
    const page = Math.max(1, parseInt(String(q.page)) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(q.limit)) || 20));
    return { page, limit, skip: (page - 1) * limit };
};
//# sourceMappingURL=validate.js.map