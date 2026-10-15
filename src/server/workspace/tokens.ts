/**
 * Server-side Google Workspace credentials.
 *
 * The original design passed the user's Google *access token* in the JSON request
 * body of `/api/chat` and `/api/proactive`, then handed it to
 * `google.auth.OAuth2().setCredentials({ access_token })`. That is a confused
 * deputy: the Firebase ID token (checked by `requireAuth`) and the Google access
 * token travelled through different channels, and the Google one was never bound
 * to the caller. Anything that captured it — logs, history, a malicious page —
 * became a full Workspace bearer.
 *
 * Credentials now live server-side, keyed by Firebase uid, and the client only
 * ever sends a one-time authorisation *code*.
 */

export interface WorkspaceCredentials {
  userId: string;
  /** Long-lived refresh token. Never leaves the server. */
  refreshToken: string;
  /** Space-separated granted scopes. */
  scopes: string[];
  /** Email of the connected account, when known. */
  email?: string;
  connectedAt: string;
}

export interface WorkspaceTokenStore {
  readonly kind: 'firestore' | 'in-memory';
  readonly durable: boolean;
  save(credentials: WorkspaceCredentials): Promise<void>;
  get(userId: string): Promise<WorkspaceCredentials | null>;
  delete(userId: string): Promise<boolean>;
}

/** Scopes the assistant asks for, matching what the README advertises. */
export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents',
] as const;

export class InMemoryTokenStore implements WorkspaceTokenStore {
  readonly kind = 'in-memory' as const;
  readonly durable = false;
  private readonly tokens = new Map<string, WorkspaceCredentials>();

  async save(credentials: WorkspaceCredentials): Promise<void> {
    this.tokens.set(credentials.userId, credentials);
  }

  async get(userId: string): Promise<WorkspaceCredentials | null> {
    return this.tokens.get(userId) ?? null;
  }

  async delete(userId: string): Promise<boolean> {
    return this.tokens.delete(userId);
  }
}
