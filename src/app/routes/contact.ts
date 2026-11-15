import { Router } from "express";
import { ah } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";
import { mailProvider, sendMail } from "../services/mailer.js";
import { contactConfirmationEmail, contactAdminNotificationEmail } from "../services/emails.js";
import { email as validateEmail, text } from "../utils/validate.js";
import { env } from "../config/env.js";

const r = Router();

r.post("/", ah(async (req, res) => {
  const name = text(req.body?.name, 1, 100, "Name");
  const senderEmail = validateEmail(req.body?.email);
  const message = text(req.body?.message, 1, 2000, "Message");

  if (!mailProvider()) {
    throw new AppError(500, "Email service is not configured on this server.");
  }

  const adminEmail = env.mail.from || env.mail.smtpUser || process.env.ADMIN_EMAIL || "musfika1425@gmail.com";

  // Send confirmation email to the user who submitted the message
  await sendMail({
    to: senderEmail,
    ...contactConfirmationEmail(name, message),
  });

  // Also send notification email to the admin/support team
  if (adminEmail && adminEmail.toLowerCase() !== senderEmail.toLowerCase()) {
    sendMail({
      to: adminEmail,
      ...contactAdminNotificationEmail(name, senderEmail, message),
    }).catch((err) => console.error("Admin contact alert error:", (err as Error).message));
  }

  res.json({ success: true, message: "Thank you! Your message has been sent successfully." });
}));

export default r;
