import type { ErrorRequestHandler } from "express";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const appError = error instanceof AppError ? error : new AppError("An unexpected error occurred");
  if (env.NODE_ENV !== "test") {
    console.error(error);
  }

  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
    },
  });
};
