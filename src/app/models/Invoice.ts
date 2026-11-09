import { Schema, model, type Types } from "mongoose";

export type InvoiceStatus = "Paid" | "Pending" | "Failed";
export interface IInvoice {
  user: Types.ObjectId;
  tx: string;
  planName: string;
  billing: "Monthly" | "Yearly";
  planLabel: string;    
  amount: number;
  status: InvoiceStatus;
  date: Date;
  stripeInvoiceId?: string;
  hostedUrl?: string;    
}

const schema = new Schema<IInvoice>({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tx: { type: String, required: true, unique: true },
  planName: { type: String, required: true },
  billing: { type: String, enum: ["Monthly", "Yearly"], required: true },
  planLabel: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ["Paid", "Pending", "Failed"], default: "Paid" },
  date: { type: Date, default: Date.now },
  stripeInvoiceId: { type: String, unique: true, sparse: true },
  hostedUrl: String,
}, { versionKey: false });

schema.set("toJSON", { transform: (_d, ret: Record<string, any>) => { ret.id = String(ret._id); delete ret._id; return ret; } });

export const Invoice = model<IInvoice>("Invoice", schema);
