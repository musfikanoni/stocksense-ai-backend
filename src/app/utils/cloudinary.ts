import crypto from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "./AppError.js";

// Profile pictures go straight from the browser to Cloudinary. This server only signs the upload
// (so nobody else can upload to our account) and then saves the picture's address.
type Params = Record<string, string | number | boolean>;

// Cloudinary's signature: sort the parameters by name, join them as name=value with "&", add the API secret, SHA-1 hash.
export function sign(params: Params, secret: string): string {
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return crypto.createHash("sha1").update(toSign + secret).digest("hex");
}

const { cloudName, apiKey, apiSecret } = env.cloudinary;
const configured = () => Boolean(cloudName && apiKey && apiSecret);
// One picture per user: uploading again replaces the old one
export const avatarPublicId = (userId: string) => `stocksense/avatars/${userId}`;

export function uploadTicket(userId: string) {
  if (!configured()) throw new AppError(503, "Profile pictures are not set up on this server.");
  const timestamp = Math.floor(Date.now() / 1000);
  const fields = { allowed_formats: "jpg,jpeg,png,webp", invalidate: "true", overwrite: "true", public_id: avatarPublicId(userId) };
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    apiKey, timestamp, signature: sign({ ...fields, timestamp }, apiSecret), fields,
  };
}

// Only accept addresses that really point at this user's picture in our Cloudinary account
export function isAvatarUrl(url: string, userId: string): boolean {
  if (!cloudName) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "res.cloudinary.com" && u.pathname.startsWith(`/${cloudName}/image/upload/`) && u.pathname.includes(avatarPublicId(userId));
  } catch { return false; }
}

// Square 256px version, smart crop, best format. Cloudinary makes it on the fly from the same address.
export const thumb = (url: string): string =>
  url.includes("/image/upload/c_fill") ? url : url.replace("/image/upload/", "/image/upload/c_fill,g_auto,w_256,h_256,f_auto,q_auto/");

export async function removeAvatar(userId: string): Promise<void> {
  if (!configured()) return;
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const params = { invalidate: "true", public_id: avatarPublicId(userId), timestamp };
    await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
      method: "POST",
      body: new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), api_key: apiKey, signature: sign(params, apiSecret) }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) { console.warn("Could not delete the old picture:", (e as Error).message); }
}
