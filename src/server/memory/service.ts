import { GoogleGenAI } from '@google/genai';
import { MODELS } from '../models';
import { formatMemories, rankMemories, type RankOptions } from './vector';
import type { Episode, MemoryRecord, MemoryStore, ScoredMemory, UserProfile } from './types';

/** Produces an embedding vector for a piece of text. */
export interface Embedder {
  embed(text: string): Promise<number[]>;
}

/**
 * Embeddings via `gemini-embedding-001`.
 *
 * Returns an empty vector instead of throwing when the API is unavailable, so a
 * quota-limited deployment degrades to lexical retrieval rather than losing
 * memory entirely. The caller can tell the difference via `ScoredMemory.lexical`.
 */
export function createGeminiEmbedder(aiClient: GoogleGenAI): Embedder {
  const cache = new Map<string, number[]>();

  return {
    async embed(text: string): Promise<number[]> {
      const key = text.trim();
      if (!key) return [];

      const cached = cache.get(key);
      if (cached) return cached;

      try {
        const response = await aiClient.models.embedContent({
          model: MODELS.embedding,
          contents: key,
        });
        const values = response.embeddings?.[0]?.values ?? [];
        if (values.length > 0) {
          if (cache.size > 500) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
          cache.set(key, values);
        }
        return values;
      } catch (err) {
        console.warn(
          '[memory] embedding unavailable, falling back to lexical retrieval:',
          (err as Error)?.message
        );
        return [];
      }
    },
  };
}

export interface MemoryServiceOptions {
  store: MemoryStore;
  embedder?: Embedder | null;
  /** How many recent memories to load before ranking. Default 200. */
  scanLimit?: number;
}

export class MemoryService {
  private readonly store: MemoryStore;
  private readonly embedder: Embedder | null;
  private readonly scanLimit: number;

  constructor(options: MemoryServiceOptions) {
    this.store = options.store;
    this.embedder = options.embedder ?? null;
    this.scanLimit = options.scanLimit ?? 200;
  }

  get backend(): { kind: MemoryStore['kind']; durable: boolean } {
    return { kind: this.store.kind, durable: this.store.durable };
  }

  /** Stores a memory, generating an embedding when possible. */
  async remember(userId: string, text: string, tags: string[] = []): Promise<MemoryRecord> {
    const trimmed = text.trim();
    const embedding = this.embedder ? await this.embedder.embed(trimmed) : [];

    const record: MemoryRecord = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      text: trimmed,
      embedding,
      tags,
      createdAt: new Date().toISOString(),
    };

    await this.store.addMemory(record);
    return record;
  }

  /** Retrieves the most relevant memories for a query. */
  async recall(userId: string, query: string, options: RankOptions = {}): Promise<ScoredMemory[]> {
    const memories = await this.store.listMemories(userId, this.scanLimit);
    if (memories.length === 0) return [];

    const queryEmbedding = this.embedder ? await this.embedder.embed(query) : [];
    return rankMemories(query, queryEmbedding, memories, options);
  }

  /** Retrieves and formats memory context ready to inject into a prompt. */
  async contextFor(userId: string, query: string, options: RankOptions = {}): Promise<string> {
    const scored = await this.recall(userId, query, options);
    return formatMemories(scored);
  }

  async forget(userId: string, memoryId: string): Promise<boolean> {
    return this.store.deleteMemory(userId, memoryId);
  }

  // --- structured user model ------------------------------------------------

  async getProfile(userId: string): Promise<UserProfile | null> {
    return this.store.getProfile(userId);
  }

  /**
   * Merges a patch into the user's profile, de-duplicating facts so repeated
   * statements do not accumulate.
   */
  async updateProfile(
    userId: string,
    patch: {
      preferredName?: string;
      timezone?: string;
      facts?: string[];
      quietHours?: UserProfile['quietHours'];
    }
  ): Promise<UserProfile> {
    const existing = await this.store.getProfile(userId);

    const facts = [...(existing?.facts ?? [])];
    for (const fact of patch.facts ?? []) {
      const normalized = fact.trim();
      if (normalized && !facts.some((f) => f.toLowerCase() === normalized.toLowerCase())) {
        facts.push(normalized);
      }
    }

    const profile: UserProfile = {
      userId,
      preferredName: patch.preferredName ?? existing?.preferredName,
      timezone: patch.timezone ?? existing?.timezone,
      facts: facts.slice(-50),
      quietHours: patch.quietHours ?? existing?.quietHours,
      updatedAt: new Date().toISOString(),
    };

    await this.store.saveProfile(profile);
    return profile;
  }

  /** Renders the profile as prompt context. */
  async profileContextFor(userId: string): Promise<string> {
    const profile = await this.store.getProfile(userId);
    if (!profile) return '';

    const lines: string[] = [];
    if (profile.preferredName) lines.push(`Preferred name: ${profile.preferredName}`);
    if (profile.timezone) lines.push(`Timezone: ${profile.timezone}`);
    if (profile.quietHours) {
      lines.push(`Quiet hours: ${profile.quietHours.startHour}:00-${profile.quietHours.endHour}:00`);
    }
    if (profile.facts.length > 0) {
      lines.push(`Known facts:\n${profile.facts.map((f) => `  - ${f}`).join('\n')}`);
    }

    return lines.join('\n');
  }

  // --- episodic memory ------------------------------------------------------

  async recordEpisode(userId: string, summary: string): Promise<Episode> {
    const episode: Episode = {
      id: `ep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId,
      summary: summary.trim(),
      at: new Date().toISOString(),
    };
    await this.store.addEpisode(episode);
    return episode;
  }

  async recentEpisodes(userId: string, limit = 10): Promise<Episode[]> {
    return this.store.listEpisodes(userId, limit);
  }
}
