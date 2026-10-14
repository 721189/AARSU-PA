/**
 * API contract tests.
 *
 * These boot the real Express app (no mocks) on an ephemeral port and assert the
 * externally-visible contract: auth gating, honest status codes, and the shape of
 * /api/health. They exist because Phase 0 replaced silent `catch {}` blocks with
 * honest errors — this suite is what stops those from creeping back in.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// Must be set before importing the app so getAI() sees a key.
process.env.GEMINI_API_KEY = 'test-key-not-used-for-network-calls';
process.env.NODE_ENV = 'test';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { app } = await import('../server');
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
}, 30000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /api/health', () => {
  it('reports per-dependency status instead of a bare "ok"', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();

    expect([200, 503]).toContain(res.status);
    expect(body).toHaveProperty('checks');
    expect(body.checks).toHaveProperty('gemini');
    expect(body.checks).toHaveProperty('firebaseAdmin');
    expect(body.checks).toHaveProperty('cache');
    expect(['ok', 'degraded', 'down']).toContain(body.status);
    expect(typeof body.uptimeSeconds).toBe('number');
  });

  it('reports the configured chat model', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json();
    expect(body.checks.gemini.detail).toContain('gemini-');
  });
});

describe('auth gating', () => {
  const protectedRoutes: Array<[string, string]> = [
    ['POST', '/api/chat'],
    ['POST', '/api/embed'],
    ['POST', '/api/agent/run'],
    ['POST', '/api/jarvis/search'],
    ['POST', '/api/jarvis/code'],
    ['POST', '/api/jarvis/swarm'],
    ['POST', '/api/jarvis/vision/analyze'],
    ['POST', '/api/jarvis/generate-3d-image'],
    ['GET', '/api/fs/workspace'],
    ['GET', '/api/jarvis/graph'],
    ['GET', '/api/jarvis/host/diagnostics'],
    ['GET', '/api/jarvis/iot/devices'],
    ['GET', '/api/jarvis/redis/metrics'],
    ['GET', '/api/jarvis/proactive/feed'],
    ['GET', '/api/jarvis/reinforcement/metrics'],
    ['GET', '/api/mcp/tools'],
    ['GET', '/api/mcp/resources'],
    ['GET', '/api/voice/voices'],
    ['POST', '/api/voice/tts'],
    ['POST', '/api/voice/tts/stream'],
    ['POST', '/api/voice/live-token'],
    ['POST', '/api/voice/converse/stream'],
  ];

  it.each(protectedRoutes)('%s %s requires a bearer token', async (method, path) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify({}) } : {}),
    });
    expect(res.status, `${method} ${path} should be 401 without a token`).toBe(401);
  });

  it('rejects an invalid bearer token', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-a-real-token' },
      body: JSON.stringify({ message: 'hello' }),
    });
    expect(res.status).toBe(401);
  });

  it('does not accept a token supplied in the request body alone', async () => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello', token: 'pretend-oauth-token' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('unauthenticated surface', () => {
  it('serves /api/health without auth', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).not.toBe(401);
  });

  it('returns 404 for an unknown route', async () => {
    const res = await fetch(`${baseUrl}/api/definitely-not-a-route`);
    expect(res.status).toBe(404);
  });
});
