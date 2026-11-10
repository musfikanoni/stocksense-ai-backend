import { Schema, model } from "mongoose";
const schema = new Schema({
    name: { type: String, required: true, unique: true, trim: true, maxlength: 40 },
    price: { type: Number, required: true, min: 0 },
    highlight: { type: Boolean, default: false },
    features: { type: [String], default: [] },
    stripe: { type: Schema.Types.Mixed },
}, { versionKey: false });
schema.set("toJSON", { transform: (_d, ret) => { ret.id = String(ret._id); delete ret._id; delete ret.stripe; return ret; } });
export const Plan = model("Plan", schema);
//# sourceMappingURL=Plan.js.map