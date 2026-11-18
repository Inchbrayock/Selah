import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  type Auth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { firebaseConfig, isFirebaseConfigured } from './firebaseConfig';
import { isNativePlatform } from './nativeShell';

export { isFirebaseConfigured };

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  googleProvider: GoogleAuthProvider;
}

let cachedServices: FirebaseServices | null = null;
let emulatorsConnected = false;

function createFirestoreInstance(app: FirebaseApp): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    // Fallback if Firestore was already initialized (e.g. HMR) or IndexedDB is unavailable
    return getFirestore(app);
  }
}

export function getFirebaseServices(): FirebaseServices | null {
  if (!isFirebaseConfigured()) return null;
  if (cachedServices) return cachedServices;

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = createFirestoreInstance(app);
  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({ prompt: 'select_account' });

  if (
    !emulatorsConnected &&
    !isNativePlatform() &&
    import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' &&
    typeof window !== 'undefined' &&
    window.location.hostname === 'localhost'
  ) {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
    emulatorsConnected = true;
  }

  cachedServices = { app, auth, db, googleProvider };
  return cachedServices;
}
