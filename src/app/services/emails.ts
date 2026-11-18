import { env } from "../config/env.js";
import type { MailInput } from "./mailer.js";

const esc = (s: string) =>
  String(s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c] as string)
  );

/**
 * Clean, modern light email shell optimized for primary inbox deliverability.
 * Avoids zero-pixel divs, hidden text, and spam trigger heuristics.
 */
const brandedShell = (title: string, inner: string, _previewText = "") => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; margin: 0; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
          <!-- Header -->
          <tr>
            <td style="padding: 24px 28px; border-bottom: 1px solid #f1f5f9;">
              <span style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px;">
                Stock<span style="color: #d97706;">Sense</span> AI
              </span>
            </td>
          </tr>
          <!-- Main Content -->
          <tr>
            <td style="padding: 28px 28px 24px 28px; color: #334155; font-size: 15px; line-height: 1.6;">
              ${inner}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 28px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; font-size: 12px; line-height: 1.5; color: #94a3b8; text-align: center; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;">
              <p style="margin: 0 0 6px 0; color: #64748b;">
                StockSense AI &bull; Smart Market Intelligence
              </p>
              <p style="margin: 0;">
                This is an automated security message. Please do not reply directly to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export const resetCodeEmail = (code: string): Omit<MailInput, "to"> => ({
  subject: "StockSense Verification Code",
  text: `Hello,\n\nWe received a request to reset your password for your StockSense AI account.\n\nYour 6-digit verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you did not request a password reset, please ignore this email and your password will remain unchanged.\n\nBest regards,\nStockSense AI Team`,
  html: brandedShell(
    "StockSense Verification Code",
    `
    <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a; font-weight: 600;">Password Reset Verification</h2>
    <p style="margin: 0 0 20px 0; color: #475569; font-size: 15px; line-height: 1.5;">We received a request to reset your StockSense account password. Use the verification code below to proceed:</p>
    
    <div style="text-align: center; margin: 24px 0;">
      <div style="display: inline-block; padding: 14px 28px; background-color: #fef9c3; border: 1px solid #fde047; border-radius: 8px; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #854d0e; font-family: Consolas, 'Courier New', monospace;">
        ${esc(code)}
      </div>
      <p style="margin: 10px 0 0 0; font-size: 13px; color: #64748b;">This code expires in 10 minutes.</p>
    </div>

    <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;">If you didn't request a password reset, you can safely ignore this email. Your account remains secure.</p>
    `
  ),
});

export const alertEmail = (title: string, body: string): Omit<MailInput, "to"> => ({
  subject: `[StockSense Alert] ${title}`,
  text: `${title}\n\n${body}\n\nManage your trading alerts: ${env.clientUrl}/alerts`,
  html: brandedShell(
    title,
    `
    <h2 style="margin: 0 0 12px 0; font-size: 20px; color: #0f172a; font-weight: 700;">${esc(title)}</h2>
    <p style="margin: 0 0 20px 0; color: #475569; font-size: 15px;">${esc(body)}</p>
    <div style="margin: 20px 0;">
      <a href="${esc(env.clientUrl)}/alerts" style="display: inline-block; padding: 11px 22px; background-color: #f59e0b; color: #ffffff; font-weight: 700; font-size: 14px; text-decoration: none; border-radius: 6px;">
        View in Dashboard &rarr;
      </a>
    </div>
    `
  ),
});

/**
 * Clean, light, high-deliverability confirmation email sent to the user
 */
export const contactConfirmationEmail = (name: string, message: string): Omit<MailInput, "to"> => {
  const ticketId = `SS-${Math.floor(100000 + Math.random() * 900000)}`;
  const dateStr = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return {
    subject: `Inquiry Received [#${ticketId}] - StockSense Support`,
    text: `Hello ${name},\n\nThank you for reaching out to StockSense Support! We have received your inquiry.\n\nTicket ID: #${ticketId}\nDate: ${dateStr}\n\nYour Message:\n"${message}"\n\nOur team is currently reviewing your message and will respond as soon as possible (typically within 24 hours).\n\nIf you have any additional information, feel free to reply directly to this email.\n\nBest regards,\nStockSense Support Team\n${env.clientUrl}`,
    html: brandedShell(
      `Inquiry Confirmation [#${ticketId}]`,
      `
      <!-- Ticket status header -->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
        <tr>
          <td>
            <span style="display: inline-block; font-size: 12px; font-weight: 600; color: #065f46; background-color: #ecfdf5; border: 1px solid #a7f3d0; padding: 3px 10px; border-radius: 6px;">
              &bull; Received &amp; Queued
            </span>
          </td>
          <td style="padding-left: 10px; font-size: 12px; color: #64748b;">
            Ticket <b>#${ticketId}</b> &bull; ${dateStr}
          </td>
        </tr>
      </table>

      <h1 style="margin: 0 0 12px 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">
        Hello ${esc(name)},
      </h1>

      <p style="margin: 0 0 20px 0; color: #475569; font-size: 15px; line-height: 1.6;">
        Thank you for contacting <b>StockSense</b>. We have successfully received your inquiry and our support team is currently reviewing it.
      </p>

      <!-- Message Recap Box -->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #f59e0b; border-radius: 6px;">
        <tr>
          <td style="padding: 14px 18px;">
            <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #b45309; margin-bottom: 6px;">
              Your Submitted Message
            </div>
            <div style="font-size: 14px; color: #1e293b; line-height: 1.6; word-break: break-word;">
              ${esc(message)}
            </div>
          </td>
        </tr>
      </table>

      <!-- What to expect -->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 20px 0; background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px;">
        <tr>
          <td style="padding: 14px 18px;">
            <div style="font-weight: 700; color: #1e293b; font-size: 13px; margin-bottom: 6px;">What happens next?</div>
            <p style="margin: 0 0 4px 0; font-size: 13px; color: #475569; line-height: 1.5;">
              &bull; <b>Response time:</b> A team member will reply within <b>24 hours</b>.
            </p>
            <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.5;">
              &bull; <b>Need to add more details?</b> You can simply reply directly to this email.
            </p>
          </td>
        </tr>
      </table>

      <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0; font-size: 14px; font-weight: 600; color: #0f172a;">StockSense Support Team</p>
        <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b;">support@stocksense.dev</p>
      </div>
      `,
      `Hi ${name}, we received your message (#${ticketId}) and our support team is reviewing it.`
    ),
  };
};

/**
 * Admin Notification Email
 */
export const contactAdminNotificationEmail = (
  name: string,
  senderEmail: string,
  message: string
): Omit<MailInput, "to"> => ({
  subject: `[Contact Form] New Message from ${name} (${senderEmail})`,
  text: `You have received a new contact form submission:\n\nSender: ${name}\nEmail: ${senderEmail}\nDate: ${new Date().toISOString()}\n\nMessage:\n${message}`,
  html: brandedShell(
    "New Contact Form Submission",
    `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 14px;">
      <tr>
        <td>
          <span style="display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; background-color: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; padding: 3px 8px; border-radius: 4px;">
            NEW INQUIRY
          </span>
        </td>
      </tr>
    </table>

    <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #0f172a; font-weight: 700;">
      New Contact Form Message
    </h2>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 18px; font-size: 14px;">
      <tr>
        <td style="padding: 5px 0; color: #64748b; width: 70px;"><b>Sender:</b></td>
        <td style="padding: 5px 0; color: #0f172a; font-weight: 600;">${esc(name)}</td>
      </tr>
      <tr>
        <td style="padding: 5px 0; color: #64748b;"><b>Email:</b></td>
        <td style="padding: 5px 0;"><a href="mailto:${esc(senderEmail)}" style="color: #2563eb; text-decoration: none; font-weight: 500;">${esc(senderEmail)}</a></td>
      </tr>
      <tr>
        <td style="padding: 5px 0; color: #64748b;"><b>Time:</b></td>
        <td style="padding: 5px 0; color: #334155;">${new Date().toLocaleString()}</td>
      </tr>
    </table>

    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #3b82f6; border-radius: 6px; margin: 16px 0;">
      <tr>
        <td style="padding: 14px 18px;">
          <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #1d4ed8; margin-bottom: 6px;">Message Content</div>
          <div style="font-size: 14px; color: #1e293b; line-height: 1.6; word-break: break-word;">${esc(message)}</div>
        </td>
      </tr>
    </table>

    <div style="margin-top: 20px;">
      <a href="mailto:${esc(senderEmail)}?subject=Re:%20Your%20StockSense%20Inquiry" style="display: inline-block; padding: 10px 20px; background-color: #f59e0b; color: #ffffff; font-weight: 700; font-size: 13px; text-decoration: none; border-radius: 6px;">
        Reply to ${esc(name)} &rarr;
      </a>
    </div>
    `
  ),
});
