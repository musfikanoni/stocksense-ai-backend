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

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type MailProvider = "resend" | "smtp" | "apps_script";

export const mailProvider = (): MailProvider | null => {
  const provider = env.mail.provider;

  if (provider === "apps_script" && env.mail.appsScriptUrl && env.mail.mailSecret) {
    return "apps_script";
  }

  if (provider === "resend" && env.mail.resendKey && env.mail.from) {
    return "resend";
  }

  if (env.mail.smtpHost && env.mail.smtpUser && env.mail.smtpPass) {
    return "smtp";
  }

  if (env.mail.resendKey && env.mail.from) {
    return "resend";
  }

  return null;
};

let transport: nodemailer.Transporter | null = null;

async function sendWithAppsScript(m: MailInput): Promise<void> {
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
      name: "StockSense Support",
      replyTo: env.mail.from || env.mail.smtpUser || "musfika1425@gmail.com",
    }),
    signal: AbortSignal.timeout(5000),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Apps Script HTTP error ${response.status}: ${responseText.slice(0, 300)}`
    );
  }

  let result: { success?: boolean; message?: string };

  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Invalid Apps Script response: ${responseText.slice(0, 300)}`
    );
  }

  if (!result.success) {
    throw new Error(
      `Apps Script email failed: ${result.message || "Unknown error"}`
    );
  }
}

export async function sendMail(m: MailInput): Promise<void> {
  const provider = mailProvider();

  if (!provider) {
    throw new Error(
      "Email provider is not configured correctly on this server."
    );
  }

  if (provider === "apps_script") {
    try {
      await sendWithAppsScript(m);
      return;
    } catch (err) {
      if (env.mail.smtpHost && env.mail.smtpUser && env.mail.smtpPass) {
        console.warn("Apps Script mail failed, trying SMTP fallback:", (err as Error).message);
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
        const sender = `"StockSense" <${env.mail.smtpUser}>`;
        await transport.sendMail({
          from: sender,
          to: m.to,
          subject: m.subject,
          text: m.text,
          html: m.html,
          headers: {
            "X-Priority": "3",
            "X-MSMail-Priority": "Normal",
            Importance: "Normal",
          },
        });
        return;
      }
      throw err;
    }
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
      throw new Error(
        `Resend answered ${response.status}: ${(await response.text()).slice(0, 300)}`
      );
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

    const sender = `"StockSense" <${env.mail.smtpUser}>`;
    await transport.sendMail({
      from: sender,
      to: m.to,
      subject: m.subject,
      text: m.text,
      html: m.html,
      headers: {
        "X-Priority": "3",
        "X-MSMail-Priority": "Normal",
        Importance: "Normal",
      },
    });
  }
}
