import { describe, it, expect, vi } from 'vitest';
import { WorkspaceAuthService } from '../src/server/workspace/auth';
import { InMemoryTokenStore } from '../src/server/workspace/tokens';

function service(overrides: Partial<ConstructorParameters<typeof WorkspaceAuthService>[0]> = {}) {
  const store = new InMemoryTokenStore();
  const exchangeCode = vi.fn(async () => ({
    refreshToken: 'refresh-token-abc',
    scopes: ['https://www.googleapis.com/auth/calendar'],
    email: 'sir@stark.io',
  }));
  const auth = new WorkspaceAuthService({ store, exchangeCode, ...overrides });
  return { auth, store, exchangeCode };
}

describe('WorkspaceAuthService', () => {
  it('reports a non-durable backend for the in-memory store', () => {
    expect(service().auth.backend).toEqual({ kind: 'in-memory', durable: false });
  });

  it('reports not-configured when OAuth client credentials are absent', () => {
    const original = { id: process.env.OAUTH_CLIENT_ID, secret: process.env.OAUTH_CLIENT_SECRET };
    delete process.env.OAUTH_CLIENT_ID;
    delete process.env.OAUTH_CLIENT_SECRET;

    expect(service().auth.configured).toBe(false);

    if (original.id !== undefined) process.env.OAUTH_CLIENT_ID = original.id;
    if (original.secret !== undefined) process.env.OAUTH_CLIENT_SECRET = original.secret;
  });

  it('rejects connect when not configured, with an actionable message', async () => {
    const original = { id: process.env.OAUTH_CLIENT_ID, secret: process.env.OAUTH_CLIENT_SECRET };
    delete process.env.OAUTH_CLIENT_ID;
    delete process.env.OAUTH_CLIENT_SECRET;

    const { auth } = service();
    await expect(auth.connect('u1', 'code')).rejects.toThrow(/not configured/i);

    if (original.id !== undefined) process.env.OAUTH_CLIENT_ID = original.id;
    if (original.secret !== undefined) process.env.OAUTH_CLIENT_SECRET = original.secret;
  });

  it('rejects connect without a code', async () => {
    process.env.OAUTH_CLIENT_ID = 'id';
    process.env.OAUTH_CLIENT_SECRET = 'secret';
    await expect(service().auth.connect('u1', '')).rejects.toThrow(/authorisation code/i);
    delete process.env.OAUTH_CLIENT_ID;
    delete process.env.OAUTH_CLIENT_SECRET;
  });

  it('stores the refresh token and reports connected', async () => {
    process.env.OAUTH_CLIENT_ID = 'id';
    process.env.OAUTH_CLIENT_SECRET = 'secret';

    const { auth, store, exchangeCode } = service();
    const status = await auth.connect('u1', 'auth-code');

    expect(exchangeCode).toHaveBeenCalledWith('auth-code');
    expect(status.connected).toBe(true);
    expect(status.email).toBe('sir@stark.io');

    const stored = await store.get('u1');
    expect(stored?.refreshToken).toBe('refresh-token-abc');

    delete process.env.OAUTH_CLIENT_ID;
    delete process.env.OAUTH_CLIENT_SECRET;
  });

  it('never exposes the refresh token in the status payload', async () => {
    process.env.OAUTH_CLIENT_ID = 'id';
    process.env.OAUTH_CLIENT_SECRET = 'secret';

    const { auth } = service();
    const status = await auth.connect('u1', 'auth-code');

    expect(JSON.stringify(status)).not.toContain('refresh-token-abc');
    expect(status).not.toHaveProperty('refreshToken');

    delete process.env.OAUTH_CLIENT_ID;
    delete process.env.OAUTH_CLIENT_SECRET;
  });

  it('refuses to connect when Google returns no refresh token', async () => {
    process.env.OAUTH_CLIENT_ID = 'id';
    process.env.OAUTH_CLIENT_SECRET = 'secret';

    const { auth } = service({
      exchangeCode: async () => ({ refreshToken: '', scopes: [] }),
    });

    await expect(auth.connect('u1', 'code')).rejects.toThrow(/refresh token/i);

    delete process.env.OAUTH_CLIENT_ID;
    delete process.env.OAUTH_CLIENT_SECRET;
  });

  it('reports disconnected for an unknown user', async () => {
    const status = await service().auth.status('nobody');
    expect(status.connected).toBe(false);
    expect(status.email).toBeUndefined();
  });

  it('returns null from getClient when not connected', async () => {
    expect(await service().auth.getClient('u1')).toBeNull();
  });

  it('builds a client from the stored refresh token', async () => {
    const buildClient = vi.fn(() => ({ mocked: true }) as any);
    const store = new InMemoryTokenStore();
    await store.save({
      userId: 'u1',
      refreshToken: 'stored-refresh',
      scopes: [],
      connectedAt: new Date().toISOString(),
    });

    const auth = new WorkspaceAuthService({ store, buildClient });
    const client = await auth.getClient('u1');

    expect(buildClient).toHaveBeenCalledWith('stored-refresh');
    expect(client).toEqual({ mocked: true });
  });

  it('disconnects and forgets the credentials', async () => {
    const { auth, store } = service();
    await store.save({
      userId: 'u1',
      refreshToken: 'r',
      scopes: [],
      connectedAt: new Date().toISOString(),
    });

    expect(await auth.disconnect('u1')).toBe(true);
    expect(await auth.disconnect('u1')).toBe(false);
    expect(await store.get('u1')).toBeNull();
  });

  it('keeps users isolated', async () => {
    const { auth, store } = service();
    await store.save({ userId: 'u1', refreshToken: 'r1', scopes: [], connectedAt: '' });
    await store.save({ userId: 'u2', refreshToken: 'r2', scopes: [], connectedAt: '' });

    expect((await store.get('u1'))?.refreshToken).toBe('r1');
    expect((await store.get('u2'))?.refreshToken).toBe('r2');
    expect(await auth.status('u3')).toMatchObject({ connected: false });
  });
});
