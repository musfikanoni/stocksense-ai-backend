import { Schema, model } from "mongoose";
const schema = new Schema({
    eventId: { type: String, required: true, unique: true },
    type: String,
    at: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
}, { versionKey: false });
export const WebhookEvent = model("WebhookEvent", schema);
//# sourceMappingURL=WebhookEvent.js.map