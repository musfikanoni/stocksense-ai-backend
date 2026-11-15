import { Schema, model, type Types } from "mongoose";

export interface IReview {
  user: Types.ObjectId;
  name: string;
  avatarUrl?: string;
  role: string;
  rating: number;
  comment: string;
  status: "pending" | "approved" | "rejected";
}

const schema = new Schema<IReview>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    name: { type: String, required: true },
    avatarUrl: { type: String, default: "" },
    role: { type: String, required: true, default: "Trader" },
    rating: { type: Number, required: true, min: 1, max: 5, default: 5 },
    comment: { type: String, required: true, maxlength: 600 },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "approved" },
  },
  { timestamps: true, versionKey: false }
);

schema.set("toJSON", {
  transform: (_d, ret: Record<string, any>) => {
    ret.id = String(ret._id);
    if (ret.user) ret.userId = String(ret.user);
    delete ret._id;
    return ret;
  },
});

export const Review = model<IReview>("Review", schema);
