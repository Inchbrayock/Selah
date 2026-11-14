import { BIBLE_BOOKS, BOOKS_BY_ID } from '../data/bibleCanon';
import type {
  AchievementStatus,
  BibleProgressSummary,
  FriendPrivacySettings,
  FriendProfile,
  FriendStatsSnapshot,
  FriendshipRecord,
  ReadingPlan,
  UserPreferences,
} from '../types/bible';
import { isNativePlatform } from './nativeShell';

/** Unambiguous 31-character alphabet (omits 0, O, 1, I, L) for manual code entry. */
export const FRIEND_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const FRIEND_CODE_REGEX = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

export const DEFAULT_FRIEND_PRIVACY: FriendPrivacySettings = {
  sharingEnabled: true,
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

export function generateFriendCode(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += FRIEND_CODE_ALPHABET[bytes[i] % FRIEND_CODE_ALPHABET.length];
  }
  return out;
}

export function isValidFriendCode(code: string): boolean {
  return FRIEND_CODE_REGEX.test(code);
}

/**
 * Normalizes a pasted friend code or invite URL (e.g., `K7M4-P9Q2`, `SELAH-K7M4-P9Q2`,
 * or `https://.../?addFriend=K7M4-P9Q2`) into an uppercase 8-character code, or `null` if invalid.
 */
export function normalizeFriendCode(raw: string): string | null {
  let candidate = raw.trim();
  if (!candidate) return null;

  const queryMatch = candidate.match(/[?&]addFriend=([^&#\s]+)/i);
  if (queryMatch?.[1]) {
    try {
      candidate = decodeURIComponent(queryMatch[1]);
    } catch {
      candidate = queryMatch[1];
    }
  }

  candidate = candidate.toUpperCase().replace(/^SELAH[-_\s]*/i, '');
  candidate = candidate.replace(/[\s-]+/g, '');

  return FRIEND_CODE_REGEX.test(candidate) ? candidate : null;
}

export function formatFriendCode(code: string): string {
  const clean = code.trim().toUpperCase().replace(/[\s-]+/g, '');
  if (clean.length === 8) {
    return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  }
  return clean;
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
): { uid: string; displayName: string; photoURL: string | null } {
  const isRequester = friendship.requesterUid === myUid;
  return {
    uid: isRequester ? friendship.recipientUid : friendship.requesterUid,
    displayName: isRequester ? friendship.recipientName : friendship.requesterName,
    photoURL: isRequester ? friendship.recipientPhotoURL : friendship.requesterPhotoURL,
  };
}

export function buildFriendInviteUrl(code: string): string {
  const formatted = formatFriendCode(code);
  const configuredBase = import.meta.env?.VITE_PUBLIC_APP_URL;
  if (typeof configuredBase === 'string' && /^https?:\/\//i.test(configuredBase)) {
    const base = configuredBase.replace(/\/+$/, '');
    return `${base}/?addFriend=${encodeURIComponent(formatted)}`;
  }
  if (
    !isNativePlatform() &&
    typeof window !== 'undefined' &&
    /^https?:$/i.test(window.location.protocol)
  ) {
    const cleanPath = window.location.pathname || '/';
    return `${window.location.origin}${cleanPath}?addFriend=${encodeURIComponent(formatted)}`;
  }
  return `https://inchbrayock.github.io/Selah/?addFriend=${encodeURIComponent(formatted)}`;
}

export function extractInviteCodeFromLocation(search: string): string | null {
  if (!search) return null;
  try {
    const params = new URLSearchParams(search);
    const raw = params.get('addFriend');
    return raw ? normalizeFriendCode(raw) : null;
  } catch {
    return null;
  }
}

export function computeFriendStatsSignature(profile: Pick<
  FriendProfile,
  'displayName' | 'photoURL' | 'friendCode' | 'sharingEnabled' | 'privacy' | 'stats'
>): string {
  return JSON.stringify({
    displayName: profile.displayName,
    photoURL: profile.photoURL,
    friendCode: profile.friendCode,
    sharingEnabled: profile.sharingEnabled,
    privacy: profile.privacy,
    stats: profile.stats,
  });
}
