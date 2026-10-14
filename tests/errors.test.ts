import { describe, it, expect } from 'vitest';
import { AppError, isAppError, notConfigured } from '../src/server/errors';

describe('AppError', () => {
  it('maps codes to honest HTTP statuses', () => {
    expect(new AppError('unauthorized', 'x').status).toBe(401);
    expect(new AppError('forbidden', 'x').status).toBe(403);
    expect(new AppError('bad_request', 'x').status).toBe(400);
    expect(new AppError('not_found', 'x').status).toBe(404);
    expect(new AppError('rate_limited', 'x').status).toBe(429);
    expect(new AppError('not_configured', 'x').status).toBe(503);
    expect(new AppError('upstream_unavailable', 'x').status).toBe(503);
    expect(new AppError('internal', 'x').status).toBe(500);
  });

  it('marks only transient failures as retryable', () => {
    expect(new AppError('upstream_unavailable', 'x').retryable).toBe(true);
    expect(new AppError('rate_limited', 'x').retryable).toBe(true);
    expect(new AppError('bad_request', 'x').retryable).toBe(false);
    expect(new AppError('unauthorized', 'x').retryable).toBe(false);
  });

  it('serialises to a stable wire shape', () => {
    const err = new AppError('not_configured', 'missing key', { detail: 'set GEMINI_API_KEY' });
    expect(err.toJSON()).toEqual({
      error: 'missing key',
      code: 'not_configured',
      retryable: false,
      detail: 'set GEMINI_API_KEY',
    });
  });

  it('omits detail when not supplied', () => {
    expect(new AppError('internal', 'boom').toJSON()).not.toHaveProperty('detail');
  });

  it('is detectable via the isAppError guard', () => {
    expect(isAppError(new AppError('internal', 'x'))).toBe(true);
    expect(isAppError(new Error('x'))).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });

  it('builds a not_configured error via the helper', () => {
    const err = notConfigured('GEMINI_API_KEY');
    expect(err.code).toBe('not_configured');
    expect(err.message).toContain('GEMINI_API_KEY');
  });
});
