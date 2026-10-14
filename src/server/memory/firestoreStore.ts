import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getApps } from 'firebase-admin/app';
import type { Episode, MemoryRecord, MemoryStore, UserProfile } from './types';

/**
 * Durable Firestore-backed memory.
 *
 * Layout:
 *   users/{uid}                      -> UserProfile
 *   users/{uid}/memories/{memoryId}  -> MemoryRecord
 *   users/{uid}/episodes/{episodeId} -> Episode
 *
 * This matches the existing `firestore.rules`, which already scopes
 * `users/{uid}/memories` to the owning user.
 */
export class FirestoreMemoryStore implements MemoryStore {
  readonly kind = 'firestore' as const;
  readonly durable = true;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestore();
  }

  /** Returns a store only when firebase-admin is initialised. */
  static create(): FirestoreMemoryStore | null {
    try {
      if (getApps().length === 0) return null;
      return new FirestoreMemoryStore();
    } catch {
      return null;
    }
  }

  private memories(userId: string) {
    return this.db.collection('users').doc(userId).collection('memories');
  }

  private episodes(userId: string) {
    return this.db.collection('users').doc(userId).collection('episodes');
  }

  async addMemory(record: MemoryRecord): Promise<void> {
    const { id, userId, ...rest } = record;
    await this.memories(userId).doc(id).set({ ...rest, createdAt: record.createdAt });
  }

  async listMemories(userId: string, limit: number): Promise<MemoryRecord[]> {
    const snapshot = await this.memories(userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      userId,
      ...(doc.data() as Omit<MemoryRecord, 'id' | 'userId'>),
    }));
  }

  async deleteMemory(userId: string, id: string): Promise<boolean> {
    const ref = this.memories(userId).doc(id);
    const existing = await ref.get();
    if (!existing.exists) return false;
    await ref.delete();
    return true;
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const snapshot = await this.db.collection('users').doc(userId).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() as Partial<UserProfile> | undefined;
    if (!data?.userId) return null;
    return data as UserProfile;
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    await this.db.collection('users').doc(profile.userId).set(profile, { merge: true });
  }

  async addEpisode(episode: Episode): Promise<void> {
    const { id, userId, ...rest } = episode;
    await this.episodes(userId).doc(id).set(rest);
  }

  async listEpisodes(userId: string, limit: number): Promise<Episode[]> {
    const snapshot = await this.episodes(userId).orderBy('at', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      userId,
      ...(doc.data() as Omit<Episode, 'id' | 'userId'>),
    }));
  }
}
