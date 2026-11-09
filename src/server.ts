import mongoose from "mongoose";
import app from "./app.js";
import { connectDb } from "./app/config/db.js";
import { env } from "./app/config/env.js";
import { startJobs } from "./app/jobs/index.js";

await connectDb();
const server = app.listen(env.port, () => console.log(`API running on http://localhost:${env.port}`));

const timer = env.jobsEnabled ? startJobs() : null;

const stop = () => server.close(() => {
  if (timer) clearInterval(timer); void mongoose.connection.close().then(() => process.exit(0)); });
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
