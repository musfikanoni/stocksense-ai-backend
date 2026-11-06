import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export interface MailInput { to: string; subject: string; text: string; html?: string }
export type MailProvider = "resend" | "smtp";

// Resend (HTTPS, works on Render) wins if both are set up
export const mailProvider = (): MailProvider | null =>
  env.mail.resendKey && env.mail.from ? "resend" : env.mail.smtpHost && env.mail.smtpUser && env.mail.smtpPass ? "smtp" : null;

let transport: nodemailer.Transporter | null = null;

export async function sendMail(m: MailInput): Promise<void> {
  const provider = mailProvider();
  const from = env.mail.from || env.mail.smtpUser;
  if (provider === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.mail.resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return;
  }
  if (provider === "smtp") {
    transport ??= nodemailer.createTransport({
      host: env.mail.smtpHost, port: env.mail.smtpPort, secure: env.mail.smtpPort === 465,
      auth: { user: env.mail.smtpUser, pass: env.mail.smtpPass }, connectionTimeout: 10000, socketTimeout: 15000,
    });
    await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text, html: m.html });
    return;
  }
  throw new Error("Email is not set up on this server.");
}
