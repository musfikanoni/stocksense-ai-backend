
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDb } from "../config/db.js";
import { env } from "../config/env.js";
import { Alert } from "../models/Alert.js";
import { Invoice, type InvoiceStatus } from "../models/Invoice.js";
import { Plan } from "../models/Plan.js";
import { Policy } from "../models/Policy.js";
import { Stock } from "../models/Stock.js";
import { User, type IUser, type UserDoc } from "../models/User.js";
import * as data from "./data.js";

const DAY = 86400000;
const adminEmail = (process.env.ADMIN_EMAIL || "admin@stocksense.dev").toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || "Admin@12345";

await connectDb();
if (process.argv.includes("--reset")) {
  await Promise.all([Alert.deleteMany({}), Invoice.deleteMany({}), Plan.deleteMany({}), Policy.deleteMany({}), Stock.deleteMany({}), User.deleteMany({})]);
  console.log("Old data removed.");
}

for (const s of [...data.stocks, ...data.indexes]) {
  // Only the list of stocks. Prices are filled in by the background job from the market data provider.
  await Stock.updateOne({ symbol: s.symbol }, { $set: { name: s.name, kind: s.kind, exchange: s.exchange }, $setOnInsert: { closes: [], closeDates: [] } }, { upsert: true });
}
for (const p of data.plans) await Plan.updateOne({ name: p.name }, { $set: p }, { upsert: true });
for (const p of data.policies) await Policy.updateOne({ key: p.key }, { $setOnInsert: { ...p, updatedAt: new Date() } }, { upsert: true });

const hash = (pw: string) => bcrypt.hash(pw, env.bcryptRounds);
async function addUser(fields: Partial<IUser> & { email: string; firstName: string }, password: string): Promise<UserDoc | null> {
  if (await User.exists({ email: fields.email })) return null;
  return User.create({ ...fields, passwordHash: await hash(password) });
}
const invoice = (user: UserDoc, billing: "Monthly" | "Yearly", status: InvoiceStatus, daysAgo: number) =>
  Invoice.create({
    user: user._id, tx: `inv_${crypto.randomBytes(10).toString("hex")}`, planName: "Premium", billing, planLabel: `Premium (${billing})`,
    amount: billing === "Yearly" ? 1200 : 120, status, date: new Date(Date.now() - daysAgo * DAY),
  });

await addUser({ firstName: "Hasan", lastName: "Arif", email: adminEmail, role: "admin", joinedAt: new Date(Date.now() - 60 * DAY) }, adminPassword);

const sample = process.argv.includes("--sample");
const demo = sample ? await addUser({
  firstName: "Demo", lastName: "User", email: "demo@stocksense.dev", planName: "Premium", billingCycle: "Monthly",
  watchlist: ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "META", "NFLX", "NVDA", "ADBE", "PYPL", "INTC"], lastLoginAt: new Date(),
}, "Demo@12345") : null;
if (demo) {
  await invoice(demo, "Monthly", "Paid", 3);
  await Alert.create([
    { user: demo._id, symbol: "AAPL", kind: "price", value: 235, channels: { email: true } },
    { user: demo._id, symbol: "TSLA", kind: "signal", value: "Bullish", channels: { push: true } },
    { user: demo._id, symbol: "NVDA", kind: "volume", value: 2.5, active: false },
    { user: demo._id, symbol: "MSFT", kind: "breakout", value: 330, channels: { discord: true } },
  ]);
}

let i = 0;
for (const [name, planName, billing, blocked, days] of sample ? data.sampleUsers : []) {
  const [firstName, ...rest] = name.split(" ");
  const u = await addUser({
    firstName, lastName: rest.join(" "), email: `${firstName.toLowerCase()}@example.com`, planName, billingCycle: billing ?? undefined,
    blocked, joinedAt: new Date(Date.now() - days * DAY), lastLoginAt: new Date(Date.now() - (i % 3) * 20 * 3600000),
  }, "User@12345");
  if (u && planName === "Premium" && billing) {
    await invoice(u, billing, i % 5 === 2 ? "Pending" : "Paid", days);
    if (i % 4 === 0) await invoice(u, billing, "Failed", days + 30);
  }
  i++;
}

console.log("\nSeed finished.");
console.log(`  Admin login: ${adminEmail} / ${adminPassword}`);
if (sample) {
  console.log("  Demo login:  demo@stocksense.dev / Demo@12345  (Premium, 11 stocks, 4 alerts)");
  console.log("  Sample customers use password User@12345. For local development only, never seed these on a live site.\n");
} else console.log("  (No sample customers. Run `npm run seed:sample` for local demo data.)\n");
await mongoose.connection.close();
