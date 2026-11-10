// import nodemailer from "nodemailer";
// import { env } from "../config/env.js";
// export interface MailInput { to: string; subject: string; text: string; html?: string }
// export type MailProvider = "resend" | "smtp";
// export const mailProvider = (): MailProvider | null =>
//   env.mail.resendKey && env.mail.from ? "resend" : env.mail.smtpHost && env.mail.smtpUser && env.mail.smtpPass ? "smtp" : null;
// let transport: nodemailer.Transporter | null = null;
// export async function sendMail(m: MailInput): Promise<void> {
//   const provider = mailProvider();
//   const from = env.mail.from || env.mail.smtpUser;
//   if (provider === "resend") {
//     const res = await fetch("https://api.resend.com/emails", {
//       method: "POST",
//       headers: { Authorization: `Bearer ${env.mail.resendKey}`, "Content-Type": "application/json" },
//       body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
//       signal: AbortSignal.timeout(10000),
//     });
//     if (!res.ok) throw new Error(`Resend answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
//     return;
//   }
//   if (provider === "smtp") {
//     transport ??= nodemailer.createTransport({
//       host: env.mail.smtpHost, port: env.mail.smtpPort, secure: env.mail.smtpPort === 465,
//       auth: { user: env.mail.smtpUser, pass: env.mail.smtpPass }, connectionTimeout: 10000, socketTimeout: 15000,
//     });
//     await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text, html: m.html });
//     return;
//   }
//   throw new Error("Email is not set up on this server.");
// }
import { env } from "../config/env.js";
import nodemailer from "nodemailer";
export const mailProvider = () => {
    const provider = env.mail.provider;
    if (provider === "apps_script") {
        return env.mail.appsScriptUrl && env.mail.mailSecret
            ? "apps_script"
            : null;
    }
    if (provider === "resend") {
        return env.mail.resendKey && env.mail.from ? "resend" : null;
    }
    if (provider === "smtp") {
        return env.mail.smtpHost &&
            env.mail.smtpUser &&
            env.mail.smtpPass
            ? "smtp"
            : null;
    }
    return null;
};
let transport = null;
async function sendWithAppsScript(m) {
    const response = await fetch(env.mail.appsScriptUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            secret: env.mail.mailSecret,
            to: m.to,
            subject: m.subject,
            text: m.text,
            html: m.html,
        }),
        signal: AbortSignal.timeout(15000),
    });
    const responseText = await response.text();
    if (!response.ok) {
        throw new Error(`Apps Script HTTP error ${response.status}: ${responseText.slice(0, 300)}`);
    }
    let result;
    try {
        result = JSON.parse(responseText);
    }
    catch {
        throw new Error(`Invalid Apps Script response: ${responseText.slice(0, 300)}`);
    }
    if (!result.success) {
        throw new Error(`Apps Script email failed: ${result.message || "Unknown error"}`);
    }
}
export async function sendMail(m) {
    const provider = mailProvider();
    if (!provider) {
        throw new Error("Email provider is not configured correctly on this server.");
    }
    if (provider === "apps_script") {
        await sendWithAppsScript(m);
        return;
    }
    if (provider === "resend") {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.mail.resendKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: env.mail.from,
                to: [m.to],
                subject: m.subject,
                text: m.text,
                html: m.html,
            }),
            signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) {
            throw new Error(`Resend answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
        }
        return;
    }
    if (provider === "smtp") {
        transport ??= nodemailer.createTransport({
            host: env.mail.smtpHost,
            port: env.mail.smtpPort,
            secure: env.mail.smtpPort === 465,
            auth: {
                user: env.mail.smtpUser,
                pass: env.mail.smtpPass,
            },
            connectionTimeout: 10000,
            socketTimeout: 15000,
        });
        await transport.sendMail({
            from: env.mail.smtpUser,
            to: m.to,
            subject: m.subject,
            text: m.text,
            html: m.html,
        });
    }
}
//# sourceMappingURL=mailer.js.map