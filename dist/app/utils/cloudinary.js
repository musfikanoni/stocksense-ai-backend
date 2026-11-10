import crypto from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "./AppError.js";
export function sign(params, secret) {
    const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
    return crypto.createHash("sha1").update(toSign + secret).digest("hex");
}
const { cloudName, apiKey, apiSecret } = env.cloudinary;
const configured = () => Boolean(cloudName && apiKey && apiSecret);
export const avatarPublicId = (userId) => `stocksense/avatars/${userId}`;
export function uploadTicket(userId) {
    if (!configured())
        throw new AppError(503, "Profile pictures are not set up on this server.");
    const timestamp = Math.floor(Date.now() / 1000);
    const fields = { allowed_formats: "jpg,jpeg,png,webp", invalidate: "true", overwrite: "true", public_id: avatarPublicId(userId) };
    return {
        uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        apiKey, timestamp, signature: sign({ ...fields, timestamp }, apiSecret), fields,
    };
}
export function isAvatarUrl(url, userId) {
    if (!cloudName)
        return false;
    try {
        const u = new URL(url);
        return u.protocol === "https:" && u.hostname === "res.cloudinary.com" && u.pathname.startsWith(`/${cloudName}/image/upload/`) && u.pathname.includes(avatarPublicId(userId));
    }
    catch {
        return false;
    }
}
export const thumb = (url) => url.includes("/image/upload/c_fill") ? url : url.replace("/image/upload/", "/image/upload/c_fill,g_auto,w_256,h_256,f_auto,q_auto/");
export async function removeAvatar(userId) {
    if (!configured())
        return;
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const params = { invalidate: "true", public_id: avatarPublicId(userId), timestamp };
        await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
            method: "POST",
            body: new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), api_key: apiKey, signature: sign(params, apiSecret) }),
            signal: AbortSignal.timeout(8000),
        });
    }
    catch (e) {
        console.warn("Could not delete the old picture:", e.message);
    }
}
//# sourceMappingURL=cloudinary.js.map