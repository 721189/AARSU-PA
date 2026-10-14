import { describe, it, expect } from 'vitest';
import { InMemoryMemoryStore } from '../src/server/memory/inMemoryStore';
import { MemoryService, type Embedder } from '../src/server/memory/service';

/** Deterministic fake embedder: maps text to a small vector by keyword presence. */
const fakeEmbedder: Embedder = {
  async embed(text: string): Promise<number[]> {
    const lower = text.toLowerCase();
    return [
      lower.includes('reactor') ? 1 : 0,
      lower.includes('weather') ? 1 : 0,
      lower.includes('meeting') ? 1 : 0,
    ];
  },
};

function service(embedder: Embedder | null = fakeEmbedder) {
  return new MemoryService({ store: new InMemoryMemoryStore(), embedder });
}

describe('MemoryService', () => {
  it('reports a non-durable backend for the in-memory store', () => {
    expect(service().backend).toEqual({ kind: 'in-memory', durable: false });
  });

  it('remembers and recalls a memory', async () => {
    const memory = service();
    await memory.remember('u1', 'The arc reactor uses palladium');

    const scored = await memory.recall('u1', 'what powers the reactor');
    expect(scored).toHaveLength(1);
    expect(scored[0].record.text).toContain('palladium');
    expect(scored[0].lexical).toBeFalsy();
  });

  it('does not return memories belonging to another user', async () => {
    const memory = service();
    await memory.remember('u1', 'The arc reactor uses palladium');
    expect(await memory.recall('u2', 'reactor')).toEqual([]);
  });

  it('returns an empty list when there is nothing stored', async () => {
    expect(await service().recall('u1', 'anything')).toEqual([]);
  });

  it('still retrieves via lexical matching when embeddings are unavailable', async () => {
    const memory = service(null);
    await memory.remember('u1', 'The arc reactor uses palladium');

    const scored = await memory.recall('u1', 'reactor');
    expect(scored).toHaveLength(1);
    expect(scored[0].lexical).toBe(true);
  });

  it('trims stored text', async () => {
    const memory = service();
    const record = await memory.remember('u1', '   spaced out   ');
    expect(record.text).toBe('spaced out');
  });

  it('stores tags', async () => {
    const memory = service();
    const record = await memory.remember('u1', 'prefers brevity', ['preference']);
    expect(record.tags).toEqual(['preference']);
  });

  it('forgets a memory by id', async () => {
    const memory = service();
    const record = await memory.remember('u1', 'temporary');
    expect(await memory.forget('u1', record.id)).toBe(true);
    expect(await memory.forget('u1', record.id)).toBe(false);
    expect(await memory.recall('u1', 'temporary')).toEqual([]);
  });

  it('returns formatted context for a query', async () => {
    const memory = service();
    await memory.remember('u1', 'The arc reactor uses palladium');
    const context = await memory.contextFor('u1', 'reactor');
    expect(context).toContain('palladium');
  });
});

describe('MemoryService profiles', () => {
  it('creates a profile on first update', async () => {
    const memory = service();
    const profile = await memory.updateProfile('u1', {
      preferredName: 'Sir',
      timezone: 'Europe/London',
      facts: ['Works on the arc reactor'],
    });

    expect(profile.preferredName).toBe('Sir');
    expect(profile.facts).toEqual(['Works on the arc reactor']);
    expect(profile.updatedAt).toBeTruthy();
  });

  it('merges facts across updates and de-duplicates them', async () => {
    const memory = service();
    await memory.updateProfile('u1', { facts: ['Likes brevity'] });
    await memory.updateProfile('u1', { facts: ['likes brevity', 'Runs diagnostics nightly'] });

    const profile = await memory.getProfile('u1');
    expect(profile!.facts).toEqual(['Likes brevity', 'Runs diagnostics nightly']);
  });

  it('preserves fields not present in a later patch', async () => {
    const memory = service();
    await memory.updateProfile('u1', { preferredName: 'Sir', timezone: 'UTC' });
    const profile = await memory.updateProfile('u1', { facts: ['new fact'] });

    expect(profile.preferredName).toBe('Sir');
    expect(profile.timezone).toBe('UTC');
  });

  it('returns null for an unknown user', async () => {
    expect(await service().getProfile('nobody')).toBeNull();
  });

  it('renders profile context for the prompt', async () => {
    const memory = service();
    await memory.updateProfile('u1', {
      preferredName: 'Sir',
      timezone: 'UTC',
      facts: ['Works on the arc reactor'],
      quietHours: { startHour: 23, endHour: 7 },
    });

    const context = await memory.profileContextFor('u1');
    expect(context).toContain('Preferred name: Sir');
    expect(context).toContain('Timezone: UTC');
    expect(context).toContain('23:00-7:00');
    expect(context).toContain('arc reactor');
  });

  it('returns empty context for an unknown user', async () => {
    expect(await service().profileContextFor('nobody')).toBe('');
  });
});

describe('MemoryService episodes', () => {
  it('records and lists episodes newest first', async () => {
    const memory = service();
    await memory.recordEpisode('u1', 'Diagnosed the reactor');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await memory.recordEpisode('u1', 'Booked a meeting');

    const episodes = await memory.recentEpisodes('u1');
    expect(episodes).toHaveLength(2);
    expect(episodes[0].summary).toBe('Booked a meeting');
  });

  it('returns nothing for a user with no episodes', async () => {
    expect(await service().recentEpisodes('u1')).toEqual([]);
  });

  it('trims the summary', async () => {
    const episode = await service().recordEpisode('u1', '  spaced  ');
    expect(episode.summary).toBe('spaced');
  });
});

describe('InMemoryMemoryStore bounds', () => {
  it('caps stored memories per user', async () => {
    const store = new InMemoryMemoryStore(3);
    const memory = new MemoryService({ store, embedder: null });

    for (let i = 0; i < 6; i++) {
      await memory.remember('u1', `fact number ${i}`);
    }

    const stored = await store.listMemories('u1', 100);
    expect(stored).toHaveLength(3);
    // Newest first.
    expect(stored[0].text).toBe('fact number 5');
  });

  it('keeps users isolated', async () => {
    const store = new InMemoryMemoryStore();
    const memory = new MemoryService({ store, embedder: null });
    await memory.remember('u1', 'one');
    await memory.remember('u2', 'two');

    expect((await store.listMemories('u1', 10)).map((m) => m.text)).toEqual(['one']);
    expect((await store.listMemories('u2', 10)).map((m) => m.text)).toEqual(['two']);
  });
});
