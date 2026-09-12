import { GoogleGenAI } from '@google/genai';
import { db } from './auth';
import * as admin from 'firebase-admin';

let ai: GoogleGenAI | null = null;
function getAI() {
  if (!ai) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is missing");
    ai = new GoogleGenAI({ apiKey: key });
  }
  return ai;
}

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

// Generate embedding for text
export async function getEmbedding(text: string): Promise<number[]> {
  const client = getAI();
  const response = await client.models.embedContent({
    model: 'text-embedding-004',
    contents: text,
  });
  return response.embeddings?.[0]?.values || [];
}

// Save message to long-term memory (Firestore)
export async function saveToMemory(uid: string, text: string) {
  try {
    const embedding = await getEmbedding(text);
    await db.collection('users').doc(uid).collection('memories').add({
      text,
      embedding,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("Failed to save memory:", error);
  }
}

// Retrieve relevant context using vector similarity
export async function retrieveContext(uid: string, query: string, topK: number = 5): Promise<string> {
  try {
    const queryEmbedding = await getEmbedding(query);
    
    // Fetch user memories (in a true enterprise app, this would use a proper Vector Search index)
    // For this simulation, we fetch recent memories and rank them locally
    const snapshot = await db.collection('users')
      .doc(uid)
      .collection('memories')
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();
      
    if (snapshot.empty) return "";

    const scoredMemories = snapshot.docs.map(doc => {
      const data = doc.data();
      const score = cosineSimilarity(queryEmbedding, data.embedding || []);
      return { text: data.text, score };
    });

    // Sort by similarity and take topK
    scoredMemories.sort((a, b) => b.score - a.score);
    const topMemories = scoredMemories.slice(0, topK);
    
    return topMemories.map(m => m.text).join("\\n");
  } catch (error) {
    console.error("Failed to retrieve context:", error);
    return "";
  }
}
