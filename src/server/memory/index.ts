import { InMemoryMemoryStore } from './inMemoryStore';
import { FirestoreMemoryStore } from './firestoreStore';
import type { MemoryStore } from './types';

/**
 * Chooses the best available memory backend.
 *
 * Firestore when firebase-admin is initialised, otherwise an explicitly
 * non-durable in-process store. The choice is reported in /api/health so the
 * difference is never hidden from the operator.
 */
export function createMemoryStore(): MemoryStore {
  const firestore = FirestoreMemoryStore.create();
  if (firestore) return firestore;
  console.warn('[memory] Firestore unavailable; using a NON-DURABLE in-process store.');
  return new InMemoryMemoryStore();
}
