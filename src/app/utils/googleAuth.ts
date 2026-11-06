import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";
import { User, type UserDoc } from "../models/User.js";
import { AppError } from "./AppError.js";

export interface GoogleProfile {
  sub: string;           
  email: string;
  emailVerified: boolean;
  name: string;
}

const client = env.googleClientId ? new OAuth2Client(env.googleClientId) : null;

export async function verifyGoogleCredential(credential: unknown): Promise<GoogleProfile> {
  if (!client) throw new AppError(503, "Google sign-in is not set up on this server.");
  if (typeof credential !== "string" || credential.length < 20 || credential.length > 4000) throw new AppError(400, "Google sign-in failed. Try again.");
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: env.googleClientId });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email) throw new Error("no email in token");
    return { sub: p.sub, email: p.email.toLowerCase(), emailVerified: p.email_verified === true, name: p.name ?? "" };
  } catch {
    throw new AppError(401, "Google sign-in failed. Try again.");
  }
}

export async function signInWithGoogle(p: GoogleProfile): Promise<UserDoc> {
  if (!p.emailVerified) throw new AppError(401, "Your Google email is not verified.");
  let user = await User.findOne({ googleId: p.sub });
  if (!user) {

    if (await User.exists({ email: p.email })) throw new AppError(409, "An account with this email already exists. Log in with your password.");
    const [first, ...rest] = (p.name || p.email.split("@")[0]).trim().split(/\s+/);
    user = new User({ firstName: first.slice(0, 40), lastName: rest.join(" ").slice(0, 40), email: p.email, googleId: p.sub });
  }
  if (user.blocked) throw new AppError(403, "This account is blocked. Contact support.");
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}
