import { google } from 'googleapis';

// Derived from googleapis so we do not mix its bundled google-auth-library with
// the top-level copy (they have incompatible private fields).
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;
import { AppError } from '../errors';
import { FirestoreTokenStore } from './firestoreTokenStore';
import {
  InMemoryTokenStore,
  WORKSPACE_SCOPES,
  type WorkspaceCredentials,
  type WorkspaceTokenStore,
} from './tokens';

/** Result of exchanging an authorisation code. Injectable for tests. */
export interface CodeExchangeResult {
  refreshToken: string;
  scopes: string[];
  email?: string;
}

export type CodeExchanger = (code: string) => Promise<CodeExchangeResult>;

export interface WorkspaceAuthOptions {
  store: WorkspaceTokenStore;
  /** Exchanges an auth code for tokens. Defaults to a real googleapis client. */
  exchangeCode?: CodeExchanger;
  /** Builds an authorised client from a refresh token. */
  buildClient?: (refreshToken: string) => OAuth2Client;
}

export interface WorkspaceStatus {
  connected: boolean;
  email?: string;
  scopes?: string[];
  connectedAt?: string;
  backend: { kind: WorkspaceTokenStore['kind']; durable: boolean };
  /** True when the server has the OAuth client id/secret needed to connect. */
  configured: boolean;
}

export function createTokenStore(): WorkspaceTokenStore {
  const firestore = FirestoreTokenStore.create();
  if (firestore) return firestore;
  console.warn('[workspace] Firestore unavailable; workspace credentials are NON-DURABLE.');
  return new InMemoryTokenStore();
}

export class WorkspaceAuthService {
  private readonly store: WorkspaceTokenStore;
  private readonly exchangeCode: CodeExchanger;
  private readonly buildClient: (refreshToken: string) => OAuth2Client;

  constructor(options: WorkspaceAuthOptions) {
    this.store = options.store;
    this.exchangeCode = options.exchangeCode ?? defaultCodeExchanger;
    this.buildClient = options.buildClient ?? defaultClientBuilder;
  }

  /** True when the server holds the OAuth client credentials. */
  get configured(): boolean {
    return Boolean(process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET);
  }

  get backend(): { kind: WorkspaceTokenStore['kind']; durable: boolean } {
    return { kind: this.store.kind, durable: this.store.durable };
  }

  /**
   * Exchanges a one-time authorisation code for a refresh token and stores it
   * against the user. The client never sees a token.
   */
  async connect(userId: string, code: string): Promise<WorkspaceStatus> {
    if (!code) throw new AppError('bad_request', 'An authorisation code is required.');
    if (!this.configured) {
      throw new AppError(
        'not_configured',
        'Workspace OAuth is not configured on this server.',
        { detail: 'Set OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET.' }
      );
    }

    const exchanged = await this.exchangeCode(code);
    if (!exchanged.refreshToken) {
      throw new AppError(
        'bad_request',
        'Google did not return a refresh token. Re-consent with prompt=consent to obtain one.'
      );
    }

    const credentials: WorkspaceCredentials = {
      userId,
      refreshToken: exchanged.refreshToken,
      scopes: exchanged.scopes,
      email: exchanged.email,
      connectedAt: new Date().toISOString(),
    };

    await this.store.save(credentials);
    return this.status(userId);
  }

  async status(userId: string): Promise<WorkspaceStatus> {
    const credentials = await this.store.get(userId);
    return {
      connected: Boolean(credentials),
      email: credentials?.email,
      scopes: credentials?.scopes,
      connectedAt: credentials?.connectedAt,
      backend: this.backend,
      configured: this.configured,
    };
  }

  /**
   * Returns an authorised client for the user, or null when they have not
   * connected. Callers must handle null rather than silently degrading.
   */
  async getClient(userId: string): Promise<OAuth2Client | null> {
    const credentials = await this.store.get(userId);
    if (!credentials) return null;
    return this.buildClient(credentials.refreshToken);
  }

  async disconnect(userId: string): Promise<boolean> {
    return this.store.delete(userId);
  }
}

/** Builds a real OAuth2 client from server-held client credentials. */
export function defaultClientBuilder(refreshToken: string): OAuth2Client {
  const client = new google.auth.OAuth2(
    process.env.OAUTH_CLIENT_ID,
    process.env.OAUTH_CLIENT_SECRET,
    process.env.OAUTH_REDIRECT_URI
  );
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/** Exchanges an authorisation code with Google. */
export const defaultCodeExchanger: CodeExchanger = async (code) => {
  const client = new google.auth.OAuth2(
    process.env.OAUTH_CLIENT_ID,
    process.env.OAUTH_CLIENT_SECRET,
    process.env.OAUTH_REDIRECT_URI
  );
  const { tokens } = await client.getToken(code);
  return {
    refreshToken: tokens.refresh_token ?? '',
    scopes: (tokens.scope ?? WORKSPACE_SCOPES.join(' ')).split(' ').filter(Boolean),
    email: tokens.id_token ? undefined : undefined,
  };
};
