import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import type { AccountUser } from '../lib/auth';
import { resolveAccountDisplayName, timestampToIso } from './firestoreUtils';
import {
  decodeCustomPlanSections,
  encodeCustomPlanSections,
  extractSectionsFromPlan,
  sanitizePlanAccentColor,
} from '../lib/customPlans';
import {
  computeCohortMemberProgress,
  createCohortId,
  ENCOURAGEMENT_COOLDOWN_MS,
  formatCooldownRemaining,
  getEncouragementCooldownRemainingMs,
  isValidEncouragementPresetId,
  materializeSharedCohortPlan,
} from '../lib/fellowship';
import { getFirebaseServices } from '../lib/firebase';
import {
  computeLastReadDate as computeSummaryLastReadDate,
  sanitizeFriendPrivacy,
  sanitizeHttpsPhotoUrl,
} from '../lib/friends';
import type {
  BibleProgressSummary,
  EncouragementPresetId,
  FriendPrivacySettings,
  QuietEncouragement,
  ReadingPlan,
  SharedPlanCohort,
  SharedPlanMember,
  SharedPlanType,
} from '../types/bible';

const COHORT_ID_REGEX = /^[a-z0-9-]{4,40}$/;
const PLAIN_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_COHORT_PARTICIPANTS = 12;

function resolveMemberPhotoUrl(user: AccountUser, privacy?: FriendPrivacySettings): string | null {
  const safePrivacy = sanitizeFriendPrivacy(privacy);
  return safePrivacy.sharingEnabled && safePrivacy.showPhoto
    ? sanitizeHttpsPhotoUrl(user.photoURL)
    : null;
}

function computeTotalChaptersInPlan(plan: ReadingPlan): number {
  const seen = new Set<string>();
  for (const day of plan.days) {
    for (const assignment of day.assignments) {
      for (const ch of assignment.chapters) {
        seen.add(`${assignment.bookId}:${ch}`);
      }
    }
  }
  return Math.max(1, Math.min(1189, seen.size));
}

function computeLastReadDate(summary: BibleProgressSummary): string | null {
  const latest = computeSummaryLastReadDate(summary);
  return latest && PLAIN_DATE_REGEX.test(latest) ? latest : null;
}

export function docToSharedPlanCohort(docId: string, data: DocumentData): SharedPlanCohort | null {
  const id = typeof data.id === 'string' && data.id ? data.id : docId;
  if (!COHORT_ID_REGEX.test(id)) return null;
  if (typeof data.hostUid !== 'string' || !data.hostUid) return null;
  const planType: SharedPlanType = data.planType === 'builtin' ? 'builtin' : 'custom';
  const sourcePlanId =
    typeof data.sourcePlanId === 'string' ? data.sourcePlanId.trim().slice(0, 64) : '';
  if (!sourcePlanId) return null;

  const title = typeof data.title === 'string' ? data.title.trim().slice(0, 80) : '';
  if (!title) return null;

  const participantUids = Array.isArray(data.participantUids)
    ? data.participantUids.filter((u): u is string => typeof u === 'string' && u.length > 0)
    : [];
  if (participantUids.length === 0) return null;

  const durationDays =
    typeof data.durationDays === 'number' && Number.isFinite(data.durationDays)
      ? Math.max(1, Math.min(1189, Math.round(data.durationDays)))
      : 1;

  const sectionsSpec = typeof data.sectionsSpec === 'string' ? data.sectionsSpec : '';
  const sections = sectionsSpec ? decodeCustomPlanSections(sectionsSpec) : [];

  return {
    id,
    hostUid: data.hostUid,
    hostName: typeof data.hostName === 'string' && data.hostName ? data.hostName : 'Selah Reader',
    planType,
    sourcePlanId,
    title,
    description: typeof data.description === 'string' ? data.description.slice(0, 280) : '',
    sections,
    durationDays,
    accentColor: sanitizePlanAccentColor(data.accentColor),
    participantUids,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
  };
}

export function docToSharedPlanMember(
  cohortId: string,
  docId: string,
  data: DocumentData
): SharedPlanMember | null {
  const uid = typeof data.uid === 'string' && data.uid ? data.uid : docId;
  if (!uid) return null;

  const totalDays =
    typeof data.totalDays === 'number' && Number.isFinite(data.totalDays)
      ? Math.max(1, Math.min(1189, Math.round(data.totalDays)))
      : 1;
  const totalChapters =
    typeof data.totalChapters === 'number' && Number.isFinite(data.totalChapters)
      ? Math.max(1, Math.min(1189, Math.round(data.totalChapters)))
      : 1;
  const completedDays =
    typeof data.completedDays === 'number' && Number.isFinite(data.completedDays)
      ? Math.max(0, Math.min(totalDays, Math.round(data.completedDays)))
      : 0;
  const readChapters =
    typeof data.readChapters === 'number' && Number.isFinite(data.readChapters)
      ? Math.max(0, Math.min(totalChapters, Math.round(data.readChapters)))
      : 0;

  return {
    uid,
    cohortId: typeof data.cohortId === 'string' && data.cohortId ? data.cohortId : cohortId,
    displayName:
      typeof data.displayName === 'string' && data.displayName ? data.displayName : 'Selah Reader',
    photoURL: sanitizeHttpsPhotoUrl(data.photoURL),
    status: data.status === 'joined' ? 'joined' : 'invited',
    completedDays,
    totalDays,
    readChapters,
    totalChapters,
    lastReadDate:
      typeof data.lastReadDate === 'string' && PLAIN_DATE_REGEX.test(data.lastReadDate)
        ? data.lastReadDate
        : null,
    joinedAt: data.joinedAt ? timestampToIso(data.joinedAt) : null,
    updatedAt: timestampToIso(data.updatedAt),
  };
}

export function docToQuietEncouragement(
  recipientUid: string,
  docId: string,
  data: DocumentData
): QuietEncouragement | null {
  const senderUid = typeof data.senderUid === 'string' && data.senderUid ? data.senderUid : docId;
  if (!senderUid || senderUid === recipientUid) return null;
  if (!isValidEncouragementPresetId(data.presetId)) return null;

  const sentCount =
    typeof data.sentCount === 'number' && Number.isFinite(data.sentCount)
      ? Math.max(1, Math.min(100000, Math.round(data.sentCount)))
      : 1;

  const cohortTitle =
    typeof data.cohortTitle === 'string' && data.cohortTitle.trim()
      ? data.cohortTitle.trim().slice(0, 80)
      : null;

  return {
    senderUid,
    recipientUid,
    senderName:
      typeof data.senderName === 'string' && data.senderName ? data.senderName : 'Selah Reader',
    senderPhotoURL: sanitizeHttpsPhotoUrl(data.senderPhotoURL),
    presetId: data.presetId,
    cohortTitle,
    sentCount,
    sentAt: timestampToIso(data.sentAt),
    acknowledgedAt: data.acknowledgedAt ? timestampToIso(data.acknowledgedAt) : null,
  };
}

async function allocateAvailableCohortId(
  db: NonNullable<ReturnType<typeof getFirebaseServices>>['db']
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = createCohortId();
    const existing = await getDoc(doc(db, 'sharedPlans', candidate));
    if (!existing.exists()) {
      return candidate;
    }
  }
  throw new Error('Could not create a reading cohort ID right now. Please try again.');
}

export async function createSharedPlanCohort(params: {
  hostUser: AccountUser;
  ownPrivacy?: FriendPrivacySettings;
  plan: ReadingPlan;
  summary: BibleProgressSummary;
  inviteFriends: Array<{ uid: string; displayName: string; photoURL: string | null }>;
}): Promise<SharedPlanCohort> {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Cloud sync is required to share reading plans with friends.');
  }

  const cohortId = await allocateAvailableCohortId(services.db);
  const hostName = resolveAccountDisplayName(params.hostUser);
  const planType: SharedPlanType = params.plan.isCustom ? 'custom' : 'builtin';
  const sections = planType === 'custom' ? extractSectionsFromPlan(params.plan) : [];
  const sectionsSpec = planType === 'custom' ? encodeCustomPlanSections(sections).slice(0, 2000) : '';
  if (planType === 'custom' && !sectionsSpec) {
    throw new Error('Add at least one book section before sharing this custom plan.');
  }

  const durationDays = Math.max(1, Math.min(1189, Math.round(params.plan.durationDays)));
  const totalChapters = computeTotalChaptersInPlan(params.plan);
  const accentColor = sanitizePlanAccentColor(params.plan.accentColor);
  const title = params.plan.title.trim().slice(0, 80) || 'Reading Plan';
  const description = params.plan.description.trim().slice(0, 280);
  const sourcePlanId = params.plan.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'custom-plan';

  const uniqueInvitees: Array<{ uid: string; displayName: string; photoURL: string | null }> = [];
  const seenUids = new Set<string>([params.hostUser.uid]);
  for (const friend of params.inviteFriends) {
    if (!friend.uid || seenUids.has(friend.uid)) continue;
    seenUids.add(friend.uid);
    uniqueInvitees.push(friend);
    if (uniqueInvitees.length >= MAX_COHORT_PARTICIPANTS - 1) break;
  }

  const participantUids = [params.hostUser.uid, ...uniqueInvitees.map((f) => f.uid)];
  const nowIso = new Date().toISOString();

  const cohortDoc: SharedPlanCohort = {
    id: cohortId,
    hostUid: params.hostUser.uid,
    hostName,
    planType,
    sourcePlanId,
    title,
    description,
    sections,
    durationDays,
    accentColor,
    participantUids,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // Commit parent cohort first so member creation rules can read committed cohort state
  await setDoc(doc(services.db, 'sharedPlans', cohortId), {
    id: cohortId,
    hostUid: params.hostUser.uid,
    hostName,
    planType,
    sourcePlanId,
    title,
    description,
    sectionsSpec,
    durationDays,
    accentColor,
    participantUids,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const hostProgress = computeCohortMemberProgress(cohortDoc, params.summary);
  const hostLastReadDate = computeLastReadDate(params.summary);

  await setDoc(doc(services.db, 'sharedPlans', cohortId, 'members', params.hostUser.uid), {
    uid: params.hostUser.uid,
    cohortId,
    displayName: hostName,
    photoURL: resolveMemberPhotoUrl(params.hostUser, params.ownPrivacy),
    status: 'joined',
    completedDays: hostProgress.completedDays,
    totalDays: hostProgress.totalDays,
    readChapters: hostProgress.readChapters,
    totalChapters: hostProgress.totalChapters,
    lastReadDate: hostLastReadDate,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Chunk invitee writes (max 5 per batch) to stay comfortably under Firestore's 20 rule-lookup limit per batch
  const INVITE_BATCH_CHUNK = 5;
  for (let i = 0; i < uniqueInvitees.length; i += INVITE_BATCH_CHUNK) {
    const chunk = uniqueInvitees.slice(i, i + INVITE_BATCH_CHUNK);
    const batch = writeBatch(services.db);
    for (const friend of chunk) {
      batch.set(doc(services.db, 'sharedPlans', cohortId, 'members', friend.uid), {
        uid: friend.uid,
        cohortId,
        displayName: friend.displayName.trim().slice(0, 100) || 'Selah Reader',
        photoURL: sanitizeHttpsPhotoUrl(friend.photoURL),
        status: 'invited',
        completedDays: 0,
        totalDays: durationDays,
        readChapters: 0,
        totalChapters,
        lastReadDate: null,
        joinedAt: null,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  return cohortDoc;
}

export async function inviteFriendToCohort(params: {
  cohort: SharedPlanCohort;
  friend: { uid: string; displayName: string; photoURL: string | null };
}): Promise<void> {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Cloud sync is required to invite friends.');
  }
  if (params.cohort.participantUids.includes(params.friend.uid)) {
    return;
  }
  if (params.cohort.participantUids.length >= MAX_COHORT_PARTICIPANTS) {
    throw new Error('A reading group can include up to 12 readers.');
  }

  const nextParticipants = [...params.cohort.participantUids, params.friend.uid];
  await updateDoc(doc(services.db, 'sharedPlans', params.cohort.id), {
    participantUids: nextParticipants,
    updatedAt: serverTimestamp(),
  });

  const totalChapters = computeTotalChaptersInPlan(materializeSharedCohortPlan(params.cohort));

  await setDoc(doc(services.db, 'sharedPlans', params.cohort.id, 'members', params.friend.uid), {
    uid: params.friend.uid,
    cohortId: params.cohort.id,
    displayName: params.friend.displayName.trim().slice(0, 100) || 'Selah Reader',
    photoURL: sanitizeHttpsPhotoUrl(params.friend.photoURL),
    status: 'invited',
    completedDays: 0,
    totalDays: Math.max(1, Math.min(1189, params.cohort.durationDays)),
    readChapters: 0,
    totalChapters,
    lastReadDate: null,
    joinedAt: null,
    updatedAt: serverTimestamp(),
  });
}

export async function joinSharedPlanCohort(params: {
  cohort: SharedPlanCohort;
  user: AccountUser;
  ownPrivacy?: FriendPrivacySettings;
  summary: BibleProgressSummary;
  existingMember: SharedPlanMember | null;
}): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return;

  const progress = computeCohortMemberProgress(params.cohort, params.summary);
  const lastReadDate = computeLastReadDate(params.summary);
  const memberRef = doc(services.db, 'sharedPlans', params.cohort.id, 'members', params.user.uid);
  const displayName = resolveAccountDisplayName(params.user);
  const photoURL = resolveMemberPhotoUrl(params.user, params.ownPrivacy);

  if (params.existingMember) {
    await updateDoc(memberRef, {
      displayName,
      photoURL,
      status: 'joined',
      completedDays: progress.completedDays,
      totalDays: progress.totalDays,
      readChapters: progress.readChapters,
      totalChapters: progress.totalChapters,
      lastReadDate,
      ...(params.existingMember.joinedAt ? {} : { joinedAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(memberRef, {
      uid: params.user.uid,
      cohortId: params.cohort.id,
      displayName,
      photoURL,
      status: 'joined',
      completedDays: progress.completedDays,
      totalDays: progress.totalDays,
      readChapters: progress.readChapters,
      totalChapters: progress.totalChapters,
      lastReadDate,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function publishSharedPlanMemberProgress(params: {
  cohort: SharedPlanCohort;
  user: AccountUser;
  ownPrivacy?: FriendPrivacySettings;
  summary: BibleProgressSummary;
}): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return;

  const progress = computeCohortMemberProgress(params.cohort, params.summary);
  const lastReadDate = computeLastReadDate(params.summary);
  await updateDoc(doc(services.db, 'sharedPlans', params.cohort.id, 'members', params.user.uid), {
    displayName: resolveAccountDisplayName(params.user),
    photoURL: resolveMemberPhotoUrl(params.user, params.ownPrivacy),
    status: 'joined',
    completedDays: progress.completedDays,
    totalDays: progress.totalDays,
    readChapters: progress.readChapters,
    totalChapters: progress.totalChapters,
    lastReadDate,
    updatedAt: serverTimestamp(),
  });
}

export async function leaveOrDeclineSharedCohort(params: {
  cohort: SharedPlanCohort;
  myUid: string;
}): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return;

  await deleteDoc(doc(services.db, 'sharedPlans', params.cohort.id, 'members', params.myUid));
  const nextParticipants = params.cohort.participantUids.filter((id) => id !== params.myUid);
  if (nextParticipants.length > 0) {
    await updateDoc(doc(services.db, 'sharedPlans', params.cohort.id), {
      participantUids: nextParticipants,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function deleteSharedPlanCohort(cohortId: string): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return;

  const membersSnap = await getDocs(collection(services.db, 'sharedPlans', cohortId, 'members'));
  if (!membersSnap.empty) {
    const batch = writeBatch(services.db);
    membersSnap.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
  }
  await deleteDoc(doc(services.db, 'sharedPlans', cohortId));
}

export function subscribeSharedPlans(
  uid: string,
  handlers: {
    onCohorts: (cohorts: SharedPlanCohort[], fromCache: boolean) => void;
    onError: (err: Error) => void;
  }
): () => void {
  const services = getFirebaseServices();
  if (!services) return () => {};

  const cohortsQuery = query(
    collection(services.db, 'sharedPlans'),
    where('participantUids', 'array-contains', uid)
  );

  return onSnapshot(
    cohortsQuery,
    { includeMetadataChanges: true },
    (snap) => {
      const next: SharedPlanCohort[] = [];
      snap.forEach((docSnap) => {
        const parsed = docToSharedPlanCohort(docSnap.id, docSnap.data());
        if (parsed) next.push(parsed);
      });
      next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      handlers.onCohorts(next, snap.metadata.fromCache);
    },
    (err) => handlers.onError(err)
  );
}

export function subscribeSharedPlanMembers(
  cohortId: string,
  onMembers: (members: SharedPlanMember[]) => void,
  onError?: (err: Error) => void
): () => void {
  const services = getFirebaseServices();
  if (!services) return () => {};

  return onSnapshot(
    collection(services.db, 'sharedPlans', cohortId, 'members'),
    (snap) => {
      const next: SharedPlanMember[] = [];
      snap.forEach((docSnap) => {
        const parsed = docToSharedPlanMember(cohortId, docSnap.id, docSnap.data());
        if (parsed) next.push(parsed);
      });
      next.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'joined' ? -1 : 1;
        if (b.completedDays !== a.completedDays) return b.completedDays - a.completedDays;
        return a.displayName.localeCompare(b.displayName);
      });
      onMembers(next);
    },
    (err) => {
      onError?.(err);
    }
  );
}

export async function fetchSentEncouragementSentAt(
  recipientUid: string,
  senderUid: string
): Promise<string | null> {
  const services = getFirebaseServices();
  if (!services) return null;

  const snap = await getDoc(
    doc(services.db, 'friendProfiles', recipientUid, 'encouragements', senderUid)
  );
  if (!snap.exists()) return null;
  const parsed = docToQuietEncouragement(recipientUid, snap.id, snap.data());
  return parsed?.sentAt ?? null;
}

export async function sendQuietEncouragement(params: {
  senderUser: AccountUser;
  ownPrivacy?: FriendPrivacySettings;
  recipientUid: string;
  presetId: EncouragementPresetId;
  cohortTitle?: string | null;
}): Promise<{ sentAt: string }> {
  const services = getFirebaseServices();
  if (!services) {
    throw new Error('Cloud sync is required to send an encouragement note.');
  }

  const ref = doc(
    services.db,
    'friendProfiles',
    params.recipientUid,
    'encouragements',
    params.senderUser.uid
  );
  const existing = await getDoc(ref);
  const senderName = resolveAccountDisplayName(params.senderUser);
  const senderPhotoURL = resolveMemberPhotoUrl(params.senderUser, params.ownPrivacy);
  const normalizedCohortTitle =
    typeof params.cohortTitle === 'string' && params.cohortTitle.trim()
      ? params.cohortTitle.trim().slice(0, 80)
      : null;

  if (!existing.exists()) {
    try {
      await setDoc(ref, {
        senderUid: params.senderUser.uid,
        recipientUid: params.recipientUid,
        senderName,
        senderPhotoURL,
        presetId: params.presetId,
        cohortTitle: normalizedCohortTitle,
        sentCount: 1,
        sentAt: serverTimestamp(),
        acknowledgedAt: null,
      });
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'permission-denied') {
        throw new Error('Unable to send a quiet note to this friend right now.');
      }
      throw err;
    }
    return { sentAt: new Date().toISOString() };
  }

  const prev = docToQuietEncouragement(params.recipientUid, existing.id, existing.data());
  if (prev) {
    const remaining = getEncouragementCooldownRemainingMs(prev.sentAt);
    if (remaining > 0) {
      throw new Error(
        `You already sent a quiet note recently. Try again in ${formatCooldownRemaining(remaining)}.`
      );
    }
  }

  const nextSentCount = Math.min(100000, Math.max(1, prev?.sentCount ?? 1) + 1);
  try {
    await updateDoc(ref, {
      senderName,
      senderPhotoURL,
      presetId: params.presetId,
      cohortTitle: normalizedCohortTitle,
      sentCount: nextSentCount,
      sentAt: serverTimestamp(),
      acknowledgedAt: null,
    });
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';
    if (code === 'permission-denied') {
      const fallbackRemaining = prev
        ? formatCooldownRemaining(Math.max(60000, ENCOURAGEMENT_COOLDOWN_MS - (Date.now() - Date.parse(prev.sentAt))))
        : '12h';
      throw new Error(
        `One quiet encouragement every 12 hours keeps Selah peaceful (${fallbackRemaining} remaining).`
      );
    }
    throw err;
  }

  return { sentAt: new Date().toISOString() };
}

export async function acknowledgeQuietEncouragement(params: {
  recipientUid: string;
  senderUid: string;
}): Promise<void> {
  const services = getFirebaseServices();
  if (!services) return;

  await updateDoc(
    doc(services.db, 'friendProfiles', params.recipientUid, 'encouragements', params.senderUid),
    {
      acknowledgedAt: serverTimestamp(),
    }
  );
}

export function subscribeReceivedEncouragements(
  uid: string,
  onEncouragements: (items: QuietEncouragement[]) => void,
  onError?: (err: Error) => void
): () => void {
  const services = getFirebaseServices();
  if (!services) return () => {};

  return onSnapshot(
    collection(services.db, 'friendProfiles', uid, 'encouragements'),
    (snap) => {
      const next: QuietEncouragement[] = [];
      snap.forEach((docSnap) => {
        const parsed = docToQuietEncouragement(uid, docSnap.id, docSnap.data());
        if (parsed) next.push(parsed);
      });
      next.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
      onEncouragements(next);
    },
    (err) => {
      onError?.(err);
    }
  );
}
