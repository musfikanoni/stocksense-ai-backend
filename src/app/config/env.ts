// import { existsSync } from "node:fs";
// import "dotenv/config";

// const missing = ["MONGODB_URI", "JWT_SECRET"].filter((k) => !process.env[k]);
// if (missing.length) {
//   const hint = existsSync(".env")
//     ? `Open your .env file and fill in: ${missing.join(", ")}.`
//     : `There is no ".env" file in ${process.cwd()}. Copy .env.example to a new file named ".env" (Windows: copy .env.example .env), fill it in, then run the command again.`;
//   throw new Error(`Missing ${missing.join(", ")}. ${hint}`);
// }
// if ((process.env.JWT_SECRET as string).length < 16) throw new Error("JWT_SECRET must be at least 16 characters.");

// const isProd = process.env.NODE_ENV === "production";

// export const env = {
//   nodeEnv: process.env.NODE_ENV || "development",
//   isProd,
//   isTest: process.env.NODE_ENV === "test",
//   port: Number(process.env.PORT) || 5000,
//   mongoUri: process.env.MONGODB_URI as string,
//   jwtSecret: process.env.JWT_SECRET as string,
//   jwtExpires: process.env.JWT_EXPIRES || "7d",
//   clientUrls: (process.env.CLIENT_URL || "http://localhost:3000").split(",").map((s) => s.trim()),
//   geminiKey: process.env.GEMINI_API_KEY || "",
//   geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
//   bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,
  
//   marketMode: (process.env.MARKET_DATA_MODE === "simulated" ? "simulated" : "live") as "live" | "simulated",
//   twelveDataKey: process.env.TWELVE_DATA_API_KEY || "",
//   quoteRefreshMinutes: Math.max(5, Number(process.env.QUOTE_REFRESH_MINUTES) || 30),

//   jobsEnabled: process.env.JOBS_ENABLED ? process.env.JOBS_ENABLED === "true" : process.env.NODE_ENV !== "test",
//   mail: {
//     resendKey: process.env.RESEND_API_KEY || "",
//     from: process.env.MAIL_FROM || "",
//     smtpHost: process.env.SMTP_HOST || "",
//     smtpPort: Number(process.env.SMTP_PORT) || 587,
//     smtpUser: process.env.SMTP_USER || "",
//     smtpPass: process.env.SMTP_PASS || "",
//   },
//   clientUrl: (process.env.CLIENT_URL || "http://localhost:3000").split(",")[0].trim(),
//   stripe: { secretKey: process.env.STRIPE_SECRET_KEY || "", webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "" },
//   googleClientId: process.env.GOOGLE_CLIENT_ID || "",
//   cloudinary: {
//     cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
//     apiKey: process.env.CLOUDINARY_API_KEY || "",
//     apiSecret: process.env.CLOUDINARY_API_SECRET || "",
//   },

//   showDevOtp: process.env.SHOW_DEV_OTP === "true" && !isProd,
// };


// export const FREE_LIMITS = { watchlist: 5, alerts: 3 };




import { existsSync } from "node:fs";
import "dotenv/config";

const missing = ["MONGODB_URI", "JWT_SECRET"].filter(
  (key) => !process.env[key]
);

if (missing.length) {
  const hint = existsSync(".env")
    ? `Open your .env file and fill in: ${missing.join(", ")}.`
    : `There is no ".env" file in ${process.cwd()}. Copy .env.example to .env and fill it in.`;

  throw new Error(`Missing ${missing.join(", ")}. ${hint}`);
}

if ((process.env.JWT_SECRET as string).length < 16) {
  throw new Error("JWT_SECRET must be at least 16 characters.");
}

const isProd = process.env.NODE_ENV === "production";

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProd,
  isTest: process.env.NODE_ENV === "test",

  port: Number(process.env.PORT) || 5000,

  mongoUri: process.env.MONGODB_URI as string,
  jwtSecret: process.env.JWT_SECRET as string,
  jwtExpires: process.env.JWT_EXPIRES || "7d",

  clientUrls: (process.env.CLIENT_URL || "http://localhost:3000")
    .split(",")
    .map((s) => s.trim()),

  clientUrl: (process.env.CLIENT_URL || "http://localhost:3000")
    .split(",")[0]
    .trim(),

  geminiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",

  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,

  marketMode: (
    process.env.MARKET_DATA_MODE === "simulated" ? "simulated" : "live"
  ) as "live" | "simulated",

  twelveDataKey: process.env.TWELVE_DATA_API_KEY || "",

  // Minimum refresh interval: 1 minute
  quoteRefreshMinutes: Math.max(
    1,
    Number(process.env.QUOTE_REFRESH_MINUTES) || 1
  ),

  jobsEnabled: process.env.JOBS_ENABLED
    ? process.env.JOBS_ENABLED === "true"
    : process.env.NODE_ENV !== "test",

  mail: {
    provider: process.env.MAIL_PROVIDER || "resend",

    resendKey: process.env.RESEND_API_KEY || "",
    from: process.env.MAIL_FROM || "",

    smtpHost: process.env.SMTP_HOST || "",
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    smtpUser: process.env.SMTP_USER || "",
    smtpPass: process.env.SMTP_PASS || "",

    appsScriptUrl: process.env.APPS_SCRIPT_URL || "",
    mailSecret: process.env.MAIL_SECRET || "",
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  },

  googleClientId: process.env.GOOGLE_CLIENT_ID || "",

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
  },

  showDevOtp: process.env.SHOW_DEV_OTP === "true" && !isProd,
};

export const FREE_LIMITS = {
  watchlist: 5,
  alerts: 3,
};
