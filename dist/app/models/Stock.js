import { Schema, model } from "mongoose";
const schema = new Schema({
    symbol: { type: String, required: true, unique: true, uppercase: true },
    name: { type: String, required: true },
    exchange: { type: String, default: "NASDAQ" },
    kind: { type: String, enum: ["stock", "index"], default: "stock" },
    closes: { type: [Number], default: [] },
    closeDates: { type: [String], default: [] },
    dailyUpdatedAt: Date,
    intraday: { type: [new Schema({ at: Date, price: Number }, { _id: false })], default: [] },
    quote: { price: Number, previousClose: Number, change: Number, volume: Number, marketOpen: Boolean, at: Date },
}, { versionKey: false });
export const Stock = model("Stock", schema);
//# sourceMappingURL=Stock.js.map