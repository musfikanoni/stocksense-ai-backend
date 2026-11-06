import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { env } from "../config/env.js";
import { me, requireAuth } from "../middleware/auth.js";
import { Alert } from "../models/Alert.js";
import { User, type UserDoc } from "../models/User.js";
import { AppError } from "../utils/appError.js";
import { ah } from "../utils/asyncHandler.js";
import { DISCORD_URL, postToDiscord } from "../services/discord.js";
import { resetCodeEmail } from "../services/emails.js";
import { mailProvider, sendMail } from "../services/mailer.js";
import {
  isAvatarUrl,
  removeAvatar,
  uploadTicket,
} from "../utils/cloudinary.js";
import {
  signInWithGoogle,
  verifyGoogleCredential,
} from "../utils/googleAuth.js";
import {
  signAccess,
  signReset,
  verify,
  type TokenPayload,
} from "../utils/token.js";
import { email, password, text } from "../utils/validate.js";

const r = Router();
const hash = (pw: string) => bcrypt.hash(pw, env.bcryptRounds);
// Compared against when the email is unknown, so "no such user" takes as long as "wrong password"
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", env.bcryptRounds);
const session = (user: UserDoc) => ({ token: signAccess(user), user });
const codeHash = (code: string, mail: string) =>
  crypto
    .createHash("sha256")
    .update(`${code}:${mail}:${env.jwtSecret}`)
    .digest("hex");
const same = (a: string, b: string) =>
  a.length === b.length &&
  crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const str = (v: unknown) => (typeof v === "string" ? v : "");

r.post(
  "/signup",
  ah(async (req, res) => {
    const b = req.body || {};
    const [first, ...rest] = text(b.name, 2, 80, "Name").split(/\s+/);
    const mail = email(b.email);
    const pw = password(b.password);
    if (await User.exists({ email: mail }))
      throw new AppError(409, "An account with this email already exists.");
    const user = await User.create({
      firstName: first,
      lastName: rest.join(" "),
      email: mail,
      passwordHash: await hash(pw),
      lastLoginAt: new Date(),
    });
    res.status(201).json(session(user));
  }),
);

r.post(
  "/login",
  ah(async (req, res) => {
    const b = req.body || {};
    const mail = email(b.email);
    const user = await User.findOne({ email: mail }).select("+passwordHash");
    const ok = await bcrypt.compare(
      str(b.password),
      user?.passwordHash ?? DUMMY_HASH,
    );
    if (!user || !user.passwordHash || !ok)
      throw new AppError(401, "Invalid email or password.");
    if (user.blocked)
      throw new AppError(403, "This account is blocked. Contact support.");
    user.lastLoginAt = new Date();
    await user.save();
    res.json(session(user));
  }),
);

// "Continue with Google": the frontend sends the ID token it got from Google
r.post(
  "/google",
  ah(async (req, res) => {
    const profile = await verifyGoogleCredential(req.body?.credential);
    res.json(session(await signInWithGoogle(profile)));
  }),
);

r.post(
  "/forgot-password",
  ah(async (req, res) => {
    const mail = email(req.body?.email);
    // Same answer either way, so nobody can probe which emails exist
    const out: { message: string; devOtp?: string } = {
      message: "If that email has an account, we sent a 6-digit code.",
    };
    const user = await User.findOne({ email: mail });
    if (user && !user.blocked) {
      const code = String(crypto.randomInt(100000, 1000000));
      user.resetOtp = {
        hash: codeHash(code, mail),
        expires: new Date(Date.now() + 10 * 60 * 1000),
        attempts: 0,
      };
      await user.save();
      // Sent without waiting, so the answer takes the same time whether or not the email has an account
      if (mailProvider())
        void sendMail({ to: mail, ...resetCodeEmail(code) }).catch((e) =>
          console.error(
            `Could not send the reset code email: ${(e as Error).message}`,
          ),
        );
      else
        console.warn(
          "A reset code was made but email is not set up (see README), so nobody can receive it.",
        );
      if (env.showDevOtp) {
        out.devOtp = code;
        console.log(`[dev] reset code for ${mail}: ${code}`);
      }
    }
    res.json(out);
  }),
);

r.post(
  "/verify-otp",
  ah(async (req, res) => {
    const mail = email(req.body?.email);
    const code = String(req.body?.otp ?? "");
    const bad = () => new AppError(400, "That code is invalid or has expired.");
    const user = await User.findOne({ email: mail }).select("+resetOtp");
    const otp = user?.resetOtp;
    if (
      !user ||
      !otp?.hash ||
      !otp.expires ||
      !/^\d{6}$/.test(code) ||
      otp.expires < new Date() ||
      (otp.attempts ?? 0) >= 5
    )
      throw bad();
    otp.attempts = (otp.attempts ?? 0) + 1;
    if (!same(codeHash(code, mail), otp.hash)) {
      await user.save();
      throw bad();
    }
    user.resetOtp = undefined;
    await user.save();
    res.json({ resetToken: signReset(user) });
  }),
);

r.post(
  "/reset-password",
  ah(async (req, res) => {
    const pw = password(req.body?.password, "New password");
    const expired = () =>
      new AppError(400, "This reset link has expired. Start again.");
    let payload: TokenPayload;
    try {
      payload = verify(str(req.body?.resetToken));
    } catch {
      throw expired();
    }
    if (payload.purpose !== "reset") throw expired();
    const user = await User.findById(payload.sub);
    if (!user) throw expired();
    user.passwordHash = await hash(pw);
    user.passwordChangedAt = new Date();
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();
    res.json({ message: "Password updated. You can log in now." });
  }),
);

// ---- logged-in routes
r.get("/me", requireAuth, (req, res) => {
  res.json({ user: me(req) });
});

r.patch(
  "/me",
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {};
    const user = me(req);
    if (b.firstName !== undefined)
      user.firstName = text(b.firstName, 1, 40, "First name");
    if (b.lastName !== undefined)
      user.lastName =
        b.lastName === "" ? "" : text(b.lastName, 1, 40, "Last name");
    if (b.discordWebhookUrl !== undefined) {
      if (b.discordWebhookUrl === "" || b.discordWebhookUrl === null)
        user.discordWebhookUrl = undefined;
      else if (
        typeof b.discordWebhookUrl === "string" &&
        DISCORD_URL.test(b.discordWebhookUrl)
      )
        user.discordWebhookUrl = b.discordWebhookUrl;
      else
        throw new AppError(
          400,
          "That is not a Discord webhook address. It looks like https://discord.com/api/webhooks/123/abc.",
        );
    }
    await user.save();
    res.json({ user });
  }),
);

// Sends one message to the user's Discord webhook so they can see it works
r.post(
  "/me/discord/test",
  requireAuth,
  ah(async (req, res) => {
    const user = await User.findById(me(req).id);
    if (!user?.discordWebhookUrl)
      throw new AppError(400, "Add your Discord webhook address first.");
    try {
      await postToDiscord(
        user.discordWebhookUrl,
        "StockSense is connected. Your alerts will appear here.",
      );
    } catch {
      throw new AppError(
        502,
        "Discord did not accept the message. Check the webhook address.",
      );
    }
    res.json({ message: "Test message sent." });
  }),
);

r.patch(
  "/me/password",
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {};
    const next = password(b.newPassword, "New password");
    const user = await User.findById(me(req).id).select("+passwordHash");
    if (!user) throw new AppError(401, "Please log in.");
    if (!user.passwordHash)
      throw new AppError(
        400,
        "This account signs in with Google and has no password yet. Use Forgot password to set one.",
      );
    if (!(await bcrypt.compare(str(b.currentPassword), user.passwordHash)))
      throw new AppError(400, "Current password is wrong.");
    user.passwordHash = await hash(next);
    user.passwordChangedAt = new Date();
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();
    res.json(session(user)); // old tokens stop working, so we hand back a fresh one
  }),
);

r.delete(
  "/me",
  requireAuth,
  ah(async (req, res) => {
    const user = await User.findById(me(req).id).select("+passwordHash");
    if (!user) throw new AppError(401, "Please log in.");
    // Password accounts confirm with the password. Google-only accounts confirm by typing their email.
    const confirmed = user.passwordHash
      ? await bcrypt.compare(str(req.body?.password), user.passwordHash)
      : str(req.body?.confirm).toLowerCase() === user.email;
    if (!confirmed)
      throw new AppError(
        400,
        user.passwordHash
          ? "Password is wrong."
          : "Type your email address to confirm.",
      );
    if (user.role === "admin")
      throw new AppError(403, "Admin accounts cannot be deleted here.");
    await removeAvatar(String(user.id));
    await Promise.all([
      Alert.deleteMany({ user: user._id }),
      User.deleteOne({ _id: user._id }),
    ]);
    res.json({ message: "Account deleted." });
  }),
);

// ---- profile picture (Cloudinary). Flow: 1) ask for a signed ticket  2) browser uploads the file to Cloudinary  3) send us the address
r.post(
  "/me/avatar/signature",
  requireAuth,
  ah(async (req, res) => {
    res.json(uploadTicket(String(me(req).id)));
  }),
);

r.patch(
  "/me/avatar",
  requireAuth,
  ah(async (req, res) => {
    const user = me(req);
    const url = str(req.body?.url);
    if (!isAvatarUrl(url, String(user.id)))
      throw new AppError(400, "That picture address is not valid.");
    user.avatarUrl = url;
    await user.save();
    res.json({ user });
  }),
);

r.delete(
  "/me/avatar",
  requireAuth,
  ah(async (req, res) => {
    const user = me(req);
    user.avatarUrl = undefined;
    await user.save();
    await removeAvatar(String(user.id));
    res.json({ user });
  }),
);

export default r;
