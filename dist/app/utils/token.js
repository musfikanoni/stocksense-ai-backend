import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
export const signAccess = (user) => jwt.sign({ sub: String(user.id), role: user.role, v: user.tokenVersion ?? 0 }, env.jwtSecret, { expiresIn: env.jwtExpires });
export const signReset = (user) => jwt.sign({ sub: String(user.id), purpose: "reset" }, env.jwtSecret, { expiresIn: "10m" });
export const verify = (token) => jwt.verify(token, env.jwtSecret);
//# sourceMappingURL=token.js.map