import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  onIdTokenChanged, 
  User 
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || "(default)");

const provider = new GoogleAuthProvider();

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth state listener. Uses onIdTokenChanged to automatically refresh tokens before expiry.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onIdTokenChanged(auth, async (user: User | null) => {
    if (user) {
      try {
        const idToken = await user.getIdToken();
        if (onAuthSuccess) onAuthSuccess(user, idToken);
      } catch (err) {
        console.error("Failed to retrieve ID token:", err);
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Check if user is actively authenticated
export const isUserAuthenticated = (): boolean => {
  return Boolean(auth.currentUser);
};

// Retrieve a fresh, non-expired ID token
export const getFreshIdToken = async (forceRefresh: boolean = false): Promise<string | null> => {
  try {
    if (!auth.currentUser && typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken(forceRefresh);
  } catch (err: any) {
    console.warn("Notice: retrieving fresh ID token:", err?.message || err);
    return null;
  }
};

// Enterprise authenticated fetch with automatic 401 token refresh retry loop
export const authenticatedFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
  let token = await getFreshIdToken(false);

  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response = await fetch(url, { ...init, headers });

  // If token expired (401), force-refresh and retry request once with brand new ID token
  if (response.status === 401) {
    try {
      const freshToken = await getFreshIdToken(true);
      if (freshToken) {
        const retryHeaders = new Headers(init.headers || {});
        retryHeaders.set('Authorization', `Bearer ${freshToken}`);
        response = await fetch(url, { ...init, headers: retryHeaders });
      }
    } catch (refreshErr) {
      console.warn("Token refresh retry notice:", refreshErr);
    }
  }

  return response;
};

export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const idToken = await result.user.getIdToken();
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
    }
    
    return { user: result.user, accessToken: idToken };
  } catch (error) {
    console.error('Error signing in with Google', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};
