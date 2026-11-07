import { Schema, model, type Types } from "mongoose";
import type { Signal } from "../utils/signal.js";

export type AlertKind = "price" | "breakout" | "signal" | "volume";
export interface IAlert {
  user: Types.ObjectId;
  symbol: string;
  kind: AlertKind;
  value: number | Signal;
  channels: { email: boolean; push: boolean; discord: boolean };
  active: boolean;
  direction?: "above" | "below";      
  lastSeen?: string;                  
  lastTriggeredAt?: Date;
}

const schema = new Schema<IAlert>({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  symbol: { type: String, required: true },
  kind: { type: String, enum: ["price", "breakout", "signal", "volume"], required: true },
  value: { type: Schema.Types.Mixed, required: true },
  channels: { email: { type: Boolean, default: false }, push: { type: Boolean, default: false }, discord: { type: Boolean, default: false } },
  active: { type: Boolean, default: true },
  direction: { type: String, enum: ["above", "below"] },
  lastSeen: String,
  lastTriggeredAt: Date,
}, { timestamps: true, versionKey: false });

schema.set("toJSON", { transform: (_d, ret: Record<string, any>) => { ret.id = String(ret._id); delete ret._id; delete ret.user; return ret; } });

export const Alert = model<IAlert>("Alert", schema);
