import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface TokenPayload {
  sub: string;
  role?: string;
  purpose?: string;
  v?: number;         
  iat: number;
}

type Expires = jwt.SignOptions["expiresIn"];


export const signAccess = (user: { id?: unknown; role: string; tokenVersion?: number }): string =>
  jwt.sign({ sub: String(user.id), role: user.role, v: user.tokenVersion ?? 0 }, env.jwtSecret, { expiresIn: env.jwtExpires as Expires });

export const signReset = (user: { id?: unknown }): string => jwt.sign({ sub: String(user.id), purpose: "reset" }, env.jwtSecret, { expiresIn: "10m" });
export const verify = (token: string): TokenPayload => jwt.verify(token, env.jwtSecret) as unknown as TokenPayload;
