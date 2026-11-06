import type { UserDoc } from "../models/User.js";

declare global {
  namespace Express {
    interface Request {
      user?: UserDoc;    
    }
  }
}
export {};
