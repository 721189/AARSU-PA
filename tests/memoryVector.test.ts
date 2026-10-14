import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  formatMemories,
  lexicalScore,
  rankMemories,
  tokenize,
} from '../src/server/memory/vector';
import type { MemoryRecord } from '../src/server/memory/types';

function memory(id: string, text: string, embedding: number[] = []): MemoryRecord {
  return {
    id,
    userId: 'u1',
    text,
    embedding,
    tags: [],
    createdAt: new Date().toISOString(),
  };
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  it('returns 0 rather than NaN for a zero vector', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('returns 0 for mismatched dimensions instead of throwing', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });

  it('returns 0 when either vector is empty', () => {
    expect(cosineSimilarity([], [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 2], [])).toBe(0);
  });
});

describe('tokenize', () => {
  it('lowercases and drops short terms', () => {
    expect(tokenize('The ARC reactor is ON')).toEqual(['arc', 'reactor']);
  });

  it('drops common stop words', () => {
    expect(tokenize('what is the status of the reactor')).toEqual(['status', 'reactor']);
  });

  it('returns nothing for punctuation-only input', () => {
    expect(tokenize('!!! ...')).toEqual([]);
  });
});

describe('lexicalScore', () => {
  it('scores full overlap as 1', () => {
    expect(lexicalScore(['reactor', 'stable'], 'the reactor is stable')).toBe(1);
  });

  it('scores partial overlap proportionally', () => {
    expect(lexicalScore(['reactor', 'banana'], 'the reactor is stable')).toBe(0.5);
  });

  it('scores no overlap as 0', () => {
    expect(lexicalScore(['banana'], 'the reactor is stable')).toBe(0);
  });

  it('returns 0 for an empty query', () => {
    expect(lexicalScore([], 'anything')).toBe(0);
  });
});

describe('rankMemories', () => {
  it('ranks by cosine similarity when embeddings are present', () => {
    const memories = [
      memory('close', 'close match', [1, 0.01]),
      memory('exact', 'exact match', [1, 0]),
      memory('orthogonal', 'unrelated', [0, 1]),
    ];

    const ranked = rankMemories('query', [1, 0], memories, { minScore: 0.5 });

    // The orthogonal memory is filtered out by minScore.
    expect(ranked.map((r) => r.record.id)).toEqual(['exact', 'close']);
    expect(ranked.every((r) => r.score >= 0.5)).toBe(true);
  });

  it('respects topK', () => {
    const memories = Array.from({ length: 10 }, (_, i) => memory(String(i), `t${i}`, [1, 0]));
    expect(rankMemories('q', [1, 0], memories, { topK: 3 })).toHaveLength(3);
  });

  it('falls back to lexical matching when no embeddings exist', () => {
    const memories = [memory('a', 'the arc reactor is stable'), memory('b', 'weather in london')];
    const ranked = rankMemories('reactor status', [], memories);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].record.id).toBe('a');
    expect(ranked[0].lexical).toBe(true);
  });

  it('falls back to lexical when the query embedding is empty', () => {
    const memories = [memory('a', 'the arc reactor is stable', [1, 0])];
    const ranked = rankMemories('reactor', [], memories);
    expect(ranked[0].lexical).toBe(true);
  });

  it('returns nothing for an empty corpus', () => {
    expect(rankMemories('anything', [1, 0], [])).toEqual([]);
  });

  it('sorts descending by score', () => {
    const memories = [
      memory('low', 'x', [0.1, 1]),
      memory('high', 'y', [1, 0.01]),
      memory('mid', 'z', [0.7, 0.7]),
    ];
    const ranked = rankMemories('q', [1, 0], memories, { minScore: 0 });
    expect(ranked.map((r) => r.record.id)).toEqual(['high', 'mid', 'low']);
  });
});

describe('formatMemories', () => {
  it('returns an empty string for no matches', () => {
    expect(formatMemories([])).toBe('');
  });

  it('renders one bullet per memory', () => {
    const formatted = formatMemories([
      { record: memory('a', 'fact one'), score: 1 },
      { record: memory('b', 'fact two'), score: 1 },
    ]);
    expect(formatted).toBe('- fact one\n- fact two');
  });

  it('truncates to the character budget', () => {
    const formatted = formatMemories(
      [{ record: memory('a', 'x'.repeat(500)), score: 1 }],
      50
    );
    expect(formatted.length).toBeLessThanOrEqual(50);
  });
});
