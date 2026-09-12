import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const app = initializeApp({ projectId: "gen-lang-client-0526957989" });

async function run() {
  try {
    // Generate a fake token or just see if it crashes before network
    await getAuth(app).verifyIdToken("fake-token");
  } catch (e) {
    console.error('Error:', e.message);
  }
}
run();
