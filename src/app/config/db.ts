import mongoose from "mongoose";
import { env } from "./env.js";

let cachedPromise: Promise<typeof mongoose> | null = null;

export async function connectDb(): Promise<void> {
  if (mongoose.connection.readyState >= 1) return;
  if (!cachedPromise) {
    mongoose.set("strictQuery", true);
    cachedPromise = mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  }
  try {
    await cachedPromise;
    console.log("MongoDB connected");
  } catch (err) {
    cachedPromise = null;
    throw err;
  }
}
