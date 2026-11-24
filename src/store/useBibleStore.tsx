import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BOOKS_BY_ID } from '../data/bibleCanon';
import { CORE_DEFAULT_PLAN_IDS } from '../data/readingPlans';
import {
  loadAuthModule,
  loadCloudSyncModule,
  loadFellowshipSyncModule,
  loadFriendsSyncModule,
} from '../db/cloudLoaders';
import { resolveAccountDisplayName } from '../db/firestoreUtils';
import {
  addReadingLog,
  addReadingLogsBatch,
  buildBackupPayload,
  clearAllSanctuaryData,
  clearFriendCache,
  DEFAULT_PREFERENCES,
  deleteCustomPlan,
  deleteReadingLog,
  getLocalOwnerUid,
  loadFriendCache,
  loadSanctuaryState,
  normalizeUserPreferences,
  parseAndValidateBackup,
  persistPreferences,
  removeChaptersFromBookLogs,
  replaceAllCustomPlans,
  replaceAllLogs,
  saveFriendCache,
  seedDemoSanctuary,
  setLocalOwnerUid,
  updateReadingLog,
  upsertCustomPlan,
  type AddReadingLogInput,
} from '../db/repository';
import { evaluateAchievements, evaluateFellowshipSeals } from '../lib/achievementsEngine';
import type { AccountUser } from '../lib/auth';
import { resolveEffectiveAccountUser, writeLocalAvatarDataUrl } from '../lib/avatar';
import { celebrateAchievementUnlocked, celebrateBookCompleted } from '../lib/celebration';
import {
  computeSectionsChapterCount,
  createCustomPlanId,
  materializeCustomPlan,
  sanitizeCustomPlanSections,
  sanitizePlanAccentColor,
} from '../lib/customPlans';
import { todayPlainDate } from '../lib/dates';
import {
  buildSharedCustomPlanId,
  computeCohortMemberProgress,
  getActiveLocalPlanIdForCohort,
  getEncouragementDisplayText,
  sanitizeFellowshipStats,
} from '../lib/fellowship';
import { isFirebaseConfigured, shouldEagerlyLoadFirebase } from '../lib/firebaseConfig';
import {
  buildFriendProfileStats,
  computeFriendStatsSignature,
  computeLastReadDate,
  getFriendCounterpart,
  sanitizeFriendPrivacy,
  sanitizeHttpsPhotoUrl,
} from '../lib/friends';
import { syncNativeStatusBar, triggerNativeHaptic } from '../lib/nativeShell';
import {
  getAllReadingPlans,
  getReadingPlanById,
  sanitizeShelfPlanIds,
} from '../lib/plans';
import { computeBibleProgress, formatChapterRanges } from '../lib/progress';
import {
  applyColorScheme,
  getResolvedColorScheme,
  getStoredColorScheme,
  subscribeColorSchemeChanges,
} from '../lib/theme';
import type {
  AchievementStatus,
  BibleProgressSummary,
  BlockedFriendRecord,
  ColorSchemePreference,
  CustomPlanDefinition,
  CustomPlanSection,
  FriendConnection,
  FriendProfile,
  FriendRequestTarget,
  FriendshipRecord,
  ReaderDirectoryEntry,
  ReadingLogEntry,
  ReadingPlan,
  EncouragementPresetId,
  QuietEncouragement,
  SharedPlanCohort,
  SharedPlanMember,
  SharedPlanWithMembers,
  UserPreferences,
} from '../types/bible';

export type CloudSyncStatus = 'local' | 'syncing' | 'synced' | 'offline' | 'error';

export interface PendingGuestMerge {
  guestLogs: ReadingLogEntry[];
  guestPreferences: UserPreferences;
  guestCustomPlans: CustomPlanDefinition[];
  cloudLogsCount: number;
}

export interface SaveCustomPlanInput {
  id?: string;
  title: string;
  description?: string;
  sections: CustomPlanSection[];
  durationDays: number;
  accentColor?: string;
}

export interface ReadingDataContextValue {
  ready: boolean;
  logs: ReadingLogEntry[];
  preferences: UserPreferences;
  customPlans: CustomPlanDefinition[];
  customReadingPlans: ReadingPlan[];
  allPlans: ReadingPlan[];
  summary: BibleProgressSummary;
  achievements: AchievementStatus[];
  fellowshipAchievements: AchievementStatus[];
  updatePreferences: (patch: Partial<UserPreferences>) => Promise<void>;
  activateReadingPlan: (planId: string) => Promise<void>;
  removePlanFromShelf: (planId: string) => Promise<void>;
  restoreDefaultShelfPlans: () => Promise<void>;
  saveCustomPlan: (
    input: SaveCustomPlanInput,
    options?: { activate?: boolean }
  ) => Promise<ReadingPlan>;
  removeCustomPlan: (id: string) => Promise<void>;
  logChapters: (input: AddReadingLogInput) => Promise<void>;
  logChaptersBatch: (inputs: AddReadingLogInput[]) => Promise<void>;
  toggleChapter: (
    bookId: string,
    chapter: number,
    options?: { rereadMode?: boolean; readDate?: string }
  ) => Promise<void>;
  markBookComplete: (bookId: string, readDate?: string) => Promise<void>;
  clearBookProgress: (bookId: string) => Promise<void>;
  editLog: (
    id: string,
    patch: Partial<Pick<ReadingLogEntry, 'chapters' | 'readDate' | 'note'>>
  ) => Promise<void>;
  removeLog: (id: string) => Promise<void>;
  exportBackupJson: () => string;
  importBackupJson: (raw: string) => Promise<number>;
  activateDemoJourney: () => Promise<void>;
  resetAllData: () => Promise<void>;
}

export interface AccountSyncContextValue {
  firebaseAvailable: boolean;
  user: AccountUser | null;
  authLoading: boolean;
  syncStatus: CloudSyncStatus;
  syncError: string | null;
  lastSyncedAt: string | null;
  pendingMerge: PendingGuestMerge | null;
  ensureAuthReady: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  updateProfilePhoto: (
    choice:
      | { kind: 'cloud'; photoURL: string | null }
      | { kind: 'local'; dataUrl: string }
  ) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  resolveGuestMerge: (strategy: 'merge' | 'cloud-only') => Promise<void>;
  syncNow: () => Promise<void>;
}

export interface FriendsContextValue {
  ownFriendProfile: FriendProfile | null;
  friends: FriendConnection[];
  incomingRequests: FriendshipRecord[];
  outgoingRequests: FriendshipRecord[];
  blockedUids: string[];
  blockedUsers: BlockedFriendRecord[];
  friendsLoading: boolean;
  friendsError: string | null;
  friendsFromCache: boolean;
  setFriendsDetailActive: (active: boolean) => void;
  ensureFriendProfileReady: () => Promise<void>;
  searchReaders: (query: string) => Promise<ReaderDirectoryEntry[]>;
  loadSuggestedReaders: () => Promise<ReaderDirectoryEntry[]>;
  checkUsernameAvailability: (rawUsername: string) => Promise<{
    available: boolean;
    normalized: string;
    ownedByMe?: boolean;
    error?: string;
  }>;
  updateUsername: (nextUsername: string) => Promise<void>;
  sendFriendRequest: (target: FriendRequestTarget) => Promise<'sent' | 'accepted'>;
  acceptFriendRequest: (pairId: string) => Promise<void>;
  declineFriendRequest: (pairId: string) => Promise<void>;
  cancelFriendRequest: (pairId: string) => Promise<void>;
  removeFriend: (pairId: string) => Promise<void>;
  blockFriend: (targetUid: string, displayName: string, pairId?: string) => Promise<void>;
  unblockFriend: (targetUid: string) => Promise<void>;
  sharedPlans: SharedPlanWithMembers[];
  receivedEncouragements: QuietEncouragement[];
  unreadEncouragementsCount: number;
  sentEncouragementCooldowns: Record<string, string>;
  createSharedPlanCohort: (plan: ReadingPlan, inviteFriendUids: string[]) => Promise<SharedPlanCohort>;
  inviteFriendToSharedCohort: (cohortId: string, friendUid: string) => Promise<void>;
  joinSharedPlanCohort: (cohortId: string) => Promise<void>;
  leaveSharedPlanCohort: (cohortId: string) => Promise<void>;
  deleteSharedPlanCohort: (cohortId: string) => Promise<void>;
  sendQuietEncouragement: (input: {
    recipientUid: string;
    presetId: EncouragementPresetId;
    customMessage?: string | null;
    cohortTitle?: string | null;
  }) => Promise<void>;
  acknowledgeQuietEncouragement: (senderUid: string) => Promise<void>;
  refreshEncouragementCooldown: (recipientUid: string) => Promise<string | null>;
}

export interface UiFeedbackContextValue {
  colorScheme: ColorSchemePreference;
  setColorScheme: (pref: ColorSchemePreference) => void;
  unlockedQueue: AchievementStatus[];
  dismissUnlockedAchievement: (id: string) => void;
  announcement: string;
}

export type BibleStoreValue = ReadingDataContextValue &
  AccountSyncContextValue &
  FriendsContextValue &
  UiFeedbackContextValue;

const ReadingDataContext = createContext<ReadingDataContextValue | null>(null);
const AccountSyncContext = createContext<AccountSyncContextValue | null>(null);
const FriendsContext = createContext<FriendsContextValue | null>(null);
const UiFeedbackContext = createContext<UiFeedbackContextValue | null>(null);

function assembleSharedPlansWithMembers(
  uid: string | undefined,
  cohorts: SharedPlanCohort[],
  membersByCohort: Record<string, SharedPlanMember[]>
): SharedPlanWithMembers[] {
  return cohorts.map((cohort) => {
    const members = membersByCohort[cohort.id] ?? [];
    const myMembership = uid ? members.find((m) => m.uid === uid) ?? null : null;
    return { cohort, members, myMembership };
  });
}

function normalizeLogsSignature(list: ReadingLogEntry[]): string {
  return [...list]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (l) =>
        `${l.id}|${l.bookId}|${l.chapters.join(',')}|${l.readDate}|${l.loggedAt}|${l.note ?? ''}|${l.planId ?? ''}`
    )
    .join('\n');
}

function normalizeCustomPlansSignature(list: CustomPlanDefinition[]): string {
  return [...list]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (p) =>
        `${p.id}|${p.title}|${p.description}|${p.durationDays}|${p.accentColor}|${p.updatedAt}|${p.sections
          .map((s) => `${s.bookId}:${s.startChapter ?? ''}-${s.endChapter ?? ''}`)
          .join(',')}`
    )
    .join('\n');
}

function arePreferencesEqual(a: UserPreferences, b: UserPreferences): boolean {
  const shelfA = a.shelfPlanIds ?? [];
  const shelfB = b.shelfPlanIds ?? [];
  const privA = sanitizeFriendPrivacy(a.friendPrivacy);
  const privB = sanitizeFriendPrivacy(b.friendPrivacy);
  const fStatsA = sanitizeFellowshipStats(a.fellowshipStats);
  const fStatsB = sanitizeFellowshipStats(b.fellowshipStats);
  return (
    a.streakGraceEnabled === b.streakGraceEnabled &&
    a.celebrationsEnabled === b.celebrationsEnabled &&
    a.activePlanId === b.activePlanId &&
    a.seenAchievementIds.length === b.seenAchievementIds.length &&
    a.seenAchievementIds.every((id, idx) => id === b.seenAchievementIds[idx]) &&
    shelfA.length === shelfB.length &&
    shelfA.every((id, idx) => id === shelfB[idx]) &&
    privA.sharingEnabled === privB.sharingEnabled &&
    privA.discoverable === privB.discoverable &&
    privA.showPhoto === privB.showPhoto &&
    privA.showStreak === privB.showStreak &&
    privA.showRecentBook === privB.showRecentBook &&
    privA.showBookProgress === privB.showBookProgress &&
    privA.showSealsCount === privB.showSealsCount &&
    privA.showActivePlan === privB.showActivePlan &&
    fStatsA.friendsPeak === fStatsB.friendsPeak &&
    fStatsA.cohortsPeak === fStatsB.cohortsPeak &&
    fStatsA.encouragementsSent === fStatsB.encouragementsSent
  );
}

function diffLogsForSync(
  prevLogs: ReadingLogEntry[],
  nextLogs: ReadingLogEntry[]
): { upserts: ReadingLogEntry[]; deleteIds: string[] } {
  const prevById = new Map(prevLogs.map((l) => [l.id, l]));
  const nextById = new Map(nextLogs.map((l) => [l.id, l]));

  const deleteIds: string[] = [];
  for (const prev of prevLogs) {
    if (!nextById.has(prev.id)) {
      deleteIds.push(prev.id);
    }
  }

  const upserts: ReadingLogEntry[] = [];
  for (const next of nextLogs) {
    const prev = prevById.get(next.id);
    if (
      !prev ||
      prev.chapters.join(',') !== next.chapters.join(',') ||
      prev.readDate !== next.readDate ||
      prev.note !== next.note
    ) {
      upserts.push(next);
    }
  }

  return { upserts, deleteIds };
}

function formatCloudError(error: unknown): string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Offline — changes are saved locally and will sync when reconnected.';
  }
  return error instanceof Error ? error.message : 'Cloud sync encountered an error.';
}

export const BibleStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseAvailable, setFirebaseAvailable] = useState<boolean>(() =>
    import.meta.env.MODE === 'test' ? false : isFirebaseConfigured()
  );

  const [ready, setReady] = useState(false);
  const [logs, setLogs] = useState<ReadingLogEntry[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences>({ ...DEFAULT_PREFERENCES });
  const [customPlans, setCustomPlans] = useState<CustomPlanDefinition[]>([]);
  const [colorScheme, setColorSchemeState] = useState<ColorSchemePreference>(() =>
    getStoredColorScheme()
  );
  const [unlockedQueue, setUnlockedQueue] = useState<AchievementStatus[]>([]);
  const [announcement, setAnnouncement] = useState('');

  const [user, setUser] = useState<AccountUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(() => shouldEagerlyLoadFirebase());
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>('local');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pendingMerge, setPendingMerge] = useState<PendingGuestMerge | null>(null);

  const [ownFriendProfile, setOwnFriendProfile] = useState<FriendProfile | null>(null);
  const [friendships, setFriendships] = useState<FriendshipRecord[]>([]);
  const [friendProfilesByUid, setFriendProfilesByUid] = useState<Record<string, FriendProfile>>({});
  const [blockedUsers, setBlockedUsers] = useState<BlockedFriendRecord[]>([]);
  const blockedUids = useMemo(() => blockedUsers.map((b) => b.blockedUid), [blockedUsers]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [friendsFromCache, setFriendsFromCache] = useState(false);
  const [sharedCohorts, setSharedCohorts] = useState<SharedPlanCohort[]>([]);
  const [sharedMembersByCohort, setSharedMembersByCohort] = useState<
    Record<string, SharedPlanMember[]>
  >({});
  const [receivedEncouragements, setReceivedEncouragements] = useState<QuietEncouragement[]>([]);
  const [sentEncouragementCooldowns, setSentEncouragementCooldowns] = useState<
    Record<string, string>
  >({});

  const prevUnlockedSetRef = useRef<Set<string> | null>(null);
  const logsRef = useRef<ReadingLogEntry[]>(logs);
  logsRef.current = logs;
  const prefsRef = useRef<UserPreferences>(preferences);
  prefsRef.current = preferences;
  const customPlansRef = useRef<CustomPlanDefinition[]>(customPlans);
  customPlansRef.current = customPlans;
  const colorSchemeRef = useRef<ColorSchemePreference>(colorScheme);
  colorSchemeRef.current = colorScheme;
  const userRef = useRef<AccountUser | null>(user);
  userRef.current = user;
  const ownFriendProfileRef = useRef<FriendProfile | null>(ownFriendProfile);
  ownFriendProfileRef.current = ownFriendProfile;
  const friendshipsRef = useRef<FriendshipRecord[]>(friendships);
  friendshipsRef.current = friendships;
  const friendProfilesRef = useRef<Record<string, FriendProfile>>(friendProfilesByUid);
  friendProfilesRef.current = friendProfilesByUid;
  const blockedUidsRef = useRef<string[]>(blockedUids);
  blockedUidsRef.current = blockedUids;
  const ensuredFriendProfileUidRef = useRef<string | null>(null);
  const lastPublishedFriendSigRef = useRef<string | null>(null);
  const lastPublishedDirectorySigRef = useRef<string | null>(null);
  const friendSyncTimerRef = useRef<number | null>(null);
  const sharedCohortsRef = useRef<SharedPlanCohort[]>(sharedCohorts);
  sharedCohortsRef.current = sharedCohorts;
  const sharedMembersByCohortRef = useRef<Record<string, SharedPlanMember[]>>(sharedMembersByCohort);
  sharedMembersByCohortRef.current = sharedMembersByCohort;
  const receivedEncouragementsRef = useRef<QuietEncouragement[]>(receivedEncouragements);
  receivedEncouragementsRef.current = receivedEncouragements;
  const sentCooldownsRef = useRef<Record<string, string>>(sentEncouragementCooldowns);
  sentCooldownsRef.current = sentEncouragementCooldowns;

  const authSessionTokenRef = useRef(0);
  const isMountedRef = useRef(true);
  const authUnsubRef = useRef<(() => void) | null>(null);
  const authInitPromiseRef = useRef<Promise<void> | null>(null);
  const cloudUnsubRef = useRef<(() => void) | null>(null);
  const friendshipsUnsubRef = useRef<(() => void) | null>(null);
  const friendProfileUnsubsRef = useRef<Map<string, () => void>>(new Map());
  const friendsDetailActiveRef = useRef(true);
  const friendCacheTimerRef = useRef<number | null>(null);
  const sharedPlansUnsubRef = useRef<(() => void) | null>(null);
  const sharedMemberUnsubsRef = useRef<Map<string, () => void>>(new Map());
  const encouragementsUnsubRef = useRef<(() => void) | null>(null);
  const friendshipsSnapshotReceivedRef = useRef(false);
  const sharedPlansSnapshotReceivedRef = useRef(false);
  const encouragementsSnapshotReceivedRef = useRef(false);
  const friendshipsListenerErroredRef = useRef(false);
  const cloudListenerErroredRef = useRef(false);
  const attachCloudListenersRef = useRef<((uid: string, sessionToken: number) => void) | null>(null);
  const attachFriendListenersRef = useRef<((uid: string, sessionToken: number) => void) | null>(null);
  const cohortProgressTimerRef = useRef<number | null>(null);
  const lastPublishedCohortProgressSigRef = useRef<string | null>(null);
  const pendingWritesRef = useRef(0);
  const pendingPrefsWritesRef = useRef(0);
  const pendingLogWritesRef = useRef(0);
  const pendingCustomPlanWritesRef = useRef(0);
  const initialLocalLoadPromiseRef = useRef<Promise<void> | null>(null);
  const summaryRef = useRef<BibleProgressSummary | null>(null);
  const achievementsRef = useRef<AchievementStatus[]>([]);
  const allPlansRef = useRef<ReadingPlan[]>([]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const hydrateSilently = useCallback(
    (
      nextLogs: ReadingLogEntry[],
      nextPrefs: UserPreferences,
      nextCustomPlans?: CustomPlanDefinition[]
    ) => {
      const nextSummary = computeBibleProgress(nextLogs, {
        streakGraceEnabled: nextPrefs.streakGraceEnabled,
      });
      const nextAchievements = evaluateAchievements(nextLogs, nextSummary);
      prevUnlockedSetRef.current = new Set(
        nextAchievements.filter((a) => a.unlocked).map((a) => a.definition.id)
      );
      logsRef.current = nextLogs;
      prefsRef.current = nextPrefs;
      setLogs(nextLogs);
      setPreferences(nextPrefs);
      if (nextCustomPlans !== undefined) {
        customPlansRef.current = nextCustomPlans;
        setCustomPlans(nextCustomPlans);
      }
      setUnlockedQueue([]);
    },
    []
  );

  const runCloudWrite = useCallback(
    (op: () => Promise<void>, channel: 'preferences' | 'logs' | 'customPlans' | 'all' = 'all') => {
      if (!userRef.current) return;
      pendingWritesRef.current += 1;
      if (channel === 'preferences' || channel === 'all') pendingPrefsWritesRef.current += 1;
      if (channel === 'logs' || channel === 'all') pendingLogWritesRef.current += 1;
      if (channel === 'customPlans' || channel === 'all') pendingCustomPlanWritesRef.current += 1;

      const releasePending = () => {
        pendingWritesRef.current = Math.max(0, pendingWritesRef.current - 1);
        if (channel === 'preferences' || channel === 'all') {
          pendingPrefsWritesRef.current = Math.max(0, pendingPrefsWritesRef.current - 1);
        }
        if (channel === 'logs' || channel === 'all') {
          pendingLogWritesRef.current = Math.max(0, pendingLogWritesRef.current - 1);
        }
        if (channel === 'customPlans' || channel === 'all') {
          pendingCustomPlanWritesRef.current = Math.max(0, pendingCustomPlanWritesRef.current - 1);
        }
      };

      setSyncStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'syncing');
      setSyncError(null);

      void op()
        .then(() => {
          releasePending();
          if (pendingWritesRef.current === 0 && userRef.current) {
            setSyncStatus('synced');
            setLastSyncedAt(new Date().toISOString());
          }
        })
        .catch((err) => {
          releasePending();
          if (!userRef.current) return;
          const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
          setSyncStatus(offline ? 'offline' : 'error');
          setSyncError(formatCloudError(err));
        });
    },
    []
  );

  useEffect(() => {
    void syncNativeStatusBar(getResolvedColorScheme(colorScheme));
  }, [colorScheme]);

  useEffect(() => {
    const unsubscribe = subscribeColorSchemeChanges((next) => {
      setColorSchemeState(next);
      void syncNativeStatusBar(getResolvedColorScheme(next));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => {
      const activeUser = userRef.current;
      if (activeUser && pendingWritesRef.current === 0) {
        setSyncStatus('synced');
        setSyncError(null);
      }
      if (activeUser) {
        if (cloudListenerErroredRef.current) {
          attachCloudListenersRef.current?.(activeUser.uid, authSessionTokenRef.current);
        }
        if (friendshipsListenerErroredRef.current) {
          attachFriendListenersRef.current?.(activeUser.uid, authSessionTokenRef.current);
        }
      }
    };
    const handleOffline = () => {
      if (userRef.current) {
        setSyncStatus('offline');
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadPromise = loadSanctuaryState().then(
      ({ logs: loadedLogs, preferences: loadedPrefs, customPlans: loadedCustomPlans }) => {
        if (!active) return;
        const initialSummary = computeBibleProgress(loadedLogs, {
          streakGraceEnabled: loadedPrefs.streakGraceEnabled,
        });
        const initialAchievements = evaluateAchievements(loadedLogs, initialSummary);
        const alreadyUnlocked = new Set(
          initialAchievements.filter((a) => a.unlocked).map((a) => a.definition.id)
        );
        prevUnlockedSetRef.current = alreadyUnlocked;
        logsRef.current = loadedLogs;
        prefsRef.current = loadedPrefs;
        customPlansRef.current = loadedCustomPlans;
        setLogs(loadedLogs);
        setPreferences(loadedPrefs);
        setCustomPlans(loadedCustomPlans);
        setReady(true);
      }
    );
    initialLocalLoadPromiseRef.current = loadPromise;
    return () => {
      active = false;
    };
  }, []);

  const clearFriendProfileSubscriptions = useCallback(() => {
    for (const unsub of friendProfileUnsubsRef.current.values()) {
      unsub();
    }
    friendProfileUnsubsRef.current.clear();
  }, []);

  const clearSharedMemberSubscriptions = useCallback(() => {
    for (const unsub of sharedMemberUnsubsRef.current.values()) {
      unsub();
    }
    sharedMemberUnsubsRef.current.clear();
  }, []);

  const detachFriendListeners = useCallback(() => {
    friendshipsUnsubRef.current?.();
    friendshipsUnsubRef.current = null;
    sharedPlansUnsubRef.current?.();
    sharedPlansUnsubRef.current = null;
    encouragementsUnsubRef.current?.();
    encouragementsUnsubRef.current = null;
    clearFriendProfileSubscriptions();
    clearSharedMemberSubscriptions();
    lastPublishedCohortProgressSigRef.current = null;
    if (friendSyncTimerRef.current !== null) {
      window.clearTimeout(friendSyncTimerRef.current);
      friendSyncTimerRef.current = null;
    }
    if (cohortProgressTimerRef.current !== null) {
      window.clearTimeout(cohortProgressTimerRef.current);
      cohortProgressTimerRef.current = null;
    }
    if (friendCacheTimerRef.current !== null) {
      window.clearTimeout(friendCacheTimerRef.current);
      friendCacheTimerRef.current = null;
    }
  }, [clearFriendProfileSubscriptions, clearSharedMemberSubscriptions]);

  const persistCurrentFriendCache = useCallback(
    (
      uid: string,
      nextOwn: FriendProfile | null,
      nextShips: FriendshipRecord[],
      nextProfiles: Record<string, FriendProfile>,
      overrides?: {
        sharedPlans?: SharedPlanWithMembers[];
        encouragements?: QuietEncouragement[];
        sentCooldowns?: Record<string, string>;
      }
    ) => {
      const nextSharedPlans =
        overrides?.sharedPlans ??
        assembleSharedPlansWithMembers(
          uid,
          sharedCohortsRef.current,
          sharedMembersByCohortRef.current
        );
      const nextEncouragements = overrides?.encouragements ?? receivedEncouragementsRef.current;
      const nextSentCooldowns = overrides?.sentCooldowns ?? sentCooldownsRef.current;

      if (friendCacheTimerRef.current !== null) {
        window.clearTimeout(friendCacheTimerRef.current);
      }
      friendCacheTimerRef.current = window.setTimeout(() => {
        friendCacheTimerRef.current = null;
        if (userRef.current?.uid !== uid) return;
        void saveFriendCache({
          ownerUid: uid,
          ownProfile: nextOwn,
          friendships: nextShips,
          profilesByUid: nextProfiles,
          sharedPlans: nextSharedPlans,
          encouragements: nextEncouragements,
          sentCooldowns: nextSentCooldowns,
          updatedAt: new Date().toISOString(),
        });
      }, 500);
    },
    []
  );

  const syncFriendProfileSubscriptions = useCallback(
    (uid: string, records: FriendshipRecord[], sessionToken: number) => {
      const acceptedFriendUids = new Set<string>();
      for (const rec of records) {
        if (rec.status !== 'accepted') continue;
        const counterpart = getFriendCounterpart(rec, uid);
        if (counterpart.uid) {
          acceptedFriendUids.add(counterpart.uid);
        }
      }

      // Unsubscribe friends no longer accepted
      for (const [fUid, unsub] of friendProfileUnsubsRef.current.entries()) {
        if (!acceptedFriendUids.has(fUid)) {
          unsub();
          friendProfileUnsubsRef.current.delete(fUid);
        }
      }

      // Prune cached profiles for removed friends
      setFriendProfilesByUid((prev) => {
        let changed = false;
        const next: Record<string, FriendProfile> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (acceptedFriendUids.has(k)) {
            next[k] = v;
          } else {
            changed = true;
          }
        }
        if (changed) {
          friendProfilesRef.current = next;
          persistCurrentFriendCache(uid, ownFriendProfileRef.current, records, next);
          return next;
        }
        return prev;
      });

      // Pause per-friend live listeners while on views that do not show live friend stats
      if (!friendsDetailActiveRef.current) {
        clearFriendProfileSubscriptions();
        return;
      }

      if (acceptedFriendUids.size === 0) return;

      void loadFriendsSyncModule().then(({ subscribeFriendProfile }) => {
        if (
          !isMountedRef.current ||
          authSessionTokenRef.current !== sessionToken ||
          !friendsDetailActiveRef.current
        ) {
          return;
        }
        for (const fUid of acceptedFriendUids) {
          if (friendProfileUnsubsRef.current.has(fUid)) continue;
          const unsub = subscribeFriendProfile(
            fUid,
            (profile) => {
              if (authSessionTokenRef.current !== sessionToken) return;
              setFriendProfilesByUid((prev) => {
                const next = { ...prev };
                if (profile) {
                  next[fUid] = profile;
                } else {
                  delete next[fUid];
                }
                friendProfilesRef.current = next;
                persistCurrentFriendCache(
                  uid,
                  ownFriendProfileRef.current,
                  friendshipsRef.current,
                  next
                );
                return next;
              });
            },
            () => {
              // Silently ignore transient listener errors when friendship changes
            }
          );
          friendProfileUnsubsRef.current.set(fUid, unsub);
        }
      });
    },
    [clearFriendProfileSubscriptions, persistCurrentFriendCache]
  );

  const setFriendsDetailActive = useCallback(
    (active: boolean) => {
      if (friendsDetailActiveRef.current === active) return;
      friendsDetailActiveRef.current = active;
      const activeUser = userRef.current;
      if (!activeUser) return;
      if (!active) {
        clearFriendProfileSubscriptions();
      } else if (friendshipsRef.current.length > 0) {
        syncFriendProfileSubscriptions(
          activeUser.uid,
          friendshipsRef.current,
          authSessionTokenRef.current
        );
      }
    },
    [clearFriendProfileSubscriptions, syncFriendProfileSubscriptions]
  );

  const syncSharedMemberSubscriptions = useCallback(
    (uid: string, cohorts: SharedPlanCohort[], sessionToken: number) => {
      const activeIds = new Set(cohorts.map((c) => c.id));

      for (const [cohortId, unsub] of sharedMemberUnsubsRef.current.entries()) {
        if (!activeIds.has(cohortId)) {
          unsub();
          sharedMemberUnsubsRef.current.delete(cohortId);
        }
      }

      setSharedMembersByCohort((prev) => {
        let changed = false;
        const next: Record<string, SharedPlanMember[]> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (activeIds.has(k)) {
            next[k] = v;
          } else {
            changed = true;
          }
        }
        if (changed) {
          sharedMembersByCohortRef.current = next;
          persistCurrentFriendCache(
            uid,
            ownFriendProfileRef.current,
            friendshipsRef.current,
            friendProfilesRef.current,
            { sharedPlans: assembleSharedPlansWithMembers(uid, cohorts, next) }
          );
          return next;
        }
        return prev;
      });

      if (cohorts.length === 0) return;

      void loadFellowshipSyncModule().then(({ subscribeSharedPlanMembers }) => {
        if (!isMountedRef.current || authSessionTokenRef.current !== sessionToken) return;
        for (const cohort of cohorts) {
          if (sharedMemberUnsubsRef.current.has(cohort.id)) continue;
          const unsub = subscribeSharedPlanMembers(
            cohort.id,
            (members) => {
              if (authSessionTokenRef.current !== sessionToken) return;
              setSharedMembersByCohort((prev) => {
                const next = { ...prev, [cohort.id]: members };
                sharedMembersByCohortRef.current = next;
                persistCurrentFriendCache(
                  uid,
                  ownFriendProfileRef.current,
                  friendshipsRef.current,
                  friendProfilesRef.current,
                  {
                    sharedPlans: assembleSharedPlansWithMembers(
                      uid,
                      sharedCohortsRef.current,
                      next
                    ),
                  }
                );
                return next;
              });
            },
            () => {
              // Silently ignore transient listener errors when cohort membership changes
            }
          );
          sharedMemberUnsubsRef.current.set(cohort.id, unsub);
        }
      });
    },
    [persistCurrentFriendCache]
  );

  const attachFriendListeners = useCallback(
    (uid: string, sessionToken: number) => {
      detachFriendListeners();
      friendshipsListenerErroredRef.current = false;
      setFriendsLoading(true);
      setFriendsError(null);

      void Promise.all([loadFriendsSyncModule(), loadFellowshipSyncModule()]).then(
        ([friendsSync, fellowshipSync]) => {
          if (!isMountedRef.current || authSessionTokenRef.current !== sessionToken) return;

          friendshipsUnsubRef.current = friendsSync.subscribeFriendships(uid, {
            onFriendships: (records, fromCache) => {
              if (authSessionTokenRef.current !== sessionToken) return;
              friendshipsSnapshotReceivedRef.current = true;
              friendshipsListenerErroredRef.current = false;
              friendshipsRef.current = records;
              setFriendships(records);
              setFriendsLoading(false);
              setFriendsFromCache(fromCache);
              setFriendsError(null);
              syncFriendProfileSubscriptions(uid, records, sessionToken);
              persistCurrentFriendCache(
                uid,
                ownFriendProfileRef.current,
                records,
                friendProfilesRef.current
              );
            },
            onError: (err) => {
              if (authSessionTokenRef.current !== sessionToken) return;
              friendshipsListenerErroredRef.current = true;
              setFriendsLoading(false);
              setFriendsError(formatCloudError(err));
            },
          });

          sharedPlansUnsubRef.current = fellowshipSync.subscribeSharedPlans(uid, {
            onCohorts: (cohorts) => {
              if (authSessionTokenRef.current !== sessionToken) return;
              sharedPlansSnapshotReceivedRef.current = true;
              sharedCohortsRef.current = cohorts;
              setSharedCohorts(cohorts);
              syncSharedMemberSubscriptions(uid, cohorts, sessionToken);
              persistCurrentFriendCache(
                uid,
                ownFriendProfileRef.current,
                friendshipsRef.current,
                friendProfilesRef.current,
                {
                  sharedPlans: assembleSharedPlansWithMembers(
                    uid,
                    cohorts,
                    sharedMembersByCohortRef.current
                  ),
                }
              );
            },
            onError: () => {
              // Ignore transient listener errors while offline
            },
          });

          encouragementsUnsubRef.current = fellowshipSync.subscribeReceivedEncouragements(
            uid,
            (items) => {
              if (authSessionTokenRef.current !== sessionToken) return;
              encouragementsSnapshotReceivedRef.current = true;
              receivedEncouragementsRef.current = items;
              setReceivedEncouragements(items);
              persistCurrentFriendCache(
                uid,
                ownFriendProfileRef.current,
                friendshipsRef.current,
                friendProfilesRef.current,
                { encouragements: items }
              );
            },
            () => {
              // Ignore transient encouragement listener errors while offline
            }
          );

          const loadBlocked =
            typeof friendsSync.fetchBlockedUsers === 'function'
              ? friendsSync.fetchBlockedUsers(uid)
              : friendsSync.fetchBlockedUids(uid).then((uids) =>
                  uids.map((blockedUid) => ({
                    blockedUid,
                    displayName: 'Blocked user',
                    createdAt: new Date().toISOString(),
                  }))
                );

          void loadBlocked
            .then((records) => {
              if (authSessionTokenRef.current !== sessionToken) return;
              blockedUidsRef.current = records.map((r) => r.blockedUid);
              setBlockedUsers(records);
            })
            .catch(() => {
              // Ignore transient blocked list fetch errors while offline
            });
        }
      );
    },
    [
      detachFriendListeners,
      persistCurrentFriendCache,
      syncFriendProfileSubscriptions,
      syncSharedMemberSubscriptions,
    ]
  );

  const attachCloudListeners = useCallback(
    (uid: string, sessionToken: number) => {
      cloudUnsubRef.current?.();
      cloudUnsubRef.current = null;
      cloudListenerErroredRef.current = false;
      const channelFromCache = {
        user: false,
        logs: false,
        customPlans: false,
      };
      const applyCloudChannelSyncStatus = () => {
        if (pendingWritesRef.current !== 0) return;
        const anyFromCache =
          channelFromCache.user || channelFromCache.logs || channelFromCache.customPlans;
        setSyncStatus(anyFromCache ? 'offline' : 'synced');
        if (!anyFromCache) {
          setLastSyncedAt(new Date().toISOString());
        }
      };

      void loadCloudSyncModule().then(({ subscribeCloudSanctuary }) => {
        if (!isMountedRef.current || authSessionTokenRef.current !== sessionToken) return;
        cloudUnsubRef.current = subscribeCloudSanctuary(uid, {
          onUserDoc: (docState, fromCache) => {
            if (authSessionTokenRef.current !== sessionToken) return;
            cloudListenerErroredRef.current = false;
            channelFromCache.user = fromCache;
            if (
              pendingPrefsWritesRef.current === 0 &&
              !arePreferencesEqual(prefsRef.current, docState.preferences)
            ) {
              prefsRef.current = docState.preferences;
              setPreferences(docState.preferences);
              void persistPreferences(docState.preferences);
            }
            if (pendingPrefsWritesRef.current === 0 && docState.colorScheme !== colorSchemeRef.current) {
              applyColorScheme(docState.colorScheme);
              setColorSchemeState(docState.colorScheme);
            }
            if (docState.displayName !== (userRef.current?.displayName ?? '')) {
              setUser((prev) =>
                prev ? { ...prev, displayName: docState.displayName || null } : prev
              );
            }
            applyCloudChannelSyncStatus();
          },
          onLogs: (nextCloudLogs, fromCache) => {
            if (authSessionTokenRef.current !== sessionToken) return;
            cloudListenerErroredRef.current = false;
            channelFromCache.logs = fromCache;
            if (
              pendingLogWritesRef.current === 0 &&
              normalizeLogsSignature(logsRef.current) !== normalizeLogsSignature(nextCloudLogs)
            ) {
              hydrateSilently(nextCloudLogs, prefsRef.current);
              void replaceAllLogs(nextCloudLogs);
            }
            applyCloudChannelSyncStatus();
          },
          onCustomPlans: (nextCloudPlans, fromCache) => {
            if (authSessionTokenRef.current !== sessionToken) return;
            cloudListenerErroredRef.current = false;
            channelFromCache.customPlans = fromCache;
            if (
              pendingCustomPlanWritesRef.current === 0 &&
              normalizeCustomPlansSignature(customPlansRef.current) !==
                normalizeCustomPlansSignature(nextCloudPlans)
            ) {
              customPlansRef.current = nextCloudPlans;
              setCustomPlans(nextCloudPlans);
              void replaceAllCustomPlans(nextCloudPlans);
            }
            applyCloudChannelSyncStatus();
          },
          onError: (err) => {
            if (authSessionTokenRef.current !== sessionToken) return;
            cloudListenerErroredRef.current = true;
            setSyncStatus('error');
            setSyncError(formatCloudError(err));
          },
        });
      });
    },
    [hydrateSilently]
  );

  const resetSignedOutState = useCallback(() => {
    const prevUid = userRef.current?.uid;
    cloudUnsubRef.current?.();
    cloudUnsubRef.current = null;
    detachFriendListeners();
    if (prevUid) {
      void clearFriendCache(prevUid);
    }
    friendshipsSnapshotReceivedRef.current = false;
    sharedPlansSnapshotReceivedRef.current = false;
    encouragementsSnapshotReceivedRef.current = false;
    friendshipsListenerErroredRef.current = false;
    cloudListenerErroredRef.current = false;
    lastPublishedFriendSigRef.current = null;
    lastPublishedDirectorySigRef.current = null;
    ensuredFriendProfileUidRef.current = null;
    pendingWritesRef.current = 0;
    pendingPrefsWritesRef.current = 0;
    pendingLogWritesRef.current = 0;
    pendingCustomPlanWritesRef.current = 0;
    setUser(null);
    userRef.current = null;
    setOwnFriendProfile(null);
    ownFriendProfileRef.current = null;
    setFriendships([]);
    friendshipsRef.current = [];
    setFriendProfilesByUid({});
    friendProfilesRef.current = {};
    setBlockedUsers([]);
    blockedUidsRef.current = [];
    setSharedCohorts([]);
    sharedCohortsRef.current = [];
    setSharedMembersByCohort({});
    sharedMembersByCohortRef.current = {};
    setReceivedEncouragements([]);
    receivedEncouragementsRef.current = [];
    setSentEncouragementCooldowns({});
    sentCooldownsRef.current = {};
    setFriendsLoading(false);
    setFriendsError(null);
    setFriendsFromCache(false);
    setPendingMerge(null);
    setSyncStatus('local');
    setSyncError(null);
    setLastSyncedAt(null);
  }, [detachFriendListeners]);

  attachCloudListenersRef.current = attachCloudListeners;
  attachFriendListenersRef.current = attachFriendListeners;

  const ensureAuthReady = useCallback(async () => {
    if (authUnsubRef.current) return;
    if (authInitPromiseRef.current) {
      return authInitPromiseRef.current;
    }

    const initPromise = (async () => {
      const authMod = await loadAuthModule();
      if (!isMountedRef.current) return;

      const available = authMod.isAuthAvailable();
      setFirebaseAvailable(available);
      if (!available) {
        setAuthLoading(false);
        return;
      }

      // Pre-warm cloud sync module (shares the Firebase chunk) once auth is active
      void loadCloudSyncModule();

      authUnsubRef.current = authMod.subscribeToAuthState((nextUser) => {
        const sessionToken = ++authSessionTokenRef.current;

        void (async () => {
          if (initialLocalLoadPromiseRef.current) {
            await initialLocalLoadPromiseRef.current;
          }
          if (!isMountedRef.current || authSessionTokenRef.current !== sessionToken) return;

          if (!nextUser) {
            const hadCloudOwner = Boolean(getLocalOwnerUid() || userRef.current);
            resetSignedOutState();
            setAuthLoading(false);

            if (hadCloudOwner) {
              setLocalOwnerUid(null);
              await clearAllSanctuaryData();
              if (!isMountedRef.current || authSessionTokenRef.current !== sessionToken) return;
              hydrateSilently([], { ...DEFAULT_PREFERENCES }, []);
            }
            return;
          }

          const resolvedUser = resolveEffectiveAccountUser(nextUser) ?? nextUser;
          friendshipsSnapshotReceivedRef.current = false;
          sharedPlansSnapshotReceivedRef.current = false;
          encouragementsSnapshotReceivedRef.current = false;
          friendshipsListenerErroredRef.current = false;
          cloudListenerErroredRef.current = false;
          setFriendsFromCache(false);
          setUser(resolvedUser);
          userRef.current = resolvedUser;
          setAuthLoading(false);
          setSyncStatus('syncing');
          setSyncError(null);

          void loadFriendCache(nextUser.uid).then((cached) => {
            if (!cached || !isMountedRef.current || authSessionTokenRef.current !== sessionToken) {
              return;
            }
            if (!ownFriendProfileRef.current && cached.ownProfile) {
              ownFriendProfileRef.current = cached.ownProfile;
              setOwnFriendProfile(cached.ownProfile);
            }
            if (
              !friendshipsSnapshotReceivedRef.current &&
              friendshipsRef.current.length === 0 &&
              cached.friendships.length > 0
            ) {
              friendshipsRef.current = cached.friendships;
              setFriendships(cached.friendships);
              setFriendsFromCache(true);
            }
            if (
              !friendshipsSnapshotReceivedRef.current &&
              Object.keys(friendProfilesRef.current).length === 0 &&
              Object.keys(cached.profilesByUid).length > 0
            ) {
              friendProfilesRef.current = cached.profilesByUid;
              setFriendProfilesByUid(cached.profilesByUid);
            }
            if (
              !sharedPlansSnapshotReceivedRef.current &&
              sharedCohortsRef.current.length === 0 &&
              cached.sharedPlans &&
              cached.sharedPlans.length > 0
            ) {
              const cachedCohorts = cached.sharedPlans.map((sp) => sp.cohort);
              const cachedMembers: Record<string, SharedPlanMember[]> = {};
              for (const sp of cached.sharedPlans) {
                cachedMembers[sp.cohort.id] = sp.members;
              }
              sharedCohortsRef.current = cachedCohorts;
              setSharedCohorts(cachedCohorts);
              sharedMembersByCohortRef.current = cachedMembers;
              setSharedMembersByCohort(cachedMembers);
            }
            if (
              !encouragementsSnapshotReceivedRef.current &&
              receivedEncouragementsRef.current.length === 0 &&
              cached.encouragements &&
              cached.encouragements.length > 0
            ) {
              receivedEncouragementsRef.current = cached.encouragements;
              setReceivedEncouragements(cached.encouragements);
            }
            if (
              Object.keys(sentCooldownsRef.current).length === 0 &&
              cached.sentCooldowns &&
              Object.keys(cached.sentCooldowns).length > 0
            ) {
              sentCooldownsRef.current = cached.sentCooldowns;
              setSentEncouragementCooldowns(cached.sentCooldowns);
            }
          });

          try {
            const localLogs = logsRef.current;
            const localPrefs = prefsRef.current;
            const localCustomPlans = customPlansRef.current;
            const localScheme = colorSchemeRef.current;
            const prevOwnerUid = getLocalOwnerUid();

            // Preload cloud/friends/fellowship sync modules in parallel while fetching user state
            const [cloudSync] = await Promise.all([
              loadCloudSyncModule(),
              loadFriendsSyncModule(),
              loadFellowshipSyncModule(),
            ]);
            if (!isMountedRef.current || authSessionTokenRef.current !== sessionToken) return;

            const [cloudUser, cloudLogs, cloudCustomPlans] = await Promise.all([
              cloudSync.ensureCloudUserDoc(nextUser, {
                preferences: localPrefs,
                colorScheme: localScheme,
              }),
              cloudSync.fetchCloudLogs(nextUser.uid),
              cloudSync.fetchCloudCustomPlans(nextUser.uid),
            ]);

            if (!isMountedRef.current || authSessionTokenRef.current !== sessionToken) return;

            const hasUnsyncedGuestData =
              !prevOwnerUid && (localLogs.length > 0 || localCustomPlans.length > 0);
            const cloudIsEmpty = cloudLogs.length === 0 && cloudCustomPlans.length === 0;

            if (hasUnsyncedGuestData && cloudIsEmpty) {
              await Promise.all([
                cloudSync.batchSyncReadingLogs(nextUser.uid, localLogs, []),
                cloudSync.batchSyncCustomPlans(nextUser.uid, localCustomPlans, []),
                cloudSync.saveCloudPreferences(nextUser.uid, localPrefs),
                cloudSync.saveCloudColorScheme(nextUser.uid, localScheme),
              ]);
              if (!isMountedRef.current || authSessionTokenRef.current !== sessionToken) return;
              setLocalOwnerUid(nextUser.uid);
              setPendingMerge(null);
              setSyncStatus('synced');
              setLastSyncedAt(new Date().toISOString());
              setAnnouncement(
                `Signed in and saved ${localLogs.length} reading ${localLogs.length === 1 ? 'entry' : 'entries'} to your account.`
              );
            } else if (hasUnsyncedGuestData && !cloudIsEmpty) {
              setPendingMerge({
                guestLogs: localLogs,
                guestPreferences: localPrefs,
                guestCustomPlans: localCustomPlans,
                cloudLogsCount: cloudLogs.length,
              });
              hydrateSilently(cloudLogs, cloudUser.preferences, cloudCustomPlans);
              await Promise.all([
                replaceAllLogs(cloudLogs),
                persistPreferences(cloudUser.preferences),
                replaceAllCustomPlans(cloudCustomPlans),
              ]);
              if (cloudUser.existed && cloudUser.colorScheme !== localScheme) {
                applyColorScheme(cloudUser.colorScheme);
                setColorSchemeState(cloudUser.colorScheme);
              }
              setLocalOwnerUid(nextUser.uid);
              setSyncStatus('synced');
              setLastSyncedAt(new Date().toISOString());
            } else {
              setPendingMerge(null);
              if (
                normalizeLogsSignature(localLogs) !== normalizeLogsSignature(cloudLogs) ||
                !arePreferencesEqual(localPrefs, cloudUser.preferences) ||
                normalizeCustomPlansSignature(localCustomPlans) !==
                  normalizeCustomPlansSignature(cloudCustomPlans)
              ) {
                hydrateSilently(cloudLogs, cloudUser.preferences, cloudCustomPlans);
                await Promise.all([
                  replaceAllLogs(cloudLogs),
                  persistPreferences(cloudUser.preferences),
                  replaceAllCustomPlans(cloudCustomPlans),
                ]);
              }
              if (cloudUser.existed && cloudUser.colorScheme !== localScheme) {
                applyColorScheme(cloudUser.colorScheme);
                setColorSchemeState(cloudUser.colorScheme);
              }
              if (cloudUser.displayName && cloudUser.displayName !== nextUser.displayName) {
                setUser((prev) =>
                  prev ? { ...prev, displayName: cloudUser.displayName } : prev
                );
              }
              setLocalOwnerUid(nextUser.uid);
              setSyncStatus('synced');
              setLastSyncedAt(new Date().toISOString());
            }

            attachCloudListeners(nextUser.uid, sessionToken);
            attachFriendListeners(nextUser.uid, sessionToken);
          } catch (err) {
            if (!isMountedRef.current || authSessionTokenRef.current !== sessionToken) return;
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
            setSyncStatus(offline ? 'offline' : 'error');
            setSyncError(formatCloudError(err));
            attachCloudListeners(nextUser.uid, sessionToken);
            attachFriendListeners(nextUser.uid, sessionToken);
          }
        })();
      });
    })().finally(() => {
      authInitPromiseRef.current = null;
    });

    authInitPromiseRef.current = initPromise;
    return initPromise;
  }, [attachCloudListeners, attachFriendListeners, hydrateSilently, resetSignedOutState]);

  useEffect(() => {
    if (shouldEagerlyLoadFirebase()) {
      void ensureAuthReady();
    } else {
      setAuthLoading(false);
    }

    return () => {
      authUnsubRef.current?.();
      authUnsubRef.current = null;
      cloudUnsubRef.current?.();
      cloudUnsubRef.current = null;
      detachFriendListeners();
    };
  }, [detachFriendListeners, ensureAuthReady]);

  const summary = useMemo(
    () =>
      computeBibleProgress(logs, {
        streakGraceEnabled: preferences.streakGraceEnabled,
      }),
    [logs, preferences.streakGraceEnabled]
  );
  summaryRef.current = summary;

  const achievements = useMemo(
    () => evaluateAchievements(logs, summary),
    [logs, summary]
  );
  achievementsRef.current = achievements;

  const fellowshipAchievements = useMemo(
    () => evaluateFellowshipSeals(sanitizeFellowshipStats(preferences.fellowshipStats)),
    [preferences.fellowshipStats]
  );

  // Detect newly unlocked achievements cleanly after mutations
  useEffect(() => {
    if (!ready || prevUnlockedSetRef.current === null) return;
    const prevSet = prevUnlockedSetRef.current;
    const newlyUnlocked = achievements.filter(
      (a) => a.unlocked && !prevSet.has(a.definition.id)
    );

    // Always sync reference to current unlocked IDs (handles deletes/resets too)
    prevUnlockedSetRef.current = new Set(
      achievements.filter((a) => a.unlocked).map((a) => a.definition.id)
    );

    if (newlyUnlocked.length > 0) {
      setUnlockedQueue((q) => {
        const existingIds = new Set(q.map((item) => item.definition.id));
        const toAdd = newlyUnlocked.filter((item) => !existingIds.has(item.definition.id));
        return [...q, ...toAdd];
      });
      const hasMajor = newlyUnlocked.some(
        (a) => a.definition.tier === 'gold' || a.definition.tier === 'luminous'
      );
      celebrateAchievementUnlocked(prefsRef.current.celebrationsEnabled, hasMajor);
      setAnnouncement(
        `Achievement unlocked: ${newlyUnlocked.map((a) => a.definition.title).join(', ')}`
      );
    }
  }, [achievements, ready]);

  const setColorScheme = useCallback(
    (pref: ColorSchemePreference) => {
      applyColorScheme(pref);
      colorSchemeRef.current = pref;
      setColorSchemeState(pref);
      const uid = userRef.current?.uid;
      if (uid) {
        runCloudWrite(
          async () => (await loadCloudSyncModule()).saveCloudColorScheme(uid, pref),
          'preferences'
        );
      }
    },
    [runCloudWrite]
  );

  const updatePreferences = useCallback(
    async (patch: Partial<UserPreferences>) => {
      const next = normalizeUserPreferences({ ...prefsRef.current, ...patch });
      prefsRef.current = next;
      setPreferences(next);
      await persistPreferences(next);
      const uid = userRef.current?.uid;
      if (uid) {
        runCloudWrite(
          async () => (await loadCloudSyncModule()).saveCloudPreferences(uid, next),
          'preferences'
        );
      }
    },
    [runCloudWrite]
  );

  const activateReadingPlan = useCallback(
    async (planId: string) => {
      const currentShelf = sanitizeShelfPlanIds(prefsRef.current.shelfPlanIds);
      const nextShelf = currentShelf.includes(planId)
        ? currentShelf
        : [...currentShelf, planId].slice(0, 100);
      await updatePreferences({
        activePlanId: planId,
        shelfPlanIds: nextShelf,
      });
    },
    [updatePreferences]
  );

  const removePlanFromShelf = useCallback(
    async (planId: string) => {
      const currentShelf = sanitizeShelfPlanIds(prefsRef.current.shelfPlanIds);
      if (!currentShelf.includes(planId)) return;
      const nextShelf = currentShelf.filter((id) => id !== planId);
      const nextActive =
        prefsRef.current.activePlanId === planId
          ? (nextShelf[0] ?? null)
          : prefsRef.current.activePlanId;
      const removedPlan = getReadingPlanById(
        planId,
        customPlansRef.current.map((def) => materializeCustomPlan(def))
      );
      await updatePreferences({
        shelfPlanIds: nextShelf,
        activePlanId: nextActive,
      });
      if (removedPlan) {
        setAnnouncement(`Removed ${removedPlan.title} from your plans shelf.`);
      }
    },
    [updatePreferences]
  );

  const restoreDefaultShelfPlans = useCallback(async () => {
    const currentShelf = sanitizeShelfPlanIds(prefsRef.current.shelfPlanIds);
    const nextShelf = sanitizeShelfPlanIds([...currentShelf, ...CORE_DEFAULT_PLAN_IDS]);
    const nextActive =
      prefsRef.current.activePlanId && nextShelf.includes(prefsRef.current.activePlanId)
        ? prefsRef.current.activePlanId
        : CORE_DEFAULT_PLAN_IDS[0];
    await updatePreferences({
      shelfPlanIds: nextShelf,
      activePlanId: nextActive,
    });
    setAnnouncement('Restored the 4 starter reading plans to your shelf.');
  }, [updatePreferences]);

  const customReadingPlans = useMemo(
    () => customPlans.map((def) => materializeCustomPlan(def)),
    [customPlans]
  );

  const allPlans = useMemo(
    () => getAllReadingPlans(customReadingPlans),
    [customReadingPlans]
  );
  allPlansRef.current = allPlans;

  const saveCustomPlan = useCallback(
    async (
      input: SaveCustomPlanInput,
      options?: { activate?: boolean }
    ): Promise<ReadingPlan> => {
      const cleanTitle = input.title.trim().slice(0, 80);
      if (!cleanTitle) {
        throw new Error('Enter a title for your custom reading plan.');
      }
      const sections = sanitizeCustomPlanSections(input.sections);
      const totalChapters = computeSectionsChapterCount(sections);
      if (sections.length === 0 || totalChapters === 0) {
        throw new Error('Choose at least one Bible book or chapter range.');
      }

      const safeDuration = Math.max(
        1,
        Math.min(totalChapters, Math.round(input.durationDays) || 1)
      );
      const nowIso = new Date().toISOString();
      const existing = input.id
        ? customPlansRef.current.find((p) => p.id === input.id)
        : undefined;

      const definition: CustomPlanDefinition = {
        id: existing ? existing.id : createCustomPlanId(cleanTitle),
        title: cleanTitle,
        description: (input.description ?? '').trim().slice(0, 280),
        sections,
        durationDays: safeDuration,
        accentColor: sanitizePlanAccentColor(input.accentColor),
        createdAt: existing ? existing.createdAt : nowIso,
        updatedAt: nowIso,
      };

      await upsertCustomPlan(definition);
      const nextList = existing
        ? customPlansRef.current.map((p) => (p.id === definition.id ? definition : p))
        : [definition, ...customPlansRef.current];
      customPlansRef.current = nextList;
      setCustomPlans(nextList);

      const materialized = materializeCustomPlan(definition);
      const uid = userRef.current?.uid;
      if (uid) {
        runCloudWrite(
          async () => (await loadCloudSyncModule()).upsertCloudCustomPlan(uid, definition),
          'customPlans'
        );
      }

      const currentShelf = sanitizeShelfPlanIds(prefsRef.current.shelfPlanIds);
      const needsShelfAdd = !currentShelf.includes(definition.id) && (!existing || options?.activate);
      if (options?.activate || needsShelfAdd) {
        const nextShelf = currentShelf.includes(definition.id)
          ? currentShelf
          : [...currentShelf, definition.id].slice(0, 100);
        await updatePreferences({
          ...(nextShelf !== currentShelf ? { shelfPlanIds: nextShelf } : {}),
          ...(options?.activate ? { activePlanId: definition.id } : {}),
        });
      }

      setAnnouncement(
        existing
          ? `Updated custom reading plan ${definition.title}.`
          : `Created custom reading plan ${definition.title}.`
      );
      return materialized;
    },
    [runCloudWrite, updatePreferences]
  );

  const removeCustomPlan = useCallback(
    async (id: string) => {
      const target = customPlansRef.current.find((p) => p.id === id);
      if (!target) return;

      await deleteCustomPlan(id);
      const nextList = customPlansRef.current.filter((p) => p.id !== id);
      customPlansRef.current = nextList;
      setCustomPlans(nextList);

      const currentShelf = sanitizeShelfPlanIds(prefsRef.current.shelfPlanIds);
      const nextShelf = currentShelf.filter((sid) => sid !== id);
      const activeChanged = prefsRef.current.activePlanId === id;
      if (activeChanged || nextShelf.length !== currentShelf.length) {
        await updatePreferences({
          shelfPlanIds: nextShelf,
          ...(activeChanged ? { activePlanId: nextShelf[0] ?? null } : {}),
        });
      }

      const uid = userRef.current?.uid;
      if (uid) {
        runCloudWrite(
          async () => (await loadCloudSyncModule()).deleteCloudCustomPlan(uid, id),
          'customPlans'
        );
      }

      setAnnouncement(`Deleted custom reading plan ${target.title}.`);
    },
    [runCloudWrite, updatePreferences]
  );

  const isBookNowCompleteWithChapters = useCallback(
    (bookId: string, addedChapters: number[]): boolean => {
      const book = BOOKS_BY_ID[bookId];
      if (!book) return false;
      const bp = summaryRef.current?.bookProgressById[bookId];
      if (bp?.completed) return true;
      const addedSet = new Set(addedChapters);
      for (let ch = 1; ch <= book.chapterCount; ch++) {
        if (!bp?.chapterMap[ch] && !addedSet.has(ch)) {
          return false;
        }
      }
      return true;
    },
    []
  );

  const logChapters = useCallback(
    async (input: AddReadingLogInput) => {
      const book = BOOKS_BY_ID[input.bookId];
      if (!book || input.chapters.length === 0) return;

      const wasCompletedBefore = summaryRef.current?.bookProgressById[book.id]?.completed ?? false;

      const entry = await addReadingLog(input);
      const nextLogs = [...logsRef.current, entry];
      logsRef.current = nextLogs;
      setLogs(nextLogs);

      const isNowCompleted = !wasCompletedBefore && isBookNowCompleteWithChapters(book.id, entry.chapters);
      if (isNowCompleted) {
        celebrateBookCompleted(prefsRef.current.celebrationsEnabled);
      } else if (prefsRef.current.celebrationsEnabled) {
        void triggerNativeHaptic('tap');
      }

      setAnnouncement(`Logged ${book.name} ${formatChapterRanges(entry.chapters)}.`);

      const uid = userRef.current?.uid;
      if (uid) {
        runCloudWrite(
          async () => (await loadCloudSyncModule()).upsertCloudReadingLog(uid, entry),
          'logs'
        );
      }
    },
    [isBookNowCompleteWithChapters, runCloudWrite]
  );

  const logChaptersBatch = useCallback(
    async (inputs: AddReadingLogInput[]) => {
      const validInputs = inputs.filter(
        (item) => Boolean(BOOKS_BY_ID[item.bookId]) && item.chapters.length > 0
      );
      if (validInputs.length === 0) return;
      if (validInputs.length === 1) {
        await logChapters(validInputs[0]);
        return;
      }

      const addedByBook = new Map<string, number[]>();
      const wasCompletedBefore = new Map<string, boolean>();
      for (const item of validInputs) {
        if (!wasCompletedBefore.has(item.bookId)) {
          wasCompletedBefore.set(
            item.bookId,
            summaryRef.current?.bookProgressById[item.bookId]?.completed ?? false
          );
        }
        const list = addedByBook.get(item.bookId) ?? [];
        list.push(...item.chapters);
        addedByBook.set(item.bookId, list);
      }

      const entries = await addReadingLogsBatch(validInputs);
      const nextLogs = [...logsRef.current, ...entries];
      logsRef.current = nextLogs;
      setLogs(nextLogs);

      let newlyCompletedAnyBook = false;
      for (const [bookId, chapters] of addedByBook.entries()) {
        if (!wasCompletedBefore.get(bookId) && isBookNowCompleteWithChapters(bookId, chapters)) {
          newlyCompletedAnyBook = true;
          break;
        }
      }

      if (newlyCompletedAnyBook) {
        celebrateBookCompleted(prefsRef.current.celebrationsEnabled);
      } else if (prefsRef.current.celebrationsEnabled) {
        void triggerNativeHaptic('tap');
      }

      const totalChapters = entries.reduce((acc, e) => acc + e.chapters.length, 0);
      setAnnouncement(
        `Logged ${entries.length} passages (${totalChapters} ${totalChapters === 1 ? 'chapter' : 'chapters'}).`
      );

      const uid = userRef.current?.uid;
      if (uid) {
        runCloudWrite(
          async () => (await loadCloudSyncModule()).batchSyncReadingLogs(uid, entries, []),
          'logs'
        );
      }
    },
    [isBookNowCompleteWithChapters, logChapters, runCloudWrite]
  );

  const toggleChapter = useCallback(
    async (
      bookId: string,
      chapter: number,
      options?: { rereadMode?: boolean; readDate?: string }
    ) => {
      const book = BOOKS_BY_ID[bookId];
      if (!book) return;
      const bp = summaryRef.current?.bookProgressById[bookId];
      const alreadyRead = Boolean(bp?.chapterMap[chapter]);

      if (!alreadyRead || options?.rereadMode) {
        await logChapters({
          bookId,
          chapters: [chapter],
          readDate: options?.readDate ?? todayPlainDate(),
        });
      } else {
        const prevLogs = logsRef.current;
        const nextLogs = await removeChaptersFromBookLogs(bookId, [chapter], prevLogs);
        logsRef.current = nextLogs;
        setLogs(nextLogs);
        if (prefsRef.current.celebrationsEnabled) {
          void triggerNativeHaptic('tap');
        }
        setAnnouncement(`Removed ${book.name} chapter ${chapter} from your logs.`);

        const uid = userRef.current?.uid;
        if (uid) {
          const { upserts, deleteIds } = diffLogsForSync(prevLogs, nextLogs);
          if (upserts.length > 0 || deleteIds.length > 0) {
            runCloudWrite(
              async () => (await loadCloudSyncModule()).batchSyncReadingLogs(uid, upserts, deleteIds),
              'logs'
            );
          }
        }
      }
    },
    [logChapters, runCloudWrite]
  );

  const markBookComplete = useCallback(
    async (bookId: string, readDate?: string) => {
      const book = BOOKS_BY_ID[bookId];
      if (!book) return;
      const bp = summaryRef.current?.bookProgressById[bookId];
      const unread: number[] = [];
      for (let ch = 1; ch <= book.chapterCount; ch++) {
        if (!bp?.chapterMap[ch]) unread.push(ch);
      }
      const targetChapters =
        unread.length > 0
          ? unread
          : Array.from({ length: book.chapterCount }, (_, idx) => idx + 1);
      await logChapters({
        bookId,
        chapters: targetChapters,
        readDate: readDate ?? todayPlainDate(),
      });
    },
    [logChapters]
  );

  const clearBookProgress = useCallback(
    async (bookId: string) => {
      const book = BOOKS_BY_ID[bookId];
      if (!book) return;
      const prevLogs = logsRef.current;
      const allChapters = Array.from({ length: book.chapterCount }, (_, idx) => idx + 1);
      const nextLogs = await removeChaptersFromBookLogs(bookId, allChapters, prevLogs);
      logsRef.current = nextLogs;
      setLogs(nextLogs);
      setAnnouncement(`Cleared reading logs for ${book.name}.`);

      const uid = userRef.current?.uid;
      if (uid) {
        const { upserts, deleteIds } = diffLogsForSync(prevLogs, nextLogs);
        if (upserts.length > 0 || deleteIds.length > 0) {
          runCloudWrite(
            async () => (await loadCloudSyncModule()).batchSyncReadingLogs(uid, upserts, deleteIds),
            'logs'
          );
        }
      }
    },
    [runCloudWrite]
  );

  const editLog = useCallback(
    async (
      id: string,
      patch: Partial<Pick<ReadingLogEntry, 'chapters' | 'readDate' | 'note'>>
    ) => {
      await updateReadingLog(id, patch);
      let updatedEntry: ReadingLogEntry | null = null;
      const nextLogs = logsRef.current.map((l) => {
        if (l.id !== id) return l;
        updatedEntry = {
          ...l,
          ...patch,
          chapters: patch.chapters
            ? [...new Set(patch.chapters)].sort((a, b) => a - b)
            : l.chapters,
          note: patch.note !== undefined ? patch.note.trim() || undefined : l.note,
        };
        return updatedEntry;
      });
      logsRef.current = nextLogs;
      setLogs(nextLogs);
      setAnnouncement('Updated reading log entry.');

      const uid = userRef.current?.uid;
      if (uid && updatedEntry) {
        const entryToSync = updatedEntry;
        runCloudWrite(
          async () => (await loadCloudSyncModule()).upsertCloudReadingLog(uid, entryToSync),
          'logs'
        );
      }
    },
    [runCloudWrite]
  );

  const removeLog = useCallback(
    async (id: string) => {
      await deleteReadingLog(id);
      const nextLogs = logsRef.current.filter((l) => l.id !== id);
      logsRef.current = nextLogs;
      setLogs(nextLogs);
      setAnnouncement('Deleted reading log entry.');

      const uid = userRef.current?.uid;
      if (uid) {
        runCloudWrite(
          async () => (await loadCloudSyncModule()).deleteCloudReadingLog(uid, id),
          'logs'
        );
      }
    },
    [runCloudWrite]
  );

  const dismissUnlockedAchievement = useCallback((id: string) => {
    setUnlockedQueue((prev) => prev.filter((item) => item.definition.id !== id));
  }, []);

  const exportBackupJson = useCallback(() => {
    return JSON.stringify(
      buildBackupPayload(logsRef.current, prefsRef.current, customPlansRef.current),
      null,
      2
    );
  }, []);

  const importBackupJson = useCallback(
    async (raw: string) => {
      const parsed = parseAndValidateBackup(raw);
      const prevLogIds = logsRef.current.map((l) => l.id);
      const prevPlanIds = customPlansRef.current.map((p) => p.id);
      const nextCustomPlans = parsed.customPlans ?? [];
      await Promise.all([
        replaceAllLogs(parsed.logs),
        persistPreferences(parsed.preferences),
        replaceAllCustomPlans(nextCustomPlans),
      ]);
      hydrateSilently(parsed.logs, parsed.preferences, nextCustomPlans);
      setAnnouncement(`Imported ${parsed.logs.length} reading log entries.`);

      const uid = userRef.current?.uid;
      if (uid) {
        runCloudWrite(async () => {
          const cloudSync = await loadCloudSyncModule();
          await Promise.all([
            cloudSync.replaceCloudLogs(uid, parsed.logs, prevLogIds),
            cloudSync.replaceCloudCustomPlans(uid, nextCustomPlans, prevPlanIds),
            cloudSync.saveCloudPreferences(uid, parsed.preferences),
          ]);
        });
      }
      return parsed.logs.length;
    },
    [hydrateSilently, runCloudWrite]
  );

  const activateDemoJourney = useCallback(async () => {
    const prevIds = logsRef.current.map((l) => l.id);
    const { logs: demoLogs, preferences: demoPrefs, customPlans: demoPlans } =
      await seedDemoSanctuary();
    hydrateSilently(demoLogs, demoPrefs, demoPlans);
    setAnnouncement('Loaded sample reading journey.');

    const uid = userRef.current?.uid;
    if (uid) {
      runCloudWrite(
        async () => (await loadCloudSyncModule()).replaceCloudLogs(uid, demoLogs, prevIds),
        'logs'
      );
    }
  }, [hydrateSilently, runCloudWrite]);

  const resetAllData = useCallback(async () => {
    const prevLogIds = logsRef.current.map((l) => l.id);
    const prevPlanIds = customPlansRef.current.map((p) => p.id);
    await clearAllSanctuaryData();
    hydrateSilently([], { ...DEFAULT_PREFERENCES }, []);
    setAnnouncement('Cleared all reading data.');

    const uid = userRef.current?.uid;
    if (uid) {
      runCloudWrite(async () => {
        const cloudSync = await loadCloudSyncModule();
        await Promise.all([
          cloudSync.replaceCloudLogs(uid, [], prevLogIds),
          cloudSync.replaceCloudCustomPlans(uid, [], prevPlanIds),
          cloudSync.saveCloudPreferences(uid, { ...DEFAULT_PREFERENCES }),
        ]);
      });
    }
  }, [hydrateSilently, runCloudWrite]);

  const signInWithGoogle = useCallback(async () => {
    await ensureAuthReady();
    const authMod = await loadAuthModule();
    try {
      await authMod.signInWithGoogleAccount();
    } catch (err) {
      throw new Error(authMod.formatAuthError(err));
    }
  }, [ensureAuthReady]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      await ensureAuthReady();
      const authMod = await loadAuthModule();
      try {
        await authMod.signInWithEmailAccount(email, password);
      } catch (err) {
        throw new Error(authMod.formatAuthError(err));
      }
    },
    [ensureAuthReady]
  );

  const signUpWithEmail = useCallback(
    async (email: string, password: string, displayName?: string) => {
      await ensureAuthReady();
      const authMod = await loadAuthModule();
      try {
        await authMod.signUpWithEmailAccount(email, password, displayName);
      } catch (err) {
        throw new Error(authMod.formatAuthError(err));
      }
    },
    [ensureAuthReady]
  );

  const syncOwnFriendProfileAfterUpdate = useCallback(
    (updatedUser: AccountUser, syncDirectory = true) => {
      if (!ownFriendProfileRef.current) return;
      const currentSummary =
        summaryRef.current ??
        computeBibleProgress(logsRef.current, {
          streakGraceEnabled: prefsRef.current.streakGraceEnabled,
        });
      const currentAchievements =
        achievementsRef.current.length > 0
          ? achievementsRef.current
          : evaluateAchievements(logsRef.current, currentSummary);
      const currentAllPlans =
        allPlansRef.current.length > 0
          ? allPlansRef.current
          : getAllReadingPlans(customPlansRef.current.map((def) => materializeCustomPlan(def)));
      void loadFriendsSyncModule()
        .then(({ publishOwnFriendStats }) =>
          publishOwnFriendStats({
            user: updatedUser,
            username: ownFriendProfileRef.current?.username ?? null,
            summary: currentSummary,
            achievements: currentAchievements,
            preferences: prefsRef.current,
            allPlans: currentAllPlans,
            syncDirectory,
          })
        )
        .then((published) => {
          if (published) {
            ownFriendProfileRef.current = published;
            setOwnFriendProfile(published);
            lastPublishedFriendSigRef.current = computeFriendStatsSignature(published);
            if (syncDirectory) {
              const dirPrivacy = sanitizeFriendPrivacy(prefsRef.current.friendPrivacy);
              lastPublishedDirectorySigRef.current = JSON.stringify({
                displayName: published.displayName,
                username: published.username,
                photoURL: dirPrivacy.showPhoto ? sanitizeHttpsPhotoUrl(updatedUser.photoURL) : null,
                discoverable: dirPrivacy.discoverable,
              });
            }
            persistCurrentFriendCache(
              updatedUser.uid,
              published,
              friendshipsRef.current,
              friendProfilesRef.current
            );
          }
        })
        .catch(() => {});
    },
    [persistCurrentFriendCache]
  );

  const updateDisplayName = useCallback(
    async (displayName: string) => {
      const [authMod, cloudSync] = await Promise.all([loadAuthModule(), loadCloudSyncModule()]);
      try {
        const updated = await authMod.updateAccountDisplayName(displayName);
        const nextUser = resolveEffectiveAccountUser(updated) ?? updated;
        setUser(nextUser);
        userRef.current = nextUser;
        await cloudSync.saveCloudDisplayName(nextUser.uid, nextUser.displayName ?? '');
        syncOwnFriendProfileAfterUpdate(nextUser, true);
        setAnnouncement('Updated account display name.');
      } catch (err) {
        throw new Error(authMod.formatAuthError(err));
      }
    },
    [syncOwnFriendProfileAfterUpdate]
  );

  const updateProfilePhoto = useCallback(
    async (
      choice:
        | { kind: 'cloud'; photoURL: string | null }
        | { kind: 'local'; dataUrl: string }
    ) => {
      const current = userRef.current;
      if (!current) {
        throw new Error('You must be signed in to update your profile picture.');
      }

      if (choice.kind === 'local') {
        writeLocalAvatarDataUrl(current.uid, choice.dataUrl);
        const nextUser: AccountUser = {
          ...current,
          photoURL: choice.dataUrl,
        };
        setUser(nextUser);
        userRef.current = nextUser;
        setAnnouncement('Updated profile picture on this device.');
        return;
      }

      const authMod = await loadAuthModule();
      try {
        const updated = await authMod.updateAccountPhotoUrl(choice.photoURL);
        writeLocalAvatarDataUrl(current.uid, null);
        const nextUser: AccountUser = {
          ...current,
          ...updated,
          photoURL: choice.photoURL,
          providerPhotoURL: updated.providerPhotoURL ?? current.providerPhotoURL ?? null,
        };
        setUser(nextUser);
        userRef.current = nextUser;
        syncOwnFriendProfileAfterUpdate(nextUser, true);
        setAnnouncement(
          choice.photoURL ? 'Updated profile picture.' : 'Removed profile picture.'
        );
      } catch (err) {
        throw new Error(authMod.formatAuthError(err));
      }
    },
    [syncOwnFriendProfileAfterUpdate]
  );

  const sendPasswordReset = useCallback(
    async (email: string) => {
      await ensureAuthReady();
      const authMod = await loadAuthModule();
      try {
        await authMod.sendAccountPasswordReset(email);
      } catch (err) {
        throw new Error(authMod.formatAuthError(err));
      }
    },
    [ensureAuthReady]
  );

  const signOut = useCallback(async () => {
    resetSignedOutState();
    const authMod = await loadAuthModule();
    await authMod.signOutAccount();
    setLocalOwnerUid(null);
    await clearAllSanctuaryData();
    hydrateSilently([], { ...DEFAULT_PREFERENCES }, []);
    setAnnouncement('Signed out of your Selah account.');
  }, [hydrateSilently, resetSignedOutState]);

  const resolveGuestMerge = useCallback(
    async (strategy: 'merge' | 'cloud-only') => {
      const activeUser = userRef.current;
      const pending = pendingMerge;
      if (!activeUser || !pending) return;

      if (strategy === 'cloud-only') {
        setPendingMerge(null);
        setAnnouncement('Kept your existing cloud reading log.');
        return;
      }

      setSyncStatus('syncing');
      setSyncError(null);
      try {
        const cloudSync = await loadCloudSyncModule();
        const [cloudLogs, cloudCustomPlans] = await Promise.all([
          cloudSync.fetchCloudLogs(activeUser.uid),
          cloudSync.fetchCloudCustomPlans(activeUser.uid),
        ]);
        const mergedById = new Map<string, ReadingLogEntry>();
        for (const item of cloudLogs) {
          mergedById.set(item.id, item);
        }
        const toUpload: ReadingLogEntry[] = [];
        for (const guestItem of pending.guestLogs) {
          if (!mergedById.has(guestItem.id)) {
            mergedById.set(guestItem.id, guestItem);
            toUpload.push(guestItem);
          }
        }

        const mergedPlansById = new Map<string, CustomPlanDefinition>();
        for (const p of cloudCustomPlans) {
          mergedPlansById.set(p.id, p);
        }
        const plansToUpload: CustomPlanDefinition[] = [];
        for (const gp of pending.guestCustomPlans) {
          if (!mergedPlansById.has(gp.id)) {
            mergedPlansById.set(gp.id, gp);
            plansToUpload.push(gp);
          }
        }

        const mergedLogs = [...mergedById.values()];
        const mergedCustomPlans = [...mergedPlansById.values()];
        const mergedSeen = Array.from(
          new Set([
            ...prefsRef.current.seenAchievementIds,
            ...pending.guestPreferences.seenAchievementIds,
          ])
        ).slice(0, 100);
        const mergedShelf = sanitizeShelfPlanIds([
          ...(prefsRef.current.shelfPlanIds ?? CORE_DEFAULT_PLAN_IDS),
          ...(pending.guestPreferences.shelfPlanIds ?? CORE_DEFAULT_PLAN_IDS),
        ]);
        const mergedPrefs: UserPreferences = {
          ...prefsRef.current,
          seenAchievementIds: mergedSeen,
          shelfPlanIds: mergedShelf,
        };

        await Promise.all([
          toUpload.length > 0
            ? cloudSync.batchSyncReadingLogs(activeUser.uid, toUpload, [])
            : Promise.resolve(),
          plansToUpload.length > 0
            ? cloudSync.batchSyncCustomPlans(activeUser.uid, plansToUpload, [])
            : Promise.resolve(),
          cloudSync.saveCloudPreferences(activeUser.uid, mergedPrefs),
          replaceAllLogs(mergedLogs),
          replaceAllCustomPlans(mergedCustomPlans),
          persistPreferences(mergedPrefs),
        ]);

        hydrateSilently(mergedLogs, mergedPrefs, mergedCustomPlans);
        setPendingMerge(null);
        setSyncStatus('synced');
        setLastSyncedAt(new Date().toISOString());
        setAnnouncement(
          `Merged ${toUpload.length} local ${toUpload.length === 1 ? 'entry' : 'entries'} into your account.`
        );
      } catch (err) {
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        setSyncStatus(offline ? 'offline' : 'error');
        setSyncError(formatCloudError(err));
      }
    },
    [hydrateSilently, pendingMerge]
  );

  const syncNow = useCallback(async () => {
    const activeUser = userRef.current;
    if (!activeUser) return;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const cloudSync = await loadCloudSyncModule();
      const [cloudUser, cloudLogs, cloudCustomPlans] = await Promise.all([
        cloudSync.ensureCloudUserDoc(activeUser, {
          preferences: prefsRef.current,
          colorScheme: colorSchemeRef.current,
        }),
        cloudSync.fetchCloudLogs(activeUser.uid),
        cloudSync.fetchCloudCustomPlans(activeUser.uid),
      ]);
      hydrateSilently(cloudLogs, cloudUser.preferences, cloudCustomPlans);
      await Promise.all([
        replaceAllLogs(cloudLogs),
        replaceAllCustomPlans(cloudCustomPlans),
        persistPreferences(cloudUser.preferences),
      ]);
      if (cloudUser.colorScheme !== colorSchemeRef.current) {
        applyColorScheme(cloudUser.colorScheme);
        setColorSchemeState(cloudUser.colorScheme);
      }
      setSyncStatus('synced');
      setLastSyncedAt(new Date().toISOString());
      if (cloudListenerErroredRef.current) {
        attachCloudListeners(activeUser.uid, authSessionTokenRef.current);
      }
      if (friendshipsListenerErroredRef.current) {
        attachFriendListeners(activeUser.uid, authSessionTokenRef.current);
      }
      setAnnouncement('Synced with your cloud account.');
    } catch (err) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setSyncStatus(offline ? 'offline' : 'error');
      setSyncError(formatCloudError(err));
    }
  }, [attachCloudListeners, attachFriendListeners, hydrateSilently]);

  const ensureFriendProfileReady = useCallback(async () => {
    const activeUser = userRef.current;
    if (!activeUser) return;
    ensuredFriendProfileUidRef.current = activeUser.uid;
    try {
      const currentAllPlans =
        allPlansRef.current.length > 0
          ? allPlansRef.current
          : getAllReadingPlans(customPlansRef.current.map((def) => materializeCustomPlan(def)));
      const currentSummary =
        summaryRef.current ??
        computeBibleProgress(logsRef.current, {
          streakGraceEnabled: prefsRef.current.streakGraceEnabled,
        });
      const currentAchievements =
        achievementsRef.current.length > 0
          ? achievementsRef.current
          : evaluateAchievements(logsRef.current, currentSummary);
      const { ensureOwnFriendProfile } = await loadFriendsSyncModule();
      const profile = await ensureOwnFriendProfile({
        user: activeUser,
        summary: currentSummary,
        achievements: currentAchievements,
        preferences: prefsRef.current,
        allPlans: currentAllPlans,
      });
      if (profile && userRef.current?.uid === activeUser.uid) {
        ownFriendProfileRef.current = profile;
        setOwnFriendProfile(profile);
        lastPublishedFriendSigRef.current = computeFriendStatsSignature(profile);
        const dirPrivacy = sanitizeFriendPrivacy(prefsRef.current.friendPrivacy);
        lastPublishedDirectorySigRef.current = JSON.stringify({
          displayName: profile.displayName,
          username: profile.username,
          photoURL: dirPrivacy.showPhoto ? sanitizeHttpsPhotoUrl(activeUser.photoURL) : null,
          discoverable: dirPrivacy.discoverable,
        });
        setFriendsError(null);
        persistCurrentFriendCache(
          activeUser.uid,
          profile,
          friendshipsRef.current,
          friendProfilesRef.current
        );
      }
    } catch (err) {
      if (ensuredFriendProfileUidRef.current === activeUser.uid) {
        ensuredFriendProfileUidRef.current = null;
      }
      setFriendsError(formatCloudError(err));
    }
  }, [persistCurrentFriendCache]);

  // Keep own friend profile initialized and synced when reading stats or privacy settings change
  useEffect(() => {
    if (!ready || !user || pendingMerge) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    if (!ownFriendProfile || ensuredFriendProfileUidRef.current !== user.uid) {
      void ensureFriendProfileReady();
      return;
    }

    const privacy = sanitizeFriendPrivacy(preferences.friendPrivacy);
    const nextStats = buildFriendProfileStats({
      summary,
      achievements,
      preferences,
      allPlans,
    });
    const nextDisplayName = resolveAccountDisplayName(user);
    const nextPhotoURL =
      privacy.sharingEnabled && privacy.showPhoto
        ? sanitizeHttpsPhotoUrl(user.photoURL)
        : null;

    const nextSig = computeFriendStatsSignature({
      displayName: nextDisplayName,
      photoURL: nextPhotoURL,
      username: ownFriendProfile.username ?? null,
      discoverable: privacy.discoverable,
      sharingEnabled: privacy.sharingEnabled,
      privacy,
      stats: nextStats,
    });

    if (lastPublishedFriendSigRef.current === nextSig) return;

    const nextDirectorySig = JSON.stringify({
      displayName: nextDisplayName,
      username: ownFriendProfile.username ?? null,
      photoURL: privacy.showPhoto ? sanitizeHttpsPhotoUrl(user.photoURL) : null,
      discoverable: privacy.discoverable,
    });
    const shouldSyncDirectory = lastPublishedDirectorySigRef.current !== nextDirectorySig;

    if (friendSyncTimerRef.current !== null) {
      window.clearTimeout(friendSyncTimerRef.current);
    }
    const targetUid = user.uid;
    const currentUsername = ownFriendProfile.username ?? null;

    friendSyncTimerRef.current = window.setTimeout(() => {
      friendSyncTimerRef.current = null;
      const currentUser = userRef.current;
      if (!currentUser || currentUser.uid !== targetUid) return;
      void loadFriendsSyncModule()
        .then(({ publishOwnFriendStats }) =>
          publishOwnFriendStats({
            user: currentUser,
            username: currentUsername,
            summary,
            achievements,
            preferences,
            allPlans,
            syncDirectory: shouldSyncDirectory,
          })
        )
        .then((published) => {
          if (!published || userRef.current?.uid !== targetUid) return;
          ownFriendProfileRef.current = published;
          setOwnFriendProfile(published);
          lastPublishedFriendSigRef.current = computeFriendStatsSignature(published);
          if (shouldSyncDirectory) {
            lastPublishedDirectorySigRef.current = nextDirectorySig;
          }
          persistCurrentFriendCache(
            targetUid,
            published,
            friendshipsRef.current,
            friendProfilesRef.current
          );
        })
        .catch(() => {
          // Ignore background stats refresh errors; will retry on next change or reload
        });
    }, 550);

    return () => {
      if (friendSyncTimerRef.current !== null) {
        window.clearTimeout(friendSyncTimerRef.current);
        friendSyncTimerRef.current = null;
      }
    };
  }, [
    achievements,
    allPlans,
    ensureFriendProfileReady,
    ownFriendProfile,
    pendingMerge,
    persistCurrentFriendCache,
    preferences,
    ready,
    summary,
    user,
  ]);

  const sharedPlans = useMemo<SharedPlanWithMembers[]>(
    () => assembleSharedPlansWithMembers(user?.uid, sharedCohorts, sharedMembersByCohort),
    [sharedCohorts, sharedMembersByCohort, user?.uid]
  );

  // Track cumulative Fellowship Seal counters monotonically without dropping if friends/cohorts change later
  useEffect(() => {
    if (!ready || !user || pendingMerge) return;
    const acceptedFriendsCount = friendships.filter((f) => f.status === 'accepted').length;
    const joinedCohortsCount = sharedPlans.filter(
      (sp) => sp.myMembership?.status === 'joined'
    ).length;
    const currentStats = sanitizeFellowshipStats(prefsRef.current.fellowshipStats);
    const nextFriendsPeak = Math.max(currentStats.friendsPeak, acceptedFriendsCount);
    const nextCohortsPeak = Math.max(currentStats.cohortsPeak, joinedCohortsCount);
    if (
      nextFriendsPeak !== currentStats.friendsPeak ||
      nextCohortsPeak !== currentStats.cohortsPeak
    ) {
      void updatePreferences({
        fellowshipStats: {
          ...currentStats,
          friendsPeak: nextFriendsPeak,
          cohortsPeak: nextCohortsPeak,
        },
      });
    }
  }, [friendships, pendingMerge, ready, sharedPlans, updatePreferences, user]);

  // Debounce-sync user's own progress into joined Read Together cohorts
  useEffect(() => {
    if (!ready || !user || pendingMerge) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const joined = sharedPlans.filter((sp) => sp.myMembership?.status === 'joined');
    if (joined.length === 0) {
      lastPublishedCohortProgressSigRef.current = null;
      return;
    }

    const privacy = sanitizeFriendPrivacy(preferences.friendPrivacy);
    const nextDisplayName = resolveAccountDisplayName(user);
    const nextPhotoURL =
      privacy.sharingEnabled && privacy.showPhoto
        ? sanitizeHttpsPhotoUrl(user.photoURL)
        : null;

    const latestReadDate = computeLastReadDate(summary);

    const toSync: SharedPlanCohort[] = [];
    const sigParts: string[] = [];
    for (const sp of joined) {
      const prog = computeCohortMemberProgress(sp.cohort, summary);
      const cur = sp.myMembership;
      const changed =
        !cur ||
        cur.completedDays !== prog.completedDays ||
        cur.totalDays !== prog.totalDays ||
        cur.readChapters !== prog.readChapters ||
        cur.totalChapters !== prog.totalChapters ||
        cur.lastReadDate !== latestReadDate ||
        cur.displayName !== nextDisplayName ||
        cur.photoURL !== nextPhotoURL;
      if (changed) {
        toSync.push(sp.cohort);
        sigParts.push(
          `${sp.cohort.id}:${prog.completedDays}/${prog.totalDays}:${prog.readChapters}/${prog.totalChapters}:${latestReadDate ?? ''}:${nextDisplayName}:${nextPhotoURL ?? ''}`
        );
      }
    }

    if (toSync.length === 0) return;
    const nextSig = sigParts.join('|');
    if (lastPublishedCohortProgressSigRef.current === nextSig) return;

    if (cohortProgressTimerRef.current !== null) {
      window.clearTimeout(cohortProgressTimerRef.current);
    }

    cohortProgressTimerRef.current = window.setTimeout(() => {
      cohortProgressTimerRef.current = null;
      lastPublishedCohortProgressSigRef.current = nextSig;
      const activeUser = userRef.current;
      if (!activeUser || activeUser.uid !== user.uid) return;
      void loadFellowshipSyncModule().then(({ publishSharedPlanMemberProgress }) => {
        for (const cohort of toSync) {
          void publishSharedPlanMemberProgress({
            cohort,
            user: activeUser,
            ownPrivacy: prefsRef.current.friendPrivacy,
            summary,
          }).catch(() => {
            // Silently retry on subsequent reading change
          });
        }
      });
    }, 1200);

    return () => {
      if (cohortProgressTimerRef.current !== null) {
        window.clearTimeout(cohortProgressTimerRef.current);
        cohortProgressTimerRef.current = null;
      }
    };
  }, [pendingMerge, preferences.friendPrivacy, ready, sharedPlans, summary, user]);

  const searchReaders = useCallback(async (rawQuery: string): Promise<ReaderDirectoryEntry[]> => {
    const activeUser = userRef.current;
    if (!activeUser) {
      throw new Error('Sign in to search for friends.');
    }
    const { searchReaderDirectory } = await loadFriendsSyncModule();
    return searchReaderDirectory(rawQuery, {
      myUid: activeUser.uid,
      blockedUids: blockedUidsRef.current,
    });
  }, []);

  const loadSuggestedReaders = useCallback(async (): Promise<ReaderDirectoryEntry[]> => {
    const activeUser = userRef.current;
    if (!activeUser) return [];
    const excludeUids = new Set<string>([activeUser.uid, ...blockedUidsRef.current]);
    for (const rec of friendshipsRef.current) {
      excludeUids.add(rec.requesterUid);
      excludeUids.add(rec.recipientUid);
    }
    const { fetchSuggestedReaders } = await loadFriendsSyncModule();
    return fetchSuggestedReaders({
      myUid: activeUser.uid,
      excludeUids,
      maxResults: 8,
    });
  }, []);

  const checkUsernameAvailability = useCallback(async (rawUsername: string) => {
    const { checkUsernameAvailability: checkCloudUsernameAvailability } =
      await loadFriendsSyncModule();
    return checkCloudUsernameAvailability(rawUsername, userRef.current?.uid);
  }, []);

  const updateUsername = useCallback(
    async (nextUsername: string) => {
      const activeUser = userRef.current;
      if (!activeUser) {
        throw new Error('Sign in to change your username.');
      }
      const currentAllPlans =
        allPlansRef.current.length > 0
          ? allPlansRef.current
          : getAllReadingPlans(customPlansRef.current.map((def) => materializeCustomPlan(def)));
      const currentSummary =
        summaryRef.current ??
        computeBibleProgress(logsRef.current, {
          streakGraceEnabled: prefsRef.current.streakGraceEnabled,
        });
      const currentAchievements =
        achievementsRef.current.length > 0
          ? achievementsRef.current
          : evaluateAchievements(logsRef.current, currentSummary);
      const { claimCustomUsername } = await loadFriendsSyncModule();
      const updated = await claimCustomUsername({
        user: activeUser,
        previousUsername: ownFriendProfileRef.current?.username ?? null,
        nextUsername,
        summary: currentSummary,
        achievements: currentAchievements,
        preferences: prefsRef.current,
        allPlans: currentAllPlans,
      });
      if (updated) {
        ownFriendProfileRef.current = updated;
        setOwnFriendProfile(updated);
        lastPublishedFriendSigRef.current = computeFriendStatsSignature(updated);
        const dirPrivacy = sanitizeFriendPrivacy(prefsRef.current.friendPrivacy);
        lastPublishedDirectorySigRef.current = JSON.stringify({
          displayName: updated.displayName,
          username: updated.username,
          photoURL: dirPrivacy.showPhoto ? sanitizeHttpsPhotoUrl(activeUser.photoURL) : null,
          discoverable: dirPrivacy.discoverable,
        });
        persistCurrentFriendCache(
          activeUser.uid,
          updated,
          friendshipsRef.current,
          friendProfilesRef.current
        );
        setAnnouncement(
          updated.username ? `Updated username to @${updated.username}.` : 'Updated username.'
        );
      }
    },
    [persistCurrentFriendCache]
  );

  const sendFriendRequest = useCallback(async (target: FriendRequestTarget) => {
    const activeUser = userRef.current;
    if (!activeUser) {
      throw new Error('Sign in to send friend requests.');
    }
    const { sendFriendRequest: sendCloudFriendRequest } = await loadFriendsSyncModule();
    const result = await sendCloudFriendRequest({
      currentUser: activeUser,
      ownUsername: ownFriendProfileRef.current?.username ?? null,
      target,
      ownPrivacy: prefsRef.current.friendPrivacy,
    });
    setAnnouncement(
      result.outcome === 'accepted'
        ? `Added ${target.displayName} as a friend.`
        : `Sent friend request to ${target.displayName}.`
    );
    return result.outcome;
  }, []);

  const acceptFriendRequest = useCallback(async (pairId: string) => {
    const activeUser = userRef.current;
    if (!activeUser) return;
    const { acceptFriendRequest: acceptCloudFriendRequest } = await loadFriendsSyncModule();
    await acceptCloudFriendRequest({
      currentUser: activeUser,
      ownUsername: ownFriendProfileRef.current?.username ?? null,
      pairId,
      ownPrivacy: prefsRef.current.friendPrivacy,
    });
    setAnnouncement('Friend request accepted.');
  }, []);

  const declineFriendRequest = useCallback(async (pairId: string) => {
    const { deleteFriendship } = await loadFriendsSyncModule();
    await deleteFriendship(pairId);
    setAnnouncement('Friend request declined.');
  }, []);

  const cancelFriendRequest = useCallback(async (pairId: string) => {
    const { deleteFriendship } = await loadFriendsSyncModule();
    await deleteFriendship(pairId);
    setAnnouncement('Friend request cancelled.');
  }, []);

  const removeFriend = useCallback(async (pairId: string) => {
    const { deleteFriendship } = await loadFriendsSyncModule();
    await deleteFriendship(pairId);
    setAnnouncement('Removed friend.');
  }, []);

  const blockFriend = useCallback(
    async (targetUid: string, displayName: string, pairId?: string) => {
      const activeUser = userRef.current;
      if (!activeUser) return;
      const { blockUserAndRemoveFriendship } = await loadFriendsSyncModule();
      await blockUserAndRemoveFriendship({
        myUid: activeUser.uid,
        targetUid,
        targetDisplayName: displayName,
        pairId,
      });
      setBlockedUsers((prev) => {
        if (prev.some((item) => item.blockedUid === targetUid)) return prev;
        const nextRecord: BlockedFriendRecord = {
          blockedUid: targetUid,
          displayName: displayName.trim() || 'Blocked user',
          createdAt: new Date().toISOString(),
        };
        const next = [nextRecord, ...prev];
        blockedUidsRef.current = next.map((r) => r.blockedUid);
        return next;
      });
      setAnnouncement(`Blocked ${displayName}.`);
    },
    []
  );

  const unblockFriend = useCallback(async (targetUid: string) => {
    const activeUser = userRef.current;
    if (!activeUser || !targetUid) return;
    const { unblockUser } = await loadFriendsSyncModule();
    await unblockUser(activeUser.uid, targetUid);
    setBlockedUsers((prev) => {
      const next = prev.filter((item) => item.blockedUid !== targetUid);
      blockedUidsRef.current = next.map((r) => r.blockedUid);
      return next;
    });
    setAnnouncement('Unblocked user.');
  }, []);

  const friends = useMemo<FriendConnection[]>(() => {
    if (!user) return [];
    return friendships
      .filter((f) => f.status === 'accepted')
      .map((f) => {
        const counterpart = getFriendCounterpart(f, user.uid);
        const profile = friendProfilesByUid[counterpart.uid] ?? null;
        return {
          friendship: f,
          friendUid: counterpart.uid,
          displayName: profile?.displayName || counterpart.displayName,
          username: profile?.username ?? counterpart.username ?? null,
          photoURL: profile ? profile.photoURL : counterpart.photoURL,
          profile,
        };
      });
  }, [friendProfilesByUid, friendships, user]);

  const createSharedPlanCohort = useCallback(
    async (plan: ReadingPlan, inviteFriendUids: string[]): Promise<SharedPlanCohort> => {
      const activeUser = userRef.current;
      if (!activeUser) {
        throw new Error('Sign in to start a shared reading plan.');
      }
      const inviteFriends = inviteFriendUids
        .map((fUid) => {
          const match = friends.find((f) => f.friendUid === fUid);
          if (!match) return null;
          return {
            uid: match.friendUid,
            displayName: match.displayName,
            photoURL: match.photoURL,
          };
        })
        .filter((f): f is { uid: string; displayName: string; photoURL: string | null } => f !== null);

      const currentSummary =
        summaryRef.current ??
        computeBibleProgress(logsRef.current, {
          streakGraceEnabled: prefsRef.current.streakGraceEnabled,
        });

      const { createSharedPlanCohort: createCloudSharedCohort } =
        await loadFellowshipSyncModule();
      const cohort = await createCloudSharedCohort({
        hostUser: activeUser,
        ownPrivacy: prefsRef.current.friendPrivacy,
        plan,
        summary: currentSummary,
        inviteFriends,
      });

      const nextCohorts = [cohort, ...sharedCohortsRef.current.filter((c) => c.id !== cohort.id)];
      sharedCohortsRef.current = nextCohorts;
      setSharedCohorts(nextCohorts);

      const prog = computeCohortMemberProgress(cohort, currentSummary);
      const nowIso = new Date().toISOString();
      const hostPriv = sanitizeFriendPrivacy(prefsRef.current.friendPrivacy);
      const hostMember: SharedPlanMember = {
        uid: activeUser.uid,
        cohortId: cohort.id,
        displayName: cohort.hostName,
        photoURL:
          hostPriv.sharingEnabled && hostPriv.showPhoto
            ? sanitizeHttpsPhotoUrl(activeUser.photoURL)
            : null,
        status: 'joined',
        completedDays: prog.completedDays,
        totalDays: prog.totalDays,
        readChapters: prog.readChapters,
        totalChapters: prog.totalChapters,
        lastReadDate: computeLastReadDate(currentSummary),
        joinedAt: nowIso,
        updatedAt: nowIso,
      };
      const invitedMembers: SharedPlanMember[] = inviteFriends.map((f) => ({
        uid: f.uid,
        cohortId: cohort.id,
        displayName: f.displayName,
        photoURL: sanitizeHttpsPhotoUrl(f.photoURL),
        status: 'invited',
        completedDays: 0,
        totalDays: cohort.durationDays,
        readChapters: 0,
        totalChapters: prog.totalChapters,
        lastReadDate: null,
        joinedAt: null,
        updatedAt: nowIso,
      }));
      const nextMembersMap = {
        ...sharedMembersByCohortRef.current,
        [cohort.id]: [hostMember, ...invitedMembers],
      };
      sharedMembersByCohortRef.current = nextMembersMap;
      setSharedMembersByCohort(nextMembersMap);

      persistCurrentFriendCache(
        activeUser.uid,
        ownFriendProfileRef.current,
        friendshipsRef.current,
        friendProfilesRef.current,
        {
          sharedPlans: assembleSharedPlansWithMembers(activeUser.uid, nextCohorts, nextMembersMap),
        }
      );

      const activeStats = sanitizeFellowshipStats(prefsRef.current.fellowshipStats);
      if (activeStats.cohortsPeak < 1) {
        await updatePreferences({
          fellowshipStats: {
            ...activeStats,
            cohortsPeak: Math.max(activeStats.cohortsPeak, 1),
          },
        });
      }

      setAnnouncement(`Shared "${cohort.title}" with friends.`);
      return cohort;
    },
    [friends, persistCurrentFriendCache, updatePreferences]
  );

  const inviteFriendToSharedCohort = useCallback(
    async (cohortId: string, friendUid: string) => {
      const activeUser = userRef.current;
      if (!activeUser) throw new Error('Sign in to invite friends.');
      const cohort = sharedCohortsRef.current.find((c) => c.id === cohortId);
      if (!cohort) throw new Error('Shared reading group not found.');
      const friend = friends.find((f) => f.friendUid === friendUid);
      if (!friend) throw new Error('Only connected friends can be invited.');

      const { inviteFriendToCohort } = await loadFellowshipSyncModule();
      await inviteFriendToCohort({
        cohort,
        friend: {
          uid: friend.friendUid,
          displayName: friend.displayName,
          photoURL: friend.photoURL,
        },
      });

      const updatedCohort: SharedPlanCohort = cohort.participantUids.includes(friend.friendUid)
        ? cohort
        : {
            ...cohort,
            participantUids: [...cohort.participantUids, friend.friendUid],
            updatedAt: new Date().toISOString(),
          };
      const nextCohorts = sharedCohortsRef.current.map((c) =>
        c.id === cohort.id ? updatedCohort : c
      );
      sharedCohortsRef.current = nextCohorts;
      setSharedCohorts(nextCohorts);
      setAnnouncement(`Invited ${friend.displayName} to read "${cohort.title}".`);
    },
    [friends]
  );

  const joinSharedPlanCohort = useCallback(
    async (cohortId: string) => {
      const activeUser = userRef.current;
      if (!activeUser) throw new Error('Sign in to join shared reading plans.');
      const cohort = sharedCohortsRef.current.find((c) => c.id === cohortId);
      if (!cohort) throw new Error('Shared reading group not found.');

      const existingMembers = sharedMembersByCohortRef.current[cohortId] ?? [];
      const existingMember = existingMembers.find((m) => m.uid === activeUser.uid) ?? null;
      const currentSummary =
        summaryRef.current ??
        computeBibleProgress(logsRef.current, {
          streakGraceEnabled: prefsRef.current.streakGraceEnabled,
        });

      const { joinSharedPlanCohort: joinCloudSharedCohort } =
        await loadFellowshipSyncModule();
      await joinCloudSharedCohort({
        cohort,
        user: activeUser,
        ownPrivacy: prefsRef.current.friendPrivacy,
        summary: currentSummary,
        existingMember,
      });

      if (cohort.planType === 'custom' && cohort.sections.length > 0) {
        await saveCustomPlan(
          {
            id: buildSharedCustomPlanId(cohort.id),
            title: cohort.title,
            description: cohort.description,
            sections: cohort.sections,
            durationDays: cohort.durationDays,
            accentColor: cohort.accentColor,
          },
          { activate: true }
        );
      } else {
        await activateReadingPlan(getActiveLocalPlanIdForCohort(cohort));
      }

      const prog = computeCohortMemberProgress(cohort, currentSummary);
      const nowIso = new Date().toISOString();
      const joinPriv = sanitizeFriendPrivacy(prefsRef.current.friendPrivacy);
      const nextMember: SharedPlanMember = {
        uid: activeUser.uid,
        cohortId: cohort.id,
        displayName: resolveAccountDisplayName(activeUser),
        photoURL:
          joinPriv.sharingEnabled && joinPriv.showPhoto
            ? sanitizeHttpsPhotoUrl(activeUser.photoURL)
            : null,
        status: 'joined',
        completedDays: prog.completedDays,
        totalDays: prog.totalDays,
        readChapters: prog.readChapters,
        totalChapters: prog.totalChapters,
        lastReadDate: computeLastReadDate(currentSummary),
        joinedAt: existingMember?.joinedAt ?? nowIso,
        updatedAt: nowIso,
      };
      const nextList = [
        ...existingMembers.filter((m) => m.uid !== activeUser.uid),
        nextMember,
      ];
      const nextMembersMap = {
        ...sharedMembersByCohortRef.current,
        [cohort.id]: nextList,
      };
      sharedMembersByCohortRef.current = nextMembersMap;
      setSharedMembersByCohort(nextMembersMap);

      const activeStats = sanitizeFellowshipStats(prefsRef.current.fellowshipStats);
      if (activeStats.cohortsPeak < 1) {
        await updatePreferences({
          fellowshipStats: {
            ...activeStats,
            cohortsPeak: Math.max(activeStats.cohortsPeak, 1),
          },
        });
      }

      setAnnouncement(`Joined shared reading plan "${cohort.title}".`);
    },
    [activateReadingPlan, saveCustomPlan, updatePreferences]
  );

  const leaveSharedPlanCohort = useCallback(
    async (cohortId: string) => {
      const activeUser = userRef.current;
      if (!activeUser) return;
      const cohort = sharedCohortsRef.current.find((c) => c.id === cohortId);
      if (!cohort) return;
      if (cohort.hostUid === activeUser.uid) {
        throw new Error('As host, end the shared plan group to close it for all members.');
      }

      const { leaveOrDeclineSharedCohort } = await loadFellowshipSyncModule();
      await leaveOrDeclineSharedCohort({ cohort, myUid: activeUser.uid });

      const nextCohorts = sharedCohortsRef.current.filter((c) => c.id !== cohortId);
      sharedCohortsRef.current = nextCohorts;
      setSharedCohorts(nextCohorts);

      const nextMembersMap = { ...sharedMembersByCohortRef.current };
      delete nextMembersMap[cohortId];
      sharedMembersByCohortRef.current = nextMembersMap;
      setSharedMembersByCohort(nextMembersMap);

      persistCurrentFriendCache(
        activeUser.uid,
        ownFriendProfileRef.current,
        friendshipsRef.current,
        friendProfilesRef.current,
        {
          sharedPlans: assembleSharedPlansWithMembers(activeUser.uid, nextCohorts, nextMembersMap),
        }
      );

      setAnnouncement(`Left shared reading plan "${cohort.title}".`);
    },
    [persistCurrentFriendCache]
  );

  const deleteSharedPlanCohort = useCallback(
    async (cohortId: string) => {
      const activeUser = userRef.current;
      if (!activeUser) return;
      const cohort = sharedCohortsRef.current.find((c) => c.id === cohortId);
      if (!cohort) return;

      const { deleteSharedPlanCohort: deleteCloudSharedCohort } =
        await loadFellowshipSyncModule();
      await deleteCloudSharedCohort(cohortId);

      const nextCohorts = sharedCohortsRef.current.filter((c) => c.id !== cohortId);
      sharedCohortsRef.current = nextCohorts;
      setSharedCohorts(nextCohorts);

      const nextMembersMap = { ...sharedMembersByCohortRef.current };
      delete nextMembersMap[cohortId];
      sharedMembersByCohortRef.current = nextMembersMap;
      setSharedMembersByCohort(nextMembersMap);

      persistCurrentFriendCache(
        activeUser.uid,
        ownFriendProfileRef.current,
        friendshipsRef.current,
        friendProfilesRef.current,
        {
          sharedPlans: assembleSharedPlansWithMembers(activeUser.uid, nextCohorts, nextMembersMap),
        }
      );

      setAnnouncement(`Closed shared reading group "${cohort.title}".`);
    },
    [persistCurrentFriendCache]
  );

  const sendQuietEncouragement = useCallback(
    async (input: {
      recipientUid: string;
      presetId: EncouragementPresetId;
      customMessage?: string | null;
      cohortTitle?: string | null;
    }) => {
      const activeUser = userRef.current;
      if (!activeUser) {
        throw new Error('Sign in to send encouragement.');
      }

      const { sendQuietEncouragement: sendCloudQuietEncouragement } =
        await loadFellowshipSyncModule();
      const { sentAt } = await sendCloudQuietEncouragement({
        senderUser: activeUser,
        ownPrivacy: prefsRef.current.friendPrivacy,
        recipientUid: input.recipientUid,
        presetId: input.presetId,
        customMessage: input.customMessage,
        cohortTitle: input.cohortTitle,
      });

      const nextCooldowns = {
        ...sentCooldownsRef.current,
        [input.recipientUid]: sentAt,
      };
      sentCooldownsRef.current = nextCooldowns;
      setSentEncouragementCooldowns(nextCooldowns);

      persistCurrentFriendCache(
        activeUser.uid,
        ownFriendProfileRef.current,
        friendshipsRef.current,
        friendProfilesRef.current,
        { sentCooldowns: nextCooldowns }
      );

      const activeStats = sanitizeFellowshipStats(prefsRef.current.fellowshipStats);
      await updatePreferences({
        fellowshipStats: {
          ...activeStats,
          encouragementsSent: Math.min(100000, activeStats.encouragementsSent + 1),
        },
      });

      const sentText = getEncouragementDisplayText({
        presetId: input.presetId,
        customMessage: input.customMessage,
      });
      setAnnouncement(`Sent encouragement: "${sentText}".`);
    },
    [persistCurrentFriendCache, updatePreferences]
  );

  const acknowledgeQuietEncouragement = useCallback(
    async (senderUid: string) => {
      const activeUser = userRef.current;
      if (!activeUser) return;

      const nowIso = new Date().toISOString();
      const nextList = receivedEncouragementsRef.current.map((item) =>
        item.senderUid === senderUid ? { ...item, acknowledgedAt: nowIso } : item
      );
      receivedEncouragementsRef.current = nextList;
      setReceivedEncouragements(nextList);

      persistCurrentFriendCache(
        activeUser.uid,
        ownFriendProfileRef.current,
        friendshipsRef.current,
        friendProfilesRef.current,
        { encouragements: nextList }
      );

      const { acknowledgeQuietEncouragement: ackCloudEncouragement } =
        await loadFellowshipSyncModule();
      await ackCloudEncouragement({
        recipientUid: activeUser.uid,
        senderUid,
      });
      setAnnouncement('Marked encouragement as read.');
    },
    [persistCurrentFriendCache]
  );

  const refreshEncouragementCooldown = useCallback(
    async (recipientUid: string): Promise<string | null> => {
      const activeUser = userRef.current;
      if (!activeUser || !recipientUid) return null;
      try {
        const { fetchSentEncouragementSentAt } = await loadFellowshipSyncModule();
        const sentAt = await fetchSentEncouragementSentAt(recipientUid, activeUser.uid);
        if (sentAt) {
          const nextCooldowns = {
            ...sentCooldownsRef.current,
            [recipientUid]: sentAt,
          };
          sentCooldownsRef.current = nextCooldowns;
          setSentEncouragementCooldowns(nextCooldowns);
        }
        return sentAt;
      } catch {
        return sentCooldownsRef.current[recipientUid] ?? null;
      }
    },
    []
  );

  const incomingRequests = useMemo<FriendshipRecord[]>(() => {
    if (!user) return [];
    return friendships
      .filter((f) => f.status === 'pending' && f.recipientUid === user.uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [friendships, user]);

  const outgoingRequests = useMemo<FriendshipRecord[]>(() => {
    if (!user) return [];
    return friendships
      .filter((f) => f.status === 'pending' && f.requesterUid === user.uid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [friendships, user]);

  const unreadEncouragementsCount = useMemo(
    () => receivedEncouragements.filter((item) => !item.acknowledgedAt).length,
    [receivedEncouragements]
  );

  const readingDataValue = useMemo<ReadingDataContextValue>(
    () => ({
      ready,
      logs,
      preferences,
      customPlans,
      customReadingPlans,
      allPlans,
      summary,
      achievements,
      fellowshipAchievements,
      updatePreferences,
      activateReadingPlan,
      removePlanFromShelf,
      restoreDefaultShelfPlans,
      saveCustomPlan,
      removeCustomPlan,
      logChapters,
      logChaptersBatch,
      toggleChapter,
      markBookComplete,
      clearBookProgress,
      editLog,
      removeLog,
      exportBackupJson,
      importBackupJson,
      activateDemoJourney,
      resetAllData,
    }),
    [
      ready,
      logs,
      preferences,
      customPlans,
      customReadingPlans,
      allPlans,
      summary,
      achievements,
      fellowshipAchievements,
      updatePreferences,
      activateReadingPlan,
      removePlanFromShelf,
      restoreDefaultShelfPlans,
      saveCustomPlan,
      removeCustomPlan,
      logChapters,
      logChaptersBatch,
      toggleChapter,
      markBookComplete,
      clearBookProgress,
      editLog,
      removeLog,
      exportBackupJson,
      importBackupJson,
      activateDemoJourney,
      resetAllData,
    ]
  );

  const accountSyncValue = useMemo<AccountSyncContextValue>(
    () => ({
      firebaseAvailable,
      user,
      authLoading,
      syncStatus,
      syncError,
      lastSyncedAt,
      pendingMerge,
      ensureAuthReady,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      updateDisplayName,
      updateProfilePhoto,
      sendPasswordReset,
      signOut,
      resolveGuestMerge,
      syncNow,
    }),
    [
      firebaseAvailable,
      user,
      authLoading,
      syncStatus,
      syncError,
      lastSyncedAt,
      pendingMerge,
      ensureAuthReady,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      updateDisplayName,
      updateProfilePhoto,
      sendPasswordReset,
      signOut,
      resolveGuestMerge,
      syncNow,
    ]
  );

  const friendsValue = useMemo<FriendsContextValue>(
    () => ({
      ownFriendProfile,
      friends,
      incomingRequests,
      outgoingRequests,
      blockedUids,
      blockedUsers,
      friendsLoading,
      friendsError,
      friendsFromCache,
      setFriendsDetailActive,
      ensureFriendProfileReady,
      searchReaders,
      loadSuggestedReaders,
      checkUsernameAvailability,
      updateUsername,
      sendFriendRequest,
      acceptFriendRequest,
      declineFriendRequest,
      cancelFriendRequest,
      removeFriend,
      blockFriend,
      unblockFriend,
      sharedPlans,
      receivedEncouragements,
      unreadEncouragementsCount,
      sentEncouragementCooldowns,
      createSharedPlanCohort,
      inviteFriendToSharedCohort,
      joinSharedPlanCohort,
      leaveSharedPlanCohort,
      deleteSharedPlanCohort,
      sendQuietEncouragement,
      acknowledgeQuietEncouragement,
      refreshEncouragementCooldown,
    }),
    [
      ownFriendProfile,
      friends,
      incomingRequests,
      outgoingRequests,
      blockedUids,
      blockedUsers,
      friendsLoading,
      friendsError,
      friendsFromCache,
      setFriendsDetailActive,
      ensureFriendProfileReady,
      searchReaders,
      loadSuggestedReaders,
      checkUsernameAvailability,
      updateUsername,
      sendFriendRequest,
      acceptFriendRequest,
      declineFriendRequest,
      cancelFriendRequest,
      removeFriend,
      blockFriend,
      unblockFriend,
      sharedPlans,
      receivedEncouragements,
      unreadEncouragementsCount,
      sentEncouragementCooldowns,
      createSharedPlanCohort,
      inviteFriendToSharedCohort,
      joinSharedPlanCohort,
      leaveSharedPlanCohort,
      deleteSharedPlanCohort,
      sendQuietEncouragement,
      acknowledgeQuietEncouragement,
      refreshEncouragementCooldown,
    ]
  );

  const uiFeedbackValue = useMemo<UiFeedbackContextValue>(
    () => ({
      colorScheme,
      setColorScheme,
      unlockedQueue,
      dismissUnlockedAchievement,
      announcement,
    }),
    [colorScheme, setColorScheme, unlockedQueue, dismissUnlockedAchievement, announcement]
  );

  return (
    <UiFeedbackContext.Provider value={uiFeedbackValue}>
      <AccountSyncContext.Provider value={accountSyncValue}>
        <ReadingDataContext.Provider value={readingDataValue}>
          <FriendsContext.Provider value={friendsValue}>{children}</FriendsContext.Provider>
        </ReadingDataContext.Provider>
      </AccountSyncContext.Provider>
    </UiFeedbackContext.Provider>
  );
};

export function useReadingData(): ReadingDataContextValue {
  const ctx = useContext(ReadingDataContext);
  if (!ctx) {
    throw new Error('useReadingData must be used inside BibleStoreProvider');
  }
  return ctx;
}

export function useAccountSync(): AccountSyncContextValue {
  const ctx = useContext(AccountSyncContext);
  if (!ctx) {
    throw new Error('useAccountSync must be used inside BibleStoreProvider');
  }
  return ctx;
}

export function useFriendsStore(): FriendsContextValue {
  const ctx = useContext(FriendsContext);
  if (!ctx) {
    throw new Error('useFriendsStore must be used inside BibleStoreProvider');
  }
  return ctx;
}

export function useUiFeedback(): UiFeedbackContextValue {
  const ctx = useContext(UiFeedbackContext);
  if (!ctx) {
    throw new Error('useUiFeedback must be used inside BibleStoreProvider');
  }
  return ctx;
}

export function useBibleStore(): BibleStoreValue {
  const reading = useReadingData();
  const account = useAccountSync();
  const friends = useFriendsStore();
  const ui = useUiFeedback();
  return useMemo(
    () => ({
      ...reading,
      ...account,
      ...friends,
      ...ui,
    }),
    [reading, account, friends, ui]
  );
}
