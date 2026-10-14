/**
 * Vector search primitives.
 *
 * Pure and dependency-free so retrieval quality can be unit tested without a
 * database or an embedding API.
 */

import type { MemoryRecord, ScoredMemory } from './types';

/**
 * Cosine similarity. Returns 0 when either vector is empty or has zero norm,
 * so a missing embedding degrades to "no signal" rather than NaN.
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

const STOP_WORDS = new Set([
  'what', 'when', 'where', 'that', 'this', 'with', 'from', 'have', 'your',
  'about', 'would', 'could', 'should', 'there', 'their', 'them', 'then',
  'than', 'into', 'does', 'did', 'the', 'and', 'for', 'are', 'was', 'were',
]);

/** Tokenises text into meaningful lowercase terms for the lexical fallback. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

/**
 * Lexical overlap score in [0, 1], used when embeddings are unavailable
 * (for example when the embedding quota is exhausted).
 */
export function lexicalScore(queryTerms: readonly string[], text: string): number {
  if (queryTerms.length === 0) return 0;
  const haystack = text.toLowerCase();
  let hits = 0;
  for (const term of queryTerms) {
    if (haystack.includes(term)) hits++;
  }
  return hits / queryTerms.length;
}

export interface RankOptions {
  /** Minimum score for a memory to be returned. Default 0.35. */
  minScore?: number;
  /** Maximum number of results. Default 5. */
  topK?: number;
}

/**
 * Ranks memories against a query embedding.
 *
 * Falls back to lexical overlap when the query embedding is empty or no stored
 * memory has an embedding — so a quota-limited deployment still returns useful
 * context instead of nothing.
 */
export function rankMemories(
  queryText: string,
  queryEmbedding: readonly number[],
  memories: readonly MemoryRecord[],
  options: RankOptions = {}
): ScoredMemory[] {
  const minScore = options.minScore ?? 0.35;
  const topK = options.topK ?? 5;

  const hasEmbeddings = queryEmbedding.length > 0 && memories.some((m) => m.embedding.length > 0);

  if (hasEmbeddings) {
    return memories
      .map((record) => ({ record, score: cosineSimilarity(queryEmbedding, record.embedding) }))
      .filter((scored) => scored.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  const terms = tokenize(queryText);
  return memories
    .map((record) => ({ record, score: lexicalScore(terms, record.text), lexical: true as const }))
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/** Formats retrieved memories for injection into a system instruction. */
export function formatMemories(scored: readonly ScoredMemory[], maxChars = 2000): string {
  if (scored.length === 0) return '';
  const lines = scored.map((s) => `- ${s.record.text}`);
  return lines.join('\n').slice(0, maxChars);
}
