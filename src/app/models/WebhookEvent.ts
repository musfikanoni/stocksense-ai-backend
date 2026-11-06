import { Schema, model } from "mongoose";

// Remembers which Stripe events we already handled, so a re-delivered event is not applied twice
export interface IWebhookEvent {
  eventId: string;
  type: string;
  at: Date;
}

const schema = new Schema<IWebhookEvent>({
  eventId: { type: String, required: true, unique: true },
  type: String,
  at: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },    // forgotten after 30 days
}, { versionKey: false });

export const WebhookEvent = model<IWebhookEvent>("WebhookEvent", schema);
