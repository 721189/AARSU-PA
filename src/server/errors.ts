/**
 * Structured application errors.
 *
 * The original codebase swallowed failures with bare `catch {}` blocks and
 * returned plausible-looking fake data (stock photos, canned strings) so that
 * users could not tell when a feature was dead. That hid three shut-down models
 * for an unknown length of time.
 *
 * New rule: every failure path either
 *   1. throws an `AppError` with a stable `code` and an honest HTTP status, or
 *   2. explicitly declares a *documented* degradation and reports it as such in
 *      the response (`degraded: true`) and in `/api/health`.
 * Silent `catch {}` is no longer acceptable in this codebase.
 */

export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'bad_request'
  | 'not_found'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'not_configured'
  | 'internal';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  bad_request: 400,
  not_found: 404,
  rate_limited: 429,
  upstream_unavailable: 503,
  not_configured: 503,
  internal: 500,
};

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly detail?: unknown;
  /** Whether the caller may retry the same request later. */
  public readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: { detail?: unknown; retryable?: boolean; cause?: unknown } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.detail = options.detail;
    this.retryable =
      options.retryable ?? (code === 'upstream_unavailable' || code === 'rate_limited');
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      retryable: this.retryable,
      ...(this.detail !== undefined ? { detail: this.detail } : {}),
    };
  }
}

export const isAppError = (err: unknown): err is AppError => err instanceof AppError;

/** Narrow helper for "the Gemini key is missing" cases. */
export const notConfigured = (what: string) =>
  new AppError('not_configured', `${what} is not configured on this server.`);

/**
 * Wraps a value with an explicit degradation marker so a caller can tell the
 * difference between a real result and a documented fallback.
 */
export interface Degraded<T> {
  value: T;
  degraded: true;
  reason: string;
}
