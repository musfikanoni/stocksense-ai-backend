import { Schema, model, type Types } from "mongoose";
import type { Billing } from "./User.js";

export type InvoiceStatus = "Paid" | "Pending" | "Failed";

export interface IInvoice {
  user: Types.ObjectId;
  tx: string;
  stripeInvoiceId: string;
  hostedUrl?: string;
  planName: string;
  billing: Billing;
  planLabel: string;
  amount: number;
  status: InvoiceStatus;
  date: Date;
}

const schema = new Schema<IInvoice>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tx: { type: String, required: true },
    stripeInvoiceId: { type: String, required: true, index: true },
    hostedUrl: String,
    planName: { type: String, required: true },
    billing: { type: String, enum: ["Monthly", "Yearly"], required: true },
    planLabel: { type: String, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ["Paid", "Pending", "Failed"], required: true },
    date: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false }
);

schema.set("toJSON", {
  transform: (_d, ret: Record<string, any>) => {
    ret.id = String(ret._id);
    delete ret._id;
    return ret;
  },
});

export const Invoice = model<IInvoice>("Invoice", schema);
