import { Schema, model } from "mongoose";
const schema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    symbol: String,
    read: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });
schema.set("toJSON", { transform: (_d, ret) => { ret.id = String(ret._id); delete ret._id; delete ret.user; return ret; } });
export const Notification = model("Notification", schema);
//# sourceMappingURL=Notification.js.map