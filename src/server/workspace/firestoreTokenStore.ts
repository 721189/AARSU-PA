import { getFirestore } from 'firebase-admin/firestore';
import { getApps } from 'firebase-admin/app';
import type { WorkspaceCredentials, WorkspaceTokenStore } from './tokens';

/**
 * Durable credential store.
 *
 * Deliberately stored in a server-only collection (`workspaceCredentials`) that
 * is NOT covered by any allow rule in `firestore.rules` — the file already
 * default-denies everything outside `/users/{uid}`, so clients cannot read it
 * even if they guess the path. Access is via the Admin SDK only.
 */
export class FirestoreTokenStore implements WorkspaceTokenStore {
  readonly kind = 'firestore' as const;
  readonly durable = true;

  private readonly collection = 'workspaceCredentials';

  static create(): FirestoreTokenStore | null {
    try {
      if (getApps().length === 0) return null;
      return new FirestoreTokenStore();
    } catch {
      return null;
    }
  }

  async save(credentials: WorkspaceCredentials): Promise<void> {
    await getFirestore().collection(this.collection).doc(credentials.userId).set(credentials);
  }

  async get(userId: string): Promise<WorkspaceCredentials | null> {
    const snapshot = await getFirestore().collection(this.collection).doc(userId).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() as WorkspaceCredentials | undefined;
    return data?.refreshToken ? data : null;
  }

  async delete(userId: string): Promise<boolean> {
    const ref = getFirestore().collection(this.collection).doc(userId);
    const existing = await ref.get();
    if (!existing.exists) return false;
    await ref.delete();
    return true;
  }
}
