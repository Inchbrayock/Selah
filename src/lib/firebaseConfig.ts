import { getLocalOwnerUid } from '../db/repository';
import { isNativePlatform } from './nativeShell';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Lightweight, zero-SDK check for whether Firebase environment config is present.
 * Kept separate from firebase.ts so local-only users do not eagerly load the Firebase SDK.
 */
export function isFirebaseConfigured(): boolean {
  const isTestEnv =
    import.meta.env.MODE === 'test' &&
    import.meta.env.VITE_ENABLE_FIREBASE_IN_TESTS !== 'true';
  if (isTestEnv) return false;

  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
  );
}

/**
 * Determines whether Firebase Auth should be loaded immediately at startup
 * (existing session, native app, or test runtime) vs. deferred until sign-in.
 */
export function shouldEagerlyLoadFirebase(): boolean {
  if (import.meta.env.MODE === 'test') return true;
  if (!isFirebaseConfigured()) return false;
  if (isNativePlatform()) return true;
  if (getLocalOwnerUid()) return true;

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('firebase:authUser:')) {
          return true;
        }
      }
    } catch {
      // Ignore storage access failures
    }
  }
  return false;
}
