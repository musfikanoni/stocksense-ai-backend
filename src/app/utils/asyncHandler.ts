import type { NextFunction, Request, RequestHandler, Response } from "express";

// Express 4 does not catch errors thrown inside async handlers. This wrapper forwards them to the error handler.
export const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
