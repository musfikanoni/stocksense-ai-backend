import { Schema, model, type Types } from "mongoose";

// The in-app notifications shown in the bell menu
export interface INotification {
  user: Types.ObjectId;
  title: string;
  body: string;
  symbol?: string;
  read: boolean;
}

const schema = new Schema<INotification>({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  symbol: String,
  read: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });

schema.set("toJSON", { transform: (_d, ret: Record<string, any>) => { ret.id = String(ret._id); delete ret._id; delete ret.user; return ret; } });

export const Notification = model<INotification>("Notification", schema);
