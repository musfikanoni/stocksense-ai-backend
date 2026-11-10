import { env } from "../config/env.js";
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const shell = (inner) => `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#111">${inner}<p style="color:#888;font-size:12px;margin-top:32px">StockSense is an educational project. Nothing here is financial advice.</p></div>`;
export const resetCodeEmail = (code) => ({
    subject: `${code} is your StockSense password reset code`,
    text: `Your StockSense password reset code is ${code}.\nIt works for 10 minutes. If you did not ask for it, ignore this email.`,
    html: shell(`<p>Your password reset code is</p><p style="font-size:30px;letter-spacing:6px"><b>${esc(code)}</b></p><p>It works for 10 minutes. If you did not ask for it, you can ignore this email.</p>`),
});
export const alertEmail = (title, body) => ({
    subject: title,
    text: `${body}\n\nManage your alerts: ${env.clientUrl}/alerts`,
    html: shell(`<h2 style="margin:0 0 12px">${esc(title)}</h2><p>${esc(body)}</p><p><a href="${esc(env.clientUrl)}/alerts">Manage your alerts</a></p>`),
});
//# sourceMappingURL=emails.js.map