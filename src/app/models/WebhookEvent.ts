import { Schema, model } from "mongoose";


export interface IWebhookEvent {
  eventId: string;
  type: string;
  at: Date;
}

const schema = new Schema<IWebhookEvent>({
  eventId: { type: String, required: true, unique: true },
  type: String,
  at: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },    
}, { versionKey: false });

export const WebhookEvent = model<IWebhookEvent>("WebhookEvent", schema);
