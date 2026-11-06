import { Schema, model } from "mongoose";

export interface IPolicy {
  key: "privacy" | "terms";
  title: string;
  text: string;
  updatedAt: Date;
}

const schema = new Schema<IPolicy>({
  key: { type: String, enum: ["privacy", "terms"], required: true, unique: true },
  title: { type: String, required: true },
  text: { type: String, required: true, maxlength: 20000 },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

schema.set("toJSON", { transform: (_d, ret: Record<string, any>) => { delete ret._id; return ret; } });

export const Policy = model<IPolicy>("Policy", schema);
