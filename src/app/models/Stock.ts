import { Schema, model } from "mongoose";

export interface IStock {
  symbol: string;
  name: string;
  exchange: string;
  kind: "stock" | "index";
  closes: number[];         
  closeDates: string[];     
  dailyUpdatedAt?: Date;
  quote?: { price?: number; previousClose?: number; change?: number; volume?: number | null; marketOpen?: boolean; at?: Date };
}

const schema = new Schema<IStock>({
  symbol: { type: String, required: true, unique: true, uppercase: true },
  name: { type: String, required: true },
  exchange: { type: String, default: "NASDAQ" },
  kind: { type: String, enum: ["stock", "index"], default: "stock" },
  closes: { type: [Number], default: [] },
  closeDates: { type: [String], default: [] },
  dailyUpdatedAt: Date,
  quote: { price: Number, previousClose: Number, change: Number, volume: Number, marketOpen: Boolean, at: Date },
}, { versionKey: false });

export const Stock = model<IStock>("Stock", schema);
