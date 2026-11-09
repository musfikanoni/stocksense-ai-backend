import { Schema, model, type HydratedDocument } from "mongoose";
import { thumb } from "../utils/cloudinary.js";

export type Role = "user" | "admin";
export type Billing = "Monthly" | "Yearly";

export interface IUser {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash?: string;       
  googleId?: string;
  avatarUrl?: string;
  discordWebhookUrl?: string;     
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: string;     
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  role: Role;
  blocked: boolean;
  planName: string;
  billingCycle?: Billing;
  watchlist: string[];
  joinedAt: Date;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
  tokenVersion?: number;       
  resetOtp?: { hash?: string; expires?: Date; attempts?: number };
}
export type UserDoc = HydratedDocument<IUser>;

export const fullName = (u: Pick<IUser, "firstName" | "lastName">) => `${u.firstName} ${u.lastName}`.trim();
export const planLabelOf = (u: Pick<IUser, "planName" | "billingCycle">) =>
  u.planName === "Free" ? "Free" : `${u.planName} (${u.billingCycle ?? "Monthly"})`;

const schema = new Schema<IUser>({
  firstName: { type: String, required: true, trim: true, maxlength: 40 },
  lastName: { type: String, default: "", trim: true, maxlength: 40 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },
  googleId: { type: String, unique: true, sparse: true },
  avatarUrl: String,
  discordWebhookUrl: String,
  stripeCustomerId: { type: String, index: true },
  stripeSubscriptionId: String,
  subscriptionStatus: String,
  currentPeriodEnd: Date,
  cancelAtPeriodEnd: Boolean,
  role: { type: String, enum: ["user", "admin"], default: "user" },
  blocked: { type: Boolean, default: false },
  planName: { type: String, default: "Free" },
  billingCycle: { type: String, enum: ["Monthly", "Yearly"], default: undefined },
  watchlist: { type: [String], default: [] },
  joinedAt: { type: Date, default: Date.now },
  lastLoginAt: Date,
  passwordChangedAt: Date,
  tokenVersion: { type: Number, default: 0 },
  resetOtp: { type: new Schema({ hash: String, expires: Date, attempts: Number }, { _id: false }), select: false },
}, { versionKey: false });


schema.set("toJSON", {
  transform: (_doc, ret: Record<string, any>) => {
    ret.id = String(ret._id);
    ret.name = fullName(ret as IUser);
    ret.planLabel = planLabelOf(ret as IUser);
    delete ret._id;
    delete ret.passwordHash;
    delete ret.resetOtp;
    ret.googleLinked = Boolean(ret.googleId);
    delete ret.googleId;
    ret.discordConnected = Boolean(ret.discordWebhookUrl);
    delete ret.discordWebhookUrl;
    delete ret.tokenVersion;
    delete ret.stripeCustomerId;
    delete ret.stripeSubscriptionId;
    if (ret.avatarUrl) ret.avatarUrl = thumb(ret.avatarUrl);
    return ret;
  },
});

export const User = model<IUser>("User", schema);
