import { Schema, model } from "mongoose";
const schema = new Schema({
    key: { type: String, enum: ["privacy", "terms"], required: true, unique: true },
    title: { type: String, required: true },
    text: { type: String, required: true, maxlength: 20000 },
    updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });
schema.set("toJSON", { transform: (_d, ret) => { delete ret._id; return ret; } });
export const Policy = model("Policy", schema);
//# sourceMappingURL=Policy.js.map