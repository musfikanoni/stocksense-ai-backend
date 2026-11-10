import { Schema, model } from "mongoose";
import { thumb } from "../utils/cloudinary.js";
export const fullName = (u) => `${u.firstName} ${u.lastName}`.trim();
export const planLabelOf = (u) => u.planName === "Free" ? "Free" : `${u.planName} (${u.billingCycle ?? "Monthly"})`;
const schema = new Schema({
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
    transform: (_doc, ret) => {
        ret.id = String(ret._id);
        ret.name = fullName(ret);
        ret.planLabel = planLabelOf(ret);
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
        if (ret.avatarUrl)
            ret.avatarUrl = thumb(ret.avatarUrl);
        return ret;
    },
});
export const User = model("User", schema);
//# sourceMappingURL=User.js.map