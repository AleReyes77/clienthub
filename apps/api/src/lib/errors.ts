import type { ZodError } from "zod";

export interface ErrorDetail {
  path: string;
  message: string;
}

/** An expected error that is safe to show to the client. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ErrorDetail[] | undefined;

  constructor(status: number, code: string, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);

export const unauthorized = (message = "Authentication required") =>
  new AppError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "You do not have permission to do this", code = "FORBIDDEN") =>
  new AppError(403, code, message);

/** Also used when a resource exists but the user may not see it, so its existence is not leaked. */
export const notFound = (resource: string) =>
  new AppError(404, "NOT_FOUND", `${resource} not found`);

export const conflict = (code: string, message: string) => new AppError(409, code, message);

export function validationError(error: ZodError): AppError {
  return new AppError(
    400,
    "VALIDATION_ERROR",
    "Some fields are invalid",
    error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  );
}
