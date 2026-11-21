import type { ApiErrorBody } from "@clienthub/shared";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: { path: string; message: string }[];

  constructor(status: number, body: ApiErrorBody | null) {
    super(body?.error.message ?? "Something went wrong. Please try again.");
    this.name = "ApiError";
    this.status = status;
    this.code = body?.error.code ?? "UNKNOWN";
    this.details = body?.error.details ?? [];
  }

  /** Error message for one form field, if the API reported one. */
  fieldError(path: string): string | undefined {
    return this.details.find((d) => d.path === path)?.message;
  }
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/**
 * Small fetch wrapper for the API. Requests go to the same origin (/api is proxied
 * by Next.js), so the httpOnly session cookie is sent automatically.
 */
export async function api<T>(path: string, options: { method?: Method; body?: unknown } = {}) {
  const { method = "GET", body } = options;
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data as ApiErrorBody | null);
  return data as T;
}
