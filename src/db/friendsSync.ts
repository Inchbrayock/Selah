import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore';
import type { AccountUser } from '../lib/auth';
import { getFirebaseServices } from '../lib/firebase';
import {
  buildFriendProfileStats,
  DEFAULT_FRIEND_PRIVACY,
  generateFriendCode,
  getFriendPairId,
  getOrderedUsersPair,
  isValidFriendCode,
  normalizeFriendCode,
  sanitizeFriendPrivacy,
  sanitizeHttpsPhotoUrl,
} from '../lib/friends';
import type {
  AchievementStatus,
  BibleProgressSummary,
  FriendCodeLookup,
  FriendPrivacySettings,
  FriendProfile,
  FriendStatsSnapshot,
  FriendshipRecord,
  ReadingPlan,
  UserPreferences,
} from '../types/bible';

function timestampToIso(value: unknown): string {
  if (value && typeof value === 'object' && 'toDate' in value) {
    const fn = (value as Timestamp).toDate;
    if (typeof fn === 'function') {
      try {
        return fn.call(value).toISOString();
      } catch {
        // Fallback below
      }
    }
  }
  if (typeof value === 'string' && value) return value;
  return new Date().toISOString();
}

function docToStatsSnapshot(raw: unknown): FriendStatsSnapshot {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    totalChaptersRead:
      typeof data.totalChaptersRead === 'number' ? data.totalChaptersRead : 0,
    otChaptersRead: typeof data.otChaptersRead === 'number' ? data.otChaptersRead : 0,
    ntChaptersRead: typeof data.ntChaptersRead === 'number' ? data.ntChaptersRead : 0,
    booksCompleted: typeof data.booksCompleted === 'number' ? data.booksCompleted : 0,
    currentStreak: typeof data.currentStreak === 'number' ? data.currentStreak : 0,
    longestStreak: typeof data.longestStreak === 'number' ? data.longestStreak : 0,
    unlockedSealsCount:
      typeof data.unlockedSealsCount === 'number' ? data.unlockedSealsCount : 0,
    lastReadBookId: typeof data.lastReadBookId === 'string' ? data.lastReadBookId : null,
    lastReadDate: typeof data.lastReadDate === 'string' ? data.lastReadDate : null,
    activePlanId: typeof data.activePlanId === 'string' ? data.activePlanId : null,
    activePlanTitle: typeof data.activePlanTitle === 'string' ? data.activePlanTitle : null,
    bookProgressSpec: typeof data.bookProgressSpec === 'string' ? data.bookProgressSpec : '',
  };
}

export function docToFriendProfile(docId: string, data: DocumentData): FriendProfile | null {
  if (typeof data.friendCode !== 'string' || !isValidFriendCode(data.friendCode)) {
    return null;
  }
  const privacy = sanitizeFriendPrivacy(data.privacy as Partial<FriendPrivacySettings> | undefined);
  return {
    uid: typeof data.uid === 'string' && data.uid ? data.uid : docId,
    displayName: typeof data.displayName === 'string' ? data.displayName : 'Selah Reader',
    photoURL: sanitizeHttpsPhotoUrl(data.photoURL),
    friendCode: data.friendCode,
    sharingEnabled:
      typeof data.sharingEnabled === 'boolean' ? data.sharingEnabled : privacy.sharingEnabled,
    privacy,
    stats: docToStatsSnapshot(data.stats),
    updatedAt: data.updatedAt ? timestampToIso(data.updatedAt) : undefined,
  };
}

export function docToFriendship(docId: string, data: DocumentData): FriendshipRecord | null {
  if (
    !Array.isArray(data.users) ||
    data.users.length !== 2 ||
    typeof data.users[0] !== 'string' ||
    typeof data.users[1] !== 'string' ||
    typeof data.requesterUid !== 'string' ||
    typeof data.recipientUid !== 'string' ||
    (data.status !== 'pending' && data.status !== 'accepted')
  ) {
    return null;
  }

  return {
    id: typeof data.id === 'string' && data.id ? data.id : docId,
    users: [data.users[0], data.users[1]],
    requesterUid: data.requesterUid,
    recipientUid: data.recipientUid,
    requesterName: typeof data.requesterName === 'string' ? data.requesterName : 'Selah Reader',
    requesterPhotoURL: sanitizeHttpsPhotoUrl(data.requesterPhotoURL),
    recipientName: typeof data.recipientName === 'string' ? data.recipientName : 'Selah Reader',
    recipientPhotoURL: sanitizeHttpsPhotoUrl(data.recipientPhotoURL),
    status: data.status,
    createdAt: timestampToIso(data.createdAt),
    acceptedAt: data.acceptedAt ? timestampToIso(data.acceptedAt) : null,
    updatedAt: timestampToIso(data.updatedAt),
  };
}

function resolveDisplayName(user: AccountUser): string {
  const trimmed = (user.displayName ?? '').trim().slice(0, 100);
  if (trimmed) return trimmed;
  if (user.email) {
    const localPart = user.email.split('@')[0]?.trim();
    if (localPart) return localPart.slice(0, 100);
  }
  return 'Selah Reader';
}

function buildFriendProfilePayload(params: {
  user: AccountUser;
  friendCode: string;
  summary: BibleProgressSummary;
  achievements: AchievementStatus[];
  preferences: UserPreferences;
  allPlans: ReadingPlan[];
}): Record<string, unknown> {
  const privacy = sanitizeFriendPrivacy(params.preferences.friendPrivacy ?? DEFAULT_FRIEND_PRIVACY);
  const stats = buildFriendProfileStats({
    summary: params.summary,
    achievements: params.achievements,
    preferences: { ...params.preferences, friendPrivacy: privacy },
    allPlans: params.allPlans,
  });

  return {
    uid: params.user.uid,
    displayName: resolveDisplayName(params.user),
    photoURL:
      privacy.sharingEnabled && privacy.showPhoto
        ? sanitizeHttpsPhotoUrl(params.user.photoURL)
        : null,
    friendCode: params.friendCode,
    sharingEnabled: privacy.sharingEnabled,
    privacy,
    stats,
    updatedAt: serverTimestamp(),
  };
}

async function allocateAvailableFriendCode(db: NonNullable<ReturnType<typeof getFirebaseServices>>['db']): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = generateFriendCode();
    const existing = await getDoc(doc(db, 'friendCodes', candidate));
    if (!existing.exists()) {
      return candidate;
    }
  }
  throw new Error('Could not generate a unique friend code. Please try again.');
}

export async function ensureOwnFriendProfile(params: {
  user: AccountUser;
  summary: BibleProgressSummary;
  achievements: AchievementStatus[];
  preferences: UserPreferences;
  allPlans: ReadingPlan[];
}): Promise<FriendProfile | null> {
  const services = getFirebaseServices();
  if (!services) return null;

  const profileRef = doc(services.db, 'friendProfiles', params.user.uid);
  const existingSnap = await getDoc(profileRef);
  const displayName = resolveDisplayName(params.user);

  if (existingSnap.exists()) {
    const parsed = docToFriendProfile(existingSnap.id, existingSnap.data());
    if (parsed) {
      const codeRef = doc(services.db, 'friendCodes', parsed.friendCode);
      const codeSnap = await getDoc(codeRef);
      if (!codeSnap.exists()) {
        await setDoc(codeRef, {
          code: parsed.friendCode,
          uid: params.user.uid,
          displayName,
          updatedAt: serverTimestamp(),
        });
      }
      const nextPayload = buildFriendProfilePayload({
        ...params,
        friendCode: parsed.friendCode,
      });
      await setDoc(profileRef, nextPayload);
      return {
        uid: params.user.uid,
        displayName,
        photoURL: nextPayload.photoURL as string | null,
        friendCode: parsed.friendCode,
        sharingEnabled: nextPayload.sharingEnabled as boolean,
        privacy: nextPayload.privacy as FriendPrivacySettings,
        stats: nextPayload.stats as FriendStatsSnapshot,
      };
    }
  }

  const friendCode = await allocateAvailableFriendCode(services.db);
  const payload = buildFriendProfilePayload({
    ...params,
    friendCode,
  });

  const batch = writeBatch(services.db);
  batch.set(profileRef, payload);
  batch.set(doc(services.db, 'friendCodes', friendCode), {
    code: friendCode,
    uid: params.user.uid,
    displayName,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();

  return {
    uid: params.user.uid,
    displayName,
    photoURL: payload.photoURL as string | null,
    friendCode,
    sharingEnabled: payload.sharingEnabled as boolean,
    privacy: payload.privacy as FriendPrivacySettings,
    stats: payload.stats as FriendStatsSnapshot,
  };
}

export async function publishOwnFriendStats(params: {
  user: AccountUser;
  friendCode: string;
  summary: BibleProgressSummary;
  achievements: AchievementStatus[];
  preferences: UserPreferences;
  allPlans: ReadingPlan[];
  syncCodeName?: boolean;
}): Promise<FriendProfile | null> {
  const services = getFirebaseServices();
  if (!services || !isValidFriendCode(params.friendCode)) return null;

  const payload = buildFriendProfilePayload(params);
  const profileRef = doc(services.db, 'friendProfiles', params.user.uid);
  const displayName = payload.displayName as string;

  if (params.syncCodeName) {
    const batch = writeBatch(services.db);
    batch.set(profileRef, payload);
    batch.update(doc(services.db, 'friendCodes', params.friendCode), {
      displayName,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } else {
    await setDoc(profileRef, payload);
  }

  return {
    uid: params.user.uid,
    displayName,
    photoURL: payload.photoURL as string | null,
    friendCode: params.friendCode,
    sharingEnabled: payload.sharingEnabled as boolean,
    privacy: payload.privacy as FriendPrivacySettings,
    stats: payload.stats as FriendStatsSnapshot,
    updatedAt: new Date().toISOString(),
  };
}

export async function regenerateOwnFriendCode(params: {
  user: AccountUser;
  previousCode: string | null;
  summary: BibleProgressSummary;
  achievements: AchievementStatus[];
  preferences: UserPreferences;
  allPlans: ReadingPlan[];
}): Promise<FriendProfile | null> {
  const services = getFirebaseServices();
  if (!services) return null;

  const nextCode = await allocateAvailableFriendCode(services.db);
  const payload = buildFriendProfilePayload({
    ...params,
    friendCode: nextCode,
  });
  const displayName = payload.displayName as string;

  const batch = writeBatch(services.db);
  if (params.previousCode && isValidFriendCode(params.previousCode)) {
    batch.delete(doc(services.db, 'friendCodes', params.previousCode));
  }
  batch.set(doc(services.db, 'friendCodes', nextCode), {
    code: nextCode,
    uid: params.user.uid,
    displayName,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(services.db, 'friendProfiles', params.user.uid), payload);
  await batch.commit();

  return {
    uid: params.user.uid,
    displayName,
    photoURL: payload.photoURL as string | null,
    friendCode: nextCode,
    sharingEnabled: payload.sharingEnabled as boolean,
    privacy: payload.privacy as FriendPrivacySettings,
    stats: payload.stats as FriendStatsSnapshot,
    updatedAt: new Date().toISOString(),
  };
}

export async function lookupFriendByCode(rawInput: string): Promise<FriendCodeLookup | null> {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Cloud sync is required to look up friend codes.');
  }

  const normalized = normalizeFriendCode(rawInput);
  if (!normalized) {
    throw new Error('Enter an 8-character friend code (for example, K7M4-P9Q2) or invite link.');
  }

  const snap = await getDoc(doc(services.db, 'friendCodes', normalized));
  if (!snap.exists()) {
    return null;
  }

  const data = snap.data();
  if (typeof data.uid !== 'string' || !data.uid) {
    return null;
  }

  return {
    code: normalized,
    uid: data.uid,
    displayName: typeof data.displayName === 'string' && data.displayName.trim()
      ? data.displayName.trim()
      : 'Selah Reader',
  };
}

export async function sendFriendRequest(params: {
  currentUser: AccountUser;
  target: FriendCodeLookup;
  ownPrivacy?: FriendPrivacySettings;
}): Promise<{ outcome: 'sent' | 'accepted' }> {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Cloud sync is required to send friend requests.');
  }

  if (params.target.uid === params.currentUser.uid) {
    throw new Error('That is your own friend code.');
  }

  const pairId = getFriendPairId(params.currentUser.uid, params.target.uid);
  const users = getOrderedUsersPair(params.currentUser.uid, params.target.uid);
  const friendshipRef = doc(services.db, 'friendships', pairId);

  const existingSnap = await getDoc(friendshipRef);
  if (existingSnap.exists()) {
    const existing = docToFriendship(existingSnap.id, existingSnap.data());
    if (existing?.status === 'accepted') {
      throw new Error(`You are already connected with ${params.target.displayName}.`);
    }
    if (existing?.status === 'pending') {
      if (existing.requesterUid === params.currentUser.uid) {
        throw new Error(`You already sent a request to ${params.target.displayName}.`);
      }
      // Mutual invite: recipient already requested us, so accept cleanly
      await acceptFriendRequest({
        currentUser: params.currentUser,
        pairId,
        ownPrivacy: params.ownPrivacy,
      });
      return { outcome: 'accepted' };
    }
  }

  const privacy = sanitizeFriendPrivacy(params.ownPrivacy);
  const requesterPhotoURL =
    privacy.sharingEnabled && privacy.showPhoto
      ? sanitizeHttpsPhotoUrl(params.currentUser.photoURL)
      : null;

  try {
    await setDoc(friendshipRef, {
      id: pairId,
      users,
      requesterUid: params.currentUser.uid,
      recipientUid: params.target.uid,
      requesterName: resolveDisplayName(params.currentUser),
      requesterPhotoURL,
      recipientName: params.target.displayName.trim().slice(0, 100) || 'Selah Reader',
      recipientPhotoURL: null,
      status: 'pending',
      createdAt: serverTimestamp(),
      acceptedAt: null,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';
    if (code === 'permission-denied') {
      throw new Error('Could not send request to this reader right now.');
    }
    throw err;
  }

  return { outcome: 'sent' };
}

export async function acceptFriendRequest(params: {
  currentUser: AccountUser;
  pairId: string;
  ownPrivacy?: FriendPrivacySettings;
}): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return;

  const privacy = sanitizeFriendPrivacy(params.ownPrivacy);
  const recipientPhotoURL =
    privacy.sharingEnabled && privacy.showPhoto
      ? sanitizeHttpsPhotoUrl(params.currentUser.photoURL)
      : null;

  await updateDoc(doc(services.db, 'friendships', params.pairId), {
    status: 'accepted',
    recipientName: resolveDisplayName(params.currentUser),
    recipientPhotoURL,
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteFriendship(pairId: string): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return;
  await deleteDoc(doc(services.db, 'friendships', pairId));
}

export async function blockUserAndRemoveFriendship(params: {
  myUid: string;
  targetUid: string;
  targetDisplayName: string;
  pairId?: string;
}): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return;

  const batch = writeBatch(services.db);
  batch.set(doc(services.db, 'users', params.myUid, 'blockedUsers', params.targetUid), {
    blockedUid: params.targetUid,
    displayName: params.targetDisplayName.trim().slice(0, 100),
    createdAt: serverTimestamp(),
  });
  if (params.pairId) {
    batch.delete(doc(services.db, 'friendships', params.pairId));
  }
  await batch.commit();
}

export function subscribeFriendships(
  uid: string,
  handlers: {
    onFriendships: (records: FriendshipRecord[], fromCache: boolean) => void;
    onError: (err: Error) => void;
  }
): () => void {
  const services = getFirebaseServices();
  if (!services) return () => {};

  const friendshipsQuery = query(
    collection(services.db, 'friendships'),
    where('users', 'array-contains', uid)
  );

  return onSnapshot(
    friendshipsQuery,
    (snap) => {
      const next: FriendshipRecord[] = [];
      snap.forEach((docSnap) => {
        const parsed = docToFriendship(docSnap.id, docSnap.data());
        if (parsed) next.push(parsed);
      });
      handlers.onFriendships(next, snap.metadata.fromCache);
    },
    (err) => handlers.onError(err)
  );
}

export function subscribeFriendProfile(
  friendUid: string,
  onProfile: (profile: FriendProfile | null) => void,
  onError?: (err: Error) => void
): () => void {
  const services = getFirebaseServices();
  if (!services) return () => {};

  return onSnapshot(
    doc(services.db, 'friendProfiles', friendUid),
    (snap) => {
      if (!snap.exists()) {
        onProfile(null);
        return;
      }
      onProfile(docToFriendProfile(snap.id, snap.data()));
    },
    (err) => {
      onError?.(err);
    }
  );
}
