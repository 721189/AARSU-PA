import type { Episode, MemoryRecord, MemoryStore, UserProfile } from './types';

/**
 * Non-durable fallback store.
 *
 * Used when Firestore credentials are unavailable. It is explicitly labelled
 * `durable: false` and surfaced as such in /api/health, so nobody mistakes it for
 * persistent memory. Bounded per-user so a long-running process cannot grow
 * without limit.
 */
export class InMemoryMemoryStore implements MemoryStore {
  readonly kind = 'in-memory' as const;
  readonly durable = false;

  private readonly memories = new Map<string, MemoryRecord[]>();
  private readonly profiles = new Map<string, UserProfile>();
  private readonly episodes = new Map<string, Episode[]>();
  private readonly maxPerUser: number;

  constructor(maxPerUser = 500) {
    this.maxPerUser = maxPerUser;
  }

  async addMemory(record: MemoryRecord): Promise<void> {
    const list = this.memories.get(record.userId) ?? [];
    list.unshift(record);
    if (list.length > this.maxPerUser) list.length = this.maxPerUser;
    this.memories.set(record.userId, list);
  }

  async listMemories(userId: string, limit: number): Promise<MemoryRecord[]> {
    return (this.memories.get(userId) ?? []).slice(0, limit);
  }

  async deleteMemory(userId: string, id: string): Promise<boolean> {
    const list = this.memories.get(userId);
    if (!list) return false;
    const index = list.findIndex((m) => m.id === id);
    if (index === -1) return false;
    list.splice(index, 1);
    return true;
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    return this.profiles.get(userId) ?? null;
  }

  async saveProfile(profile: UserProfile): Promise<void> {
    this.profiles.set(profile.userId, profile);
  }

  async addEpisode(episode: Episode): Promise<void> {
    const list = this.episodes.get(episode.userId) ?? [];
    list.unshift(episode);
    if (list.length > this.maxPerUser) list.length = this.maxPerUser;
    this.episodes.set(episode.userId, list);
  }

  async listEpisodes(userId: string, limit: number): Promise<Episode[]> {
    return (this.episodes.get(userId) ?? []).slice(0, limit);
  }
}
