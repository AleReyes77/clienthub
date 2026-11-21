import type { ApiErrorBody } from "@clienthub/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../lib/errors.js";
import type { Logger } from "../lib/logger.js";
import { Prisma } from "../lib/prisma.js";

export const notFoundHandler: RequestHandler = (_req, res) => {
  const body: ApiErrorBody = { error: { code: "NOT_FOUND", message: "Route not found" } };
  res.status(404).json(body);
};

function toAppError(err: unknown): AppError | undefined {
  if (err instanceof AppError) return err;

  // Errors thrown by express.json() for malformed or oversized bodies.
  if (typeof err === "object" && err !== null && "type" in err) {
    if (err.type === "entity.parse.failed") {
      return new AppError(400, "INVALID_JSON", "Request body is not valid JSON");
    }
    if (err.type === "entity.too.large") {
      return new AppError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
    }
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") return new AppError(404, "NOT_FOUND", "Resource not found");
    if (err.code === "P2002") return new AppError(409, "CONFLICT", "Resource already exists");
  }
  return undefined;
}

/**
 * Central error handler: expected errors become clean JSON responses,
 * unexpected ones are logged and returned as a generic 500 without internal details.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const appError = toAppError(err);

    if (!appError) {
      logger.error({ err, method: req.method, url: req.originalUrl }, "Unhandled error");
      const body: ApiErrorBody = {
        error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
      };
      res.status(500).json(body);
      return;
    }

    const body: ApiErrorBody = {
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details ? { details: appError.details } : {}),
      },
    };
    res.status(appError.status).json(body);
  };
}
