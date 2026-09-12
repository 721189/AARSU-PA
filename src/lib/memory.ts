import { db, auth } from './firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';

// Helper: Cosine similarity between two vectors
function cosineSimilarity(A: number[], B: number[]) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < A.length; i++) {
    dotProduct += A[i] * B[i];
    normA += A[i] * A[i];
    normB += B[i] * B[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Generate embedding using the backend proxy
export async function getEmbedding(text: string, token: string): Promise<number[]> {
  if (!text || !token) return [];
  try {
    const res = await fetch('/api/embed', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ text })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("Embedding generation notice:", err.error || res.statusText);
      return [];
    }
    const data = await res.json();
    return data.embedding || [];
  } catch (err) {
    console.error("Embedding generation error:", err);
    return [];
  }
}

// Save message to long-term memory (Firestore)
export async function saveToMemory(uid: string, text: string, token: string) {
  if (!uid) return;
  try {
    const embedding = token ? await getEmbedding(text, token) : [];
    await addDoc(collection(db, 'users', uid, 'memories'), {
      text,
      embedding,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error("Failed to save memory:", error);
  }
}

// Retrieve relevant context using vector similarity
export async function retrieveContext(uid: string, queryText: string, token: string, topK: number = 5): Promise<string> {
  if (!uid || !token) return "";
  try {
    const queryEmbedding = await getEmbedding(queryText, token);
    if (!queryEmbedding.length) return "";
    
    // Fetch user memories
    const memoriesRef = collection(db, 'users', uid, 'memories');
    const q = query(memoriesRef, orderBy('timestamp', 'desc'), limit(100));
    const snapshot = await getDocs(q);
      
    if (snapshot.empty) return "";

    const scoredMemories = snapshot.docs.map(doc => {
      const data = doc.data();
      const score = cosineSimilarity(queryEmbedding, data.embedding || []);
      return { text: data.text, score };
    });

    // Sort by similarity and take topK
    scoredMemories.sort((a, b) => b.score - a.score);
    const topMemories = scoredMemories.slice(0, topK);
    
    return topMemories.map(m => m.text).join("\n");
  } catch (error) {
    console.error("Failed to retrieve context:", error);
    return "";
  }
}
