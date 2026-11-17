import { BIBLE_BOOKS, BOOKS_BY_ID } from '../data/bibleCanon';
import type {
  AchievementStatus,
  BibleProgressSummary,
  FriendPrivacySettings,
  FriendProfile,
  FriendStatsSnapshot,
  FriendshipRecord,
  ReaderDirectoryEntry,
  ReadingPlan,
  UserPreferences,
} from '../types/bible';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 24;
export const USERNAME_REGEX = /^[a-z0-9][a-z0-9._]{1,22}[a-z0-9]$/;
export const MAX_SEARCH_PREFIXES = 60;

const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'selah',
  'support',
  'system',
  'moderator',
  'staff',
  'official',
  'help',
  'null',
  'undefined',
  'anonymous',
  'guest',
]);

export const DEFAULT_FRIEND_PRIVACY: FriendPrivacySettings = {
  sharingEnabled: true,
  discoverable: true,
  showPhoto: true,
  showStreak: true,
  showRecentBook: true,
  showBookProgress: true,
  showSealsCount: true,
  showActivePlan: true,
};

export function sanitizeFriendPrivacy(
  input?: Partial<FriendPrivacySettings> | null
): FriendPrivacySettings {
  return {
    sharingEnabled:
      typeof input?.sharingEnabled === 'boolean'
        ? input.sharingEnabled
        : DEFAULT_FRIEND_PRIVACY.sharingEnabled,
    discoverable:
      typeof input?.discoverable === 'boolean'
        ? input.discoverable
        : DEFAULT_FRIEND_PRIVACY.discoverable,
    showPhoto:
      typeof input?.showPhoto === 'boolean' ? input.showPhoto : DEFAULT_FRIEND_PRIVACY.showPhoto,
    showStreak:
      typeof input?.showStreak === 'boolean' ? input.showStreak : DEFAULT_FRIEND_PRIVACY.showStreak,
    showRecentBook:
      typeof input?.showRecentBook === 'boolean'
        ? input.showRecentBook
        : DEFAULT_FRIEND_PRIVACY.showRecentBook,
    showBookProgress:
      typeof input?.showBookProgress === 'boolean'
        ? input.showBookProgress
        : DEFAULT_FRIEND_PRIVACY.showBookProgress,
    showSealsCount:
      typeof input?.showSealsCount === 'boolean'
        ? input.showSealsCount
        : DEFAULT_FRIEND_PRIVACY.showSealsCount,
    showActivePlan:
      typeof input?.showActivePlan === 'boolean'
        ? input.showActivePlan
        : DEFAULT_FRIEND_PRIVACY.showActivePlan,
  };
}

export function normalizeUsernameInput(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export function isValidUsername(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length < USERNAME_MIN_LENGTH || value.length > USERNAME_MAX_LENGTH) return false;
  if (!USERNAME_REGEX.test(value)) return false;
  if (value.includes('..')) return false;
  if (RESERVED_USERNAMES.has(value)) return false;
  return true;
}

export function validateUsername(
  raw: string
): { ok: true; username: string } | { ok: false; error: string } {
  const normalized = normalizeUsernameInput(raw);
  if (!normalized) {
    return { ok: false, error: 'Enter a username (3 to 24 characters).' };
  }
  if (normalized.length < USERNAME_MIN_LENGTH) {
    return {
      ok: false,
      error: `Username must be at least ${USERNAME_MIN_LENGTH} characters.`,
    };
  }
  if (normalized.length > USERNAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Username must be ${USERNAME_MAX_LENGTH} characters or fewer.`,
    };
  }
  if (/[^a-z0-9._]/.test(normalized)) {
    return {
      ok: false,
      error: 'Use only lowercase letters, numbers, periods, and underscores.',
    };
  }
  if (!/^[a-z0-9]/.test(normalized) || !/[a-z0-9]$/.test(normalized)) {
    return {
      ok: false,
      error: 'Start and end your username with a letter or number.',
    };
  }
  if (normalized.includes('..')) {
    return {
      ok: false,
      error: 'Username cannot include consecutive periods.',
    };
  }
  if (RESERVED_USERNAMES.has(normalized)) {
    return {
      ok: false,
      error: 'That username is reserved. Choose another.',
    };
  }
  return { ok: true, username: normalized };
}

export function formatUsernameHandle(username: string | null | undefined): string | null {
  if (!username) return null;
  const clean = normalizeUsernameInput(username);
  return isValidUsername(clean) ? `@${clean}` : null;
}

function foldForSearch(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function deriveBaseUsername(displayName: string): string {
  const folded = foldForSearch(displayName)
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 18)
    .replace(/^\.+|\.+$/g, '');

  if (folded.length >= USERNAME_MIN_LENGTH && isValidUsername(folded)) {
    return folded;
  }
  if (folded.length >= 1) {
    const padded = `${folded}.reader`.slice(0, 18).replace(/^\.+|\.+$/g, '');
    if (isValidUsername(padded)) return padded;
  }
  return 'reader';
}

export function buildDirectorySearchPrefixes(
  displayName: string,
  username: string | null
): string[] {
  const seen = new Set<string>();

  const addPrefixesForToken = (token: string, minPrefix = 2) => {
    const clean = token.trim().slice(0, 32);
    if (!clean) return;
    const startLen = Math.min(clean.length, minPrefix);
    for (let len = startLen; len <= clean.length; len++) {
      if (seen.size >= MAX_SEARCH_PREFIXES) return;
      seen.add(clean.slice(0, len));
    }
  };

  const lowerName = displayName.trim().toLowerCase();
  const foldedName = foldForSearch(displayName.trim());

  const words = [
    ...lowerName.split(/[\s\-_/.,'’]+/).filter(Boolean),
    ...foldedName.split(/[\s\-_/.,'’]+/).filter(Boolean),
  ].slice(0, 8);

  for (const word of words) {
    addPrefixesForToken(word, 2);
  }

  if (lowerName.length >= 2) {
    addPrefixesForToken(lowerName, 2);
  }
  if (foldedName.length >= 2 && foldedName !== lowerName) {
    addPrefixesForToken(foldedName, 2);
  }

  if (username) {
    const cleanHandle = normalizeUsernameInput(username);
    addPrefixesForToken(cleanHandle, 2);
    for (const seg of cleanHandle.split(/[._]+/).filter(Boolean)) {
      addPrefixesForToken(seg, 2);
    }
  }

  return [...seen].slice(0, MAX_SEARCH_PREFIXES);
}

export function normalizeReaderSearchQuery(raw: string): {
  rawTrimmed: string;
  isHandleOnly: boolean;
  cleanQuery: string;
  tokens: string[];
} {
  const rawTrimmed = raw.trim();
  const isHandleOnly = rawTrimmed.startsWith('@');
  const cleanQuery = rawTrimmed.replace(/^@+/, '').toLowerCase();
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);
  return { rawTrimmed, isHandleOnly, cleanQuery, tokens };
}

export function matchesDirectoryQuery(
  entry: Pick<ReaderDirectoryEntry, 'displayName' | 'username'>,
  rawQuery: string
): boolean {
  const { isHandleOnly, cleanQuery, tokens } = normalizeReaderSearchQuery(rawQuery);
  if (!cleanQuery) return true;

  const username = entry.username ? entry.username.toLowerCase() : '';
  if (isHandleOnly) {
    return Boolean(username && username.includes(cleanQuery));
  }

  const nameLower = entry.displayName.toLowerCase();
  const nameFolded = foldForSearch(entry.displayName);
  const combined = `${nameLower} ${nameFolded} ${username}`;
  return tokens.every((token) => {
    const foldedTok = foldForSearch(token);
    return combined.includes(token) || combined.includes(foldedTok);
  });
}

export function rankDirectoryMatch(
  entry: Pick<ReaderDirectoryEntry, 'displayName' | 'username'>,
  rawQuery: string
): number {
  const { isHandleOnly, cleanQuery } = normalizeReaderSearchQuery(rawQuery);
  const foldedQuery = foldForSearch(cleanQuery);
  const username = entry.username ? entry.username.toLowerCase() : '';
  const nameLower = entry.displayName.trim().toLowerCase();
  const nameFolded = foldForSearch(entry.displayName.trim());

  if (username && username === cleanQuery) return 0;
  if (!isHandleOnly && (nameLower === cleanQuery || nameFolded === foldedQuery)) return 1;
  if (username && username.startsWith(cleanQuery)) return 2;
  if (!isHandleOnly && (nameLower.startsWith(cleanQuery) || nameFolded.startsWith(foldedQuery))) {
    return 3;
  }

  const nameWords = [...nameLower.split(/[\s\-_/.,'’]+/), ...nameFolded.split(/[\s\-_/.,'’]+/)];
  const handleSegs = username ? username.split(/[._]+/) : [];
  if (
    handleSegs.some((s) => s.startsWith(cleanQuery)) ||
    (!isHandleOnly && nameWords.some((w) => w.startsWith(cleanQuery) || w.startsWith(foldedQuery)))
  ) {
    return 4;
  }
  return 5;
}

export function getOrderedUsersPair(uidA: string, uidB: string): [string, string] {
  return uidA < uidB ? [uidA, uidB] : [uidB, uidA];
}

export function getFriendPairId(uidA: string, uidB: string): string {
  const [low, high] = getOrderedUsersPair(uidA, uidB);
  return `${low}_${high}`;
}

export function sanitizeHttpsPhotoUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed.length <= 8 || trimmed.length > 1000) return null;
  return trimmed.startsWith('https://') ? trimmed : null;
}

/**
 * Encodes non-zero per-book read counts in canonical order (`genesis:50,exodus:12`).
 * Full 66-book worst-case string length is <= 735 characters.
 */
export function encodeBookProgressSpec(summary: BibleProgressSummary): string {
  const parts: string[] = [];
  for (const book of BIBLE_BOOKS) {
    const read = summary.bookProgressById[book.id]?.readChapters ?? 0;
    const clamped = Math.max(0, Math.min(book.chapterCount, Math.round(read)));
    if (clamped > 0) {
      parts.push(`${book.id}:${clamped}`);
    }
  }
  return parts.join(',');
}

export function decodeBookProgressSpec(spec: unknown): Record<string, number> {
  const counts: Record<string, number> = {};
  if (typeof spec !== 'string' || !spec.trim()) return counts;

  for (const token of spec.split(',')) {
    const colonIdx = token.indexOf(':');
    if (colonIdx <= 0) continue;
    const bookId = token.slice(0, colonIdx).trim();
    const book = BOOKS_BY_ID[bookId];
    if (!book) continue;
    const rawCount = Number.parseInt(token.slice(colonIdx + 1), 10);
    if (!Number.isFinite(rawCount) || rawCount <= 0) continue;
    counts[bookId] = Math.min(book.chapterCount, rawCount);
  }
  return counts;
}

export function computeLastReadDate(summary: BibleProgressSummary): string | null {
  let latest: string | null = null;
  for (const book of BIBLE_BOOKS) {
    const bp = summary.bookProgressById[book.id];
    if (!bp) continue;
    for (const state of Object.values(bp.chapterMap)) {
      if (state.lastReadDate && (!latest || state.lastReadDate > latest)) {
        latest = state.lastReadDate;
      }
    }
  }
  return latest;
}

export function buildFriendProfileStats(params: {
  summary: BibleProgressSummary;
  achievements: AchievementStatus[];
  preferences: UserPreferences;
  allPlans: ReadingPlan[];
}): FriendStatsSnapshot {
  const privacy = sanitizeFriendPrivacy(params.preferences.friendPrivacy);
  if (!privacy.sharingEnabled) {
    return {
      totalChaptersRead: 0,
      otChaptersRead: 0,
      ntChaptersRead: 0,
      booksCompleted: 0,
      currentStreak: 0,
      longestStreak: 0,
      unlockedSealsCount: 0,
      lastReadBookId: null,
      lastReadDate: null,
      activePlanId: null,
      activePlanTitle: null,
      bookProgressSpec: '',
    };
  }

  const activePlan =
    privacy.showActivePlan && params.preferences.activePlanId
      ? params.allPlans.find((p) => p.id === params.preferences.activePlanId) ?? null
      : null;

  const unlockedSealsCount = privacy.showSealsCount
    ? params.achievements.filter((a) => a.unlocked).length
    : 0;

  return {
    totalChaptersRead: privacy.showBookProgress
      ? Math.max(0, Math.min(1189, Math.round(params.summary.totalChaptersRead)))
      : 0,
    otChaptersRead: privacy.showBookProgress
      ? Math.max(0, Math.min(929, Math.round(params.summary.otChaptersRead)))
      : 0,
    ntChaptersRead: privacy.showBookProgress
      ? Math.max(0, Math.min(260, Math.round(params.summary.ntChaptersRead)))
      : 0,
    booksCompleted: privacy.showBookProgress
      ? Math.max(0, Math.min(66, Math.round(params.summary.booksCompleted)))
      : 0,
    currentStreak: privacy.showStreak
      ? Math.max(0, Math.min(20000, Math.round(params.summary.currentStreak)))
      : 0,
    longestStreak: privacy.showStreak
      ? Math.max(0, Math.min(20000, Math.round(params.summary.longestStreak)))
      : 0,
    unlockedSealsCount: Math.max(0, Math.min(100, unlockedSealsCount)),
    lastReadBookId:
      privacy.showRecentBook &&
      params.summary.lastReadBookId &&
      BOOKS_BY_ID[params.summary.lastReadBookId]
        ? params.summary.lastReadBookId
        : null,
    lastReadDate: privacy.showRecentBook ? computeLastReadDate(params.summary) : null,
    activePlanId: activePlan ? activePlan.id.slice(0, 64) : null,
    activePlanTitle: activePlan ? activePlan.title.slice(0, 80) : null,
    bookProgressSpec: privacy.showBookProgress ? encodeBookProgressSpec(params.summary) : '',
  };
}

export function getFriendCounterpart(
  friendship: FriendshipRecord,
  myUid: string
): { uid: string; displayName: string; username: string | null; photoURL: string | null } {
  const isRequester = friendship.requesterUid === myUid;
  const rawUsername = isRequester ? friendship.recipientUsername : friendship.requesterUsername;
  return {
    uid: isRequester ? friendship.recipientUid : friendship.requesterUid,
    displayName: isRequester ? friendship.recipientName : friendship.requesterName,
    username: isValidUsername(rawUsername) ? rawUsername : null,
    photoURL: isRequester ? friendship.recipientPhotoURL : friendship.requesterPhotoURL,
  };
}

export function computeFriendStatsSignature(
  profile: Pick<
    FriendProfile,
    'displayName' | 'photoURL' | 'username' | 'discoverable' | 'sharingEnabled' | 'privacy' | 'stats'
  >
): string {
  return JSON.stringify({
    displayName: profile.displayName,
    photoURL: profile.photoURL,
    username: profile.username,
    discoverable: profile.discoverable,
    sharingEnabled: profile.sharingEnabled,
    privacy: profile.privacy,
    stats: profile.stats,
  });
}
