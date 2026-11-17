import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Query,
  type Timestamp,
} from 'firebase/firestore';
import type { AccountUser } from '../lib/auth';
import { getFirebaseServices } from '../lib/firebase';
import {
  buildDirectorySearchPrefixes,
  buildFriendProfileStats,
  DEFAULT_FRIEND_PRIVACY,
  deriveBaseUsername,
  getFriendPairId,
  getOrderedUsersPair,
  isValidUsername,
  matchesDirectoryQuery,
  normalizeReaderSearchQuery,
  normalizeUsernameInput,
  rankDirectoryMatch,
  sanitizeFriendPrivacy,
  sanitizeHttpsPhotoUrl,
  validateUsername,
} from '../lib/friends';
import type {
  AchievementStatus,
  BibleProgressSummary,
  FriendPrivacySettings,
  FriendProfile,
  FriendRequestTarget,
  FriendStatsSnapshot,
  FriendshipRecord,
  ReaderDirectoryEntry,
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
  const privacy = sanitizeFriendPrivacy(data.privacy as Partial<FriendPrivacySettings> | undefined);
  const username = isValidUsername(data.username) ? data.username : null;
  const discoverable =
    typeof data.discoverable === 'boolean' ? data.discoverable : privacy.discoverable;
  return {
    uid: typeof data.uid === 'string' && data.uid ? data.uid : docId,
    displayName: typeof data.displayName === 'string' ? data.displayName : 'Selah Reader',
    photoURL: sanitizeHttpsPhotoUrl(data.photoURL),
    username,
    discoverable,
    ...(typeof data.friendCode === 'string' && data.friendCode
      ? { friendCode: data.friendCode }
      : {}),
    sharingEnabled:
      typeof data.sharingEnabled === 'boolean' ? data.sharingEnabled : privacy.sharingEnabled,
    privacy,
    stats: docToStatsSnapshot(data.stats),
    updatedAt: data.updatedAt ? timestampToIso(data.updatedAt) : undefined,
  };
}

export function docToReaderDirectoryEntry(
  docId: string,
  data: DocumentData
): ReaderDirectoryEntry | null {
  const uid = typeof data.uid === 'string' && data.uid ? data.uid : docId;
  if (!uid) return null;
  return {
    uid,
    displayName:
      typeof data.displayName === 'string' && data.displayName.trim()
        ? data.displayName.trim()
        : 'Selah Reader',
    username: isValidUsername(data.username) ? data.username : null,
    photoURL: sanitizeHttpsPhotoUrl(data.photoURL),
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
    requesterUsername: isValidUsername(data.requesterUsername) ? data.requesterUsername : null,
    requesterPhotoURL: sanitizeHttpsPhotoUrl(data.requesterPhotoURL),
    recipientName: typeof data.recipientName === 'string' ? data.recipientName : 'Selah Reader',
    recipientUsername: isValidUsername(data.recipientUsername) ? data.recipientUsername : null,
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

function resolveDirectoryPhotoUrl(user: AccountUser, privacy: FriendPrivacySettings): string | null {
  return privacy.showPhoto ? sanitizeHttpsPhotoUrl(user.photoURL) : null;
}

function buildFriendProfilePayload(params: {
  user: AccountUser;
  username: string | null;
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
    username: isValidUsername(params.username) ? params.username : null,
    discoverable: privacy.discoverable,
    sharingEnabled: privacy.sharingEnabled,
    privacy,
    stats,
    updatedAt: serverTimestamp(),
  };
}

function buildReaderDirectoryPayload(params: {
  user: AccountUser;
  username: string | null;
  privacy: FriendPrivacySettings;
}): Record<string, unknown> {
  const displayName = resolveDisplayName(params.user);
  const cleanUsername = isValidUsername(params.username) ? params.username : null;
  return {
    uid: params.user.uid,
    displayName,
    displayNameLower: displayName.toLowerCase().slice(0, 100),
    username: cleanUsername,
    photoURL: resolveDirectoryPhotoUrl(params.user, params.privacy),
    searchPrefixes: buildDirectorySearchPrefixes(displayName, cleanUsername),
    updatedAt: serverTimestamp(),
  };
}

async function allocateAvailableUsername(
  db: NonNullable<ReturnType<typeof getFirebaseServices>>['db'],
  displayName: string,
  uid: string
): Promise<string> {
  const base = deriveBaseUsername(displayName);
  const candidates: string[] = [];

  if (base !== 'reader') {
    candidates.push(base);
    for (let n = 2; n <= 9; n++) {
      const withNum = `${base.slice(0, 22)}${n}`;
      if (isValidUsername(withNum)) candidates.push(withNum);
    }
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    const suffix = Math.floor(100 + Math.random() * 9000);
    const candidate = `${base.slice(0, 18)}.${suffix}`.replace(/\.{2,}/g, '.');
    if (isValidUsername(candidate)) {
      candidates.push(candidate);
    }
  }

  for (const candidate of candidates) {
    const snap = await getDoc(doc(db, 'usernames', candidate));
    if (!snap.exists() || snap.data()?.uid === uid) {
      return candidate;
    }
  }

  throw new Error('Could not reserve a default username right now. Please try again.');
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
  const directoryRef = doc(services.db, 'readerDirectory', params.user.uid);
  const existingSnap = await getDoc(profileRef);
  const displayName = resolveDisplayName(params.user);
  const privacy = sanitizeFriendPrivacy(params.preferences.friendPrivacy ?? DEFAULT_FRIEND_PRIVACY);

  let resolvedUsername: string | null = null;
  let needClaimUsernameDoc = false;

  if (existingSnap.exists()) {
    const parsed = docToFriendProfile(existingSnap.id, existingSnap.data());
    if (parsed?.username && isValidUsername(parsed.username)) {
      const handleSnap = await getDoc(doc(services.db, 'usernames', parsed.username));
      if (!handleSnap.exists()) {
        resolvedUsername = parsed.username;
        needClaimUsernameDoc = true;
      } else if (handleSnap.data()?.uid === params.user.uid) {
        resolvedUsername = parsed.username;
      }
    }
  }

  if (!resolvedUsername) {
    resolvedUsername = await allocateAvailableUsername(services.db, displayName, params.user.uid);
    const existingHandle = await getDoc(doc(services.db, 'usernames', resolvedUsername));
    needClaimUsernameDoc = !existingHandle.exists();
  }

  const profilePayload = buildFriendProfilePayload({
    ...params,
    username: resolvedUsername,
  });

  const batch = writeBatch(services.db);
  if (needClaimUsernameDoc && resolvedUsername) {
    batch.set(doc(services.db, 'usernames', resolvedUsername), {
      username: resolvedUsername,
      uid: params.user.uid,
      updatedAt: serverTimestamp(),
    });
  }
  batch.set(profileRef, profilePayload);

  if (privacy.discoverable) {
    batch.set(
      directoryRef,
      buildReaderDirectoryPayload({
        user: params.user,
        username: resolvedUsername,
        privacy,
      })
    );
  } else {
    batch.delete(directoryRef);
  }

  await batch.commit();

  return {
    uid: params.user.uid,
    displayName,
    photoURL: profilePayload.photoURL as string | null,
    username: resolvedUsername,
    discoverable: privacy.discoverable,
    sharingEnabled: profilePayload.sharingEnabled as boolean,
    privacy: profilePayload.privacy as FriendPrivacySettings,
    stats: profilePayload.stats as FriendStatsSnapshot,
  };
}

export async function publishOwnFriendStats(params: {
  user: AccountUser;
  username: string | null;
  summary: BibleProgressSummary;
  achievements: AchievementStatus[];
  preferences: UserPreferences;
  allPlans: ReadingPlan[];
  syncDirectory?: boolean;
}): Promise<FriendProfile | null> {
  const services = getFirebaseServices();
  if (!services) return null;

  const privacy = sanitizeFriendPrivacy(params.preferences.friendPrivacy ?? DEFAULT_FRIEND_PRIVACY);
  const payload = buildFriendProfilePayload(params);
  const profileRef = doc(services.db, 'friendProfiles', params.user.uid);
  const directoryRef = doc(services.db, 'readerDirectory', params.user.uid);
  const displayName = payload.displayName as string;
  const cleanUsername = isValidUsername(params.username) ? params.username : null;

  if (params.syncDirectory !== false) {
    const batch = writeBatch(services.db);
    batch.set(profileRef, payload);
    if (privacy.discoverable) {
      batch.set(
        directoryRef,
        buildReaderDirectoryPayload({
          user: params.user,
          username: cleanUsername,
          privacy,
        })
      );
    } else {
      batch.delete(directoryRef);
    }
    await batch.commit();
  } else {
    await setDoc(profileRef, payload);
  }

  return {
    uid: params.user.uid,
    displayName,
    photoURL: payload.photoURL as string | null,
    username: cleanUsername,
    discoverable: privacy.discoverable,
    sharingEnabled: payload.sharingEnabled as boolean,
    privacy: payload.privacy as FriendPrivacySettings,
    stats: payload.stats as FriendStatsSnapshot,
    updatedAt: new Date().toISOString(),
  };
}

export async function checkUsernameAvailability(
  rawInput: string,
  currentUid?: string
): Promise<{
  available: boolean;
  normalized: string;
  ownedByMe?: boolean;
  error?: string;
}> {
  const normalized = normalizeUsernameInput(rawInput);
  const validation = validateUsername(rawInput);
  if (!validation.ok) {
    return { available: false, normalized, error: validation.error };
  }

  const services = getFirebaseServices();
  if (!services) {
    return {
      available: false,
      normalized: validation.username,
      error: 'Cloud sync is required to check username availability.',
    };
  }

  const snap = await getDoc(doc(services.db, 'usernames', validation.username));
  if (!snap.exists()) {
    return { available: true, normalized: validation.username };
  }
  const ownerUid = snap.data()?.uid;
  if (currentUid && ownerUid === currentUid) {
    return { available: true, normalized: validation.username, ownedByMe: true };
  }
  return {
    available: false,
    normalized: validation.username,
    error: `@${validation.username} is already taken.`,
  };
}

export async function claimCustomUsername(params: {
  user: AccountUser;
  previousUsername: string | null;
  nextUsername: string;
  summary: BibleProgressSummary;
  achievements: AchievementStatus[];
  preferences: UserPreferences;
  allPlans: ReadingPlan[];
}): Promise<FriendProfile | null> {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Cloud sync is required to update your username.');
  }

  const validation = validateUsername(params.nextUsername);
  if (!validation.ok) {
    throw new Error(validation.error);
  }
  const cleanNext = validation.username;

  const targetRef = doc(services.db, 'usernames', cleanNext);
  const targetSnap = await getDoc(targetRef);
  if (targetSnap.exists() && targetSnap.data()?.uid !== params.user.uid) {
    throw new Error(`@${cleanNext} is already taken. Choose a different username.`);
  }

  const privacy = sanitizeFriendPrivacy(params.preferences.friendPrivacy ?? DEFAULT_FRIEND_PRIVACY);
  const payload = buildFriendProfilePayload({
    ...params,
    username: cleanNext,
  });
  const displayName = payload.displayName as string;

  let canDeletePrevious = false;
  if (
    params.previousUsername &&
    params.previousUsername !== cleanNext &&
    isValidUsername(params.previousUsername)
  ) {
    const prevSnap = await getDoc(doc(services.db, 'usernames', params.previousUsername));
    canDeletePrevious = prevSnap.exists() && prevSnap.data()?.uid === params.user.uid;
  }

  const batch = writeBatch(services.db);
  if (canDeletePrevious && params.previousUsername) {
    batch.delete(doc(services.db, 'usernames', params.previousUsername));
  }
  if (!targetSnap.exists()) {
    batch.set(targetRef, {
      username: cleanNext,
      uid: params.user.uid,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.update(targetRef, {
      updatedAt: serverTimestamp(),
    });
  }
  batch.set(doc(services.db, 'friendProfiles', params.user.uid), payload);

  const directoryRef = doc(services.db, 'readerDirectory', params.user.uid);
  if (privacy.discoverable) {
    batch.set(
      directoryRef,
      buildReaderDirectoryPayload({
        user: params.user,
        username: cleanNext,
        privacy,
      })
    );
  } else {
    batch.delete(directoryRef);
  }

  await batch.commit();

  return {
    uid: params.user.uid,
    displayName,
    photoURL: payload.photoURL as string | null,
    username: cleanNext,
    discoverable: privacy.discoverable,
    sharingEnabled: payload.sharingEnabled as boolean,
    privacy: payload.privacy as FriendPrivacySettings,
    stats: payload.stats as FriendStatsSnapshot,
    updatedAt: new Date().toISOString(),
  };
}

export async function searchReaderDirectory(
  rawQuery: string,
  options: { myUid: string; blockedUids?: Iterable<string> }
): Promise<ReaderDirectoryEntry[]> {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Cloud sync is required to search for friends.');
  }

  const { isHandleOnly, cleanQuery, tokens } = normalizeReaderSearchQuery(rawQuery);
  if (!cleanQuery) return [];

  const dirCol = collection(services.db, 'readerDirectory');
  const firstToken = tokens[0] ?? cleanQuery;
  const queriesToRun: Query<DocumentData>[] = [];

  if (firstToken.length >= 2) {
    queriesToRun.push(
      query(dirCol, where('searchPrefixes', 'array-contains', firstToken), limit(20))
    );
  } else if (!isHandleOnly && firstToken.length === 1) {
    queriesToRun.push(
      query(
        dirCol,
        where('displayNameLower', '>=', firstToken),
        where('displayNameLower', '<=', `${firstToken}\uf8ff`),
        limit(15)
      )
    );
  }

  if (firstToken.length >= 1) {
    queriesToRun.push(
      query(
        dirCol,
        where('username', '>=', firstToken),
        where('username', '<=', `${firstToken}\uf8ff`),
        limit(15)
      )
    );
  }

  if (queriesToRun.length === 0) return [];

  const snapshots = await Promise.all(queriesToRun.map((q) => getDocs(q)));
  const blockedSet = new Set(options.blockedUids ?? []);
  const byUid = new Map<string, ReaderDirectoryEntry>();

  for (const snap of snapshots) {
    snap.forEach((docSnap) => {
      const entry = docToReaderDirectoryEntry(docSnap.id, docSnap.data());
      if (!entry) return;
      if (entry.uid === options.myUid || blockedSet.has(entry.uid)) return;
      if (!byUid.has(entry.uid)) {
        byUid.set(entry.uid, entry);
      }
    });
  }

  return [...byUid.values()]
    .filter((entry) => matchesDirectoryQuery(entry, rawQuery))
    .sort((a, b) => {
      const rankDiff = rankDirectoryMatch(a, rawQuery) - rankDirectoryMatch(b, rawQuery);
      if (rankDiff !== 0) return rankDiff;
      return a.displayName.localeCompare(b.displayName);
    });
}

export async function fetchSuggestedReaders(options: {
  myUid: string;
  excludeUids?: Iterable<string>;
  maxResults?: number;
}): Promise<ReaderDirectoryEntry[]> {
  const services = getFirebaseServices();
  if (!services) return [];

  const maxResults = Math.max(1, Math.min(20, options.maxResults ?? 8));
  const excludeSet = new Set(options.excludeUids ?? []);
  excludeSet.add(options.myUid);

  const snap = await getDocs(
    query(collection(services.db, 'readerDirectory'), orderBy('updatedAt', 'desc'), limit(20))
  );

  const results: ReaderDirectoryEntry[] = [];
  snap.forEach((docSnap) => {
    const entry = docToReaderDirectoryEntry(docSnap.id, docSnap.data());
    if (!entry || excludeSet.has(entry.uid)) return;
    results.push(entry);
  });

  return results.slice(0, maxResults);
}

export async function fetchBlockedUids(myUid: string): Promise<string[]> {
  const services = getFirebaseServices();
  if (!services || !myUid) return [];

  const snap = await getDocs(collection(services.db, 'users', myUid, 'blockedUsers'));
  const uids: string[] = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const uid = typeof data.blockedUid === 'string' && data.blockedUid ? data.blockedUid : docSnap.id;
    if (uid) uids.push(uid);
  });
  return uids;
}

export async function sendFriendRequest(params: {
  currentUser: AccountUser;
  ownUsername?: string | null;
  target: FriendRequestTarget;
  ownPrivacy?: FriendPrivacySettings;
}): Promise<{ outcome: 'sent' | 'accepted' }> {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Cloud sync is required to send friend requests.');
  }

  if (params.target.uid === params.currentUser.uid) {
    throw new Error('You cannot send a friend request to yourself.');
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
      await acceptFriendRequest({
        currentUser: params.currentUser,
        ownUsername: params.ownUsername,
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
      requesterUsername: isValidUsername(params.ownUsername) ? params.ownUsername : null,
      requesterPhotoURL,
      recipientName: params.target.displayName.trim().slice(0, 100) || 'Selah Reader',
      recipientUsername: isValidUsername(params.target.username) ? params.target.username : null,
      recipientPhotoURL: sanitizeHttpsPhotoUrl(params.target.photoURL),
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
  ownUsername?: string | null;
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
    recipientUsername: isValidUsername(params.ownUsername) ? params.ownUsername : null,
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
    { includeMetadataChanges: true },
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
