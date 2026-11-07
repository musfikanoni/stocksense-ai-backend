import { Schema, model, type HydratedDocument } from "mongoose";

export interface IPlan {
  name: string;
  price: number;        
  highlight: boolean;
  features: string[];
  stripe?: { productId?: string; prices?: Partial<Record<"Monthly" | "Yearly", { id: string; amount: number }>> };
}
export type PlanDoc = HydratedDocument<IPlan>;

const schema = new Schema<IPlan>({
  name: { type: String, required: true, unique: true, trim: true, maxlength: 40 },
  price: { type: Number, required: true, min: 0 },
  highlight: { type: Boolean, default: false },
  features: { type: [String], default: [] },
  stripe: { type: Schema.Types.Mixed },
}, { versionKey: false });

schema.set("toJSON", { transform: (_d, ret: Record<string, any>) => { ret.id = String(ret._id); delete ret._id; delete ret.stripe; return ret; } });

export const Plan = model<IPlan>("Plan", schema);
