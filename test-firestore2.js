import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ projectId: "gen-lang-client-0526957989" });
const db = getFirestore(app, "ai-studio-aarsu-bfa2d125-b517-4047-bdc4-a51bbef1cada");

async function run() {
  try {
    const doc = await db.collection('test').doc('test').get();
    console.log('Success!', doc.exists);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
run();
