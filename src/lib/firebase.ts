import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const firebaseConfig = {
  projectId: "gen-lang-client-0526957989",
  appId: "1:1054744311444:web:e97a25066c8c07a1ffe681",
  apiKey: "AIzaSyBf8gwNxlu7HT2iZrnvPIPL87aiiBdIL2s",
  authDomain: "gen-lang-client-0526957989.firebaseapp.com",
  storageBucket: "gen-lang-client-0526957989.firebasestorage.app",
  messagingSenderId: "1054744311444"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Error signing in with Google', error);
    throw error;
  }
};
