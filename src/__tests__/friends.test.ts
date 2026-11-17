import { describe, expect, it } from 'vitest';
import { BIBLE_BOOKS, TOTAL_CANON_CHAPTERS } from '../data/bibleCanon';
import { DEFAULT_PREFERENCES } from '../db/repository';
import { evaluateAchievements } from '../lib/achievementsEngine';
import {
  buildDirectorySearchPrefixes,
  buildFriendProfileStats,
  computeFriendStatsSignature,
  decodeBookProgressSpec,
  DEFAULT_FRIEND_PRIVACY,
  deriveBaseUsername,
  encodeBookProgressSpec,
  formatUsernameHandle,
  getFriendCounterpart,
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
import { READING_PLANS } from '../data/readingPlans';
import { computeBibleProgress } from '../lib/progress';
import type { BibleProgressSummary, FriendshipRecord, ReadingLogEntry } from '../types/bible';

function makeLog(
  id: string,
  bookId: string,
  chapters: number[],
  readDate: string,
  note?: string
): ReadingLogEntry {
  return {
    id,
    bookId,
    chapters,
    readDate,
    loggedAt: `${readDate}T08:00:00.000Z`,
    note,
  };
}

describe('usernames, search indexing & pair helpers', () => {
  it('validates and normalizes @username handles safely', () => {
    expect(normalizeUsernameInput('  @Hannah.Miller  ')).toBe('hannah.miller');
    expect(validateUsername('@hannah.miller')).toEqual({ ok: true, username: 'hannah.miller' });
    expect(validateUsername('david_99')).toEqual({ ok: true, username: 'david_99' });
    expect(isValidUsername('hannah.miller')).toBe(true);
    expect(formatUsernameHandle('hannah.miller')).toBe('@hannah.miller');
    expect(formatUsernameHandle(null)).toBeNull();

    // Reject too short, too long, leading/trailing punctuation, consecutive dots, reserved, or invalid chars
    expect(validateUsername('ab').ok).toBe(false);
    expect(validateUsername('a'.repeat(25)).ok).toBe(false);
    expect(validateUsername('.hannah').ok).toBe(false);
    expect(validateUsername('hannah_').ok).toBe(false);
    expect(validateUsername('hannah..m').ok).toBe(false);
    expect(validateUsername('hannah!m').ok).toBe(false);
    expect(validateUsername('admin').ok).toBe(false);
    expect(validateUsername('selah').ok).toBe(false);
  });

  it('derives clean base usernames from display names including international characters', () => {
    expect(deriveBaseUsername('Hannah Miller')).toBe('hannah.miller');
    expect(deriveBaseUsername('José Alvarez')).toBe('jose.alvarez');
    expect(deriveBaseUsername('Dr. Luke!')).toBe('dr.luke');
    expect(deriveBaseUsername('Jo')).toBe('jo.reader');
    expect(deriveBaseUsername('')).toBe('reader');
    expect(deriveBaseUsername('Selah')).toBe('selah.reader');
  });

  it('builds search prefixes for first names, last names, folded accents, and @username segments', () => {
    const prefixes = buildDirectorySearchPrefixes('José Alvarez-Cohen', 'jose.alvarez');
    expect(prefixes).toContain('jo');
    expect(prefixes).toContain('jose');
    expect(prefixes).toContain('josé');
    expect(prefixes).toContain('alvarez');
    expect(prefixes).toContain('cohen');
    expect(prefixes).toContain('jose.alvarez');
    expect(prefixes.length).toBeLessThanOrEqual(60);
  });

  it('matches and ranks Instagram/Facebook-style name and @handle queries', () => {
    const hannah = { displayName: 'Hannah Miller', username: 'hannah.miller' };
    const miriam = { displayName: 'Miriam Cohen', username: 'miriam' };
    const otherMiriam = { displayName: 'Anna Miriam', username: 'anna.reads' };

    expect(normalizeReaderSearchQuery('  @Miriam  ')).toEqual({
      rawTrimmed: '@Miriam',
      isHandleOnly: true,
      cleanQuery: 'miriam',
      tokens: ['miriam'],
    });

    // Multi-word name search narrows matches accurately
    expect(matchesDirectoryQuery(hannah, 'Hannah M')).toBe(true);
    expect(matchesDirectoryQuery(hannah, 'Miller')).toBe(true);
    expect(matchesDirectoryQuery(hannah, 'Hannah Z')).toBe(false);

    // Leading @ filters strictly by username handle
    expect(matchesDirectoryQuery(miriam, '@miriam')).toBe(true);
    expect(matchesDirectoryQuery(otherMiriam, '@miriam')).toBe(false);

    // Exact handle ranks highest, then prefix, then word match
    expect(rankDirectoryMatch(miriam, 'miriam')).toBeLessThan(
      rankDirectoryMatch(otherMiriam, 'miriam')
    );
  });

  it('orders pair IDs symmetrically using ASCII/UTF-8 code point order matching Firestore rules', () => {
    expect(getFriendPairId('uid_b', 'uid_a')).toBe('uid_a_uid_b');
    expect(getFriendPairId('uid_a', 'uid_b')).toBe('uid_a_uid_b');
    // 'Z' (90) < 'a' (97) in UTF-8 code points even though localeCompare puts 'a' before 'Z'
    expect(getOrderedUsersPair('a_uid', 'Z_uid')).toEqual(['Z_uid', 'a_uid']);
    expect(getFriendPairId('a_uid', 'Z_uid')).toBe('Z_uid_a_uid');
  });

  it('sanitizes HTTPS photo URLs safely', () => {
    expect(sanitizeHttpsPhotoUrl('https://lh3.googleusercontent.com/a/avatar')).toBe(
      'https://lh3.googleusercontent.com/a/avatar'
    );
    expect(sanitizeHttpsPhotoUrl('http://example.com/avatar.png')).toBeNull();
    expect(sanitizeHttpsPhotoUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeHttpsPhotoUrl('https://')).toBeNull();
    expect(sanitizeHttpsPhotoUrl(`https://example.com/${'a'.repeat(1000)}`)).toBeNull();
  });

  it('defaults discoverable to true when sanitizing legacy 7-key privacy settings', () => {
    const legacy = sanitizeFriendPrivacy({
      sharingEnabled: false,
      showPhoto: true,
      showStreak: false,
      showRecentBook: true,
      showBookProgress: true,
      showSealsCount: true,
      showActivePlan: false,
    });
    expect(legacy.discoverable).toBe(true);
    expect(legacy.sharingEnabled).toBe(false);
    expect(sanitizeFriendPrivacy({ discoverable: false }).discoverable).toBe(false);
  });
});

describe('bookProgressSpec encoding and friend stats snapshot', () => {
  it('encodes and decodes logged reading summaries accurately', () => {
    const logs: ReadingLogEntry[] = [
      makeLog('l1', 'genesis', [1, 2, 3, 4], '2026-03-01', 'Creation & Eden'),
      makeLog('l2', 'psalms', [1, 23, 119], '2026-03-02'),
      makeLog('l3', 'john', [1, 2], '2026-03-03'),
    ];
    const summary = computeBibleProgress(logs, { todayIso: '2026-03-03' });
    const spec = encodeBookProgressSpec(summary);
    expect(spec).toBe('genesis:4,psalms:3,john:2');
    expect(decodeBookProgressSpec(spec)).toEqual({
      genesis: 4,
      psalms: 3,
      john: 2,
    });
  });

  it('keeps worst-case 66-book full-Bible bookProgressSpec <= 735 bytes and round-trips all 66 books', () => {
    const emptySummary = computeBibleProgress([], { todayIso: '2026-03-03' });
    const fullBookProgress: BibleProgressSummary['bookProgressById'] = {
      ...emptySummary.bookProgressById,
    };

    for (const book of BIBLE_BOOKS) {
      const prev = fullBookProgress[book.id];
      fullBookProgress[book.id] = {
        ...prev,
        readChapters: book.chapterCount,
        totalChapters: book.chapterCount,
        percentage: 100,
        completed: true,
      };
    }

    const fullSummary: BibleProgressSummary = {
      ...emptySummary,
      totalChaptersRead: TOTAL_CANON_CHAPTERS,
      booksCompleted: 66,
      bookProgressById: fullBookProgress,
    };

    const fullSpec = encodeBookProgressSpec(fullSummary);
    expect(fullSpec.length).toBeLessThanOrEqual(735);
    expect(fullSpec.length).toBeLessThan(1000);

    const decoded = decodeBookProgressSpec(fullSpec);
    expect(Object.keys(decoded)).toHaveLength(66);
    for (const book of BIBLE_BOOKS) {
      expect(decoded[book.id]).toBe(book.chapterCount);
    }
  });

  it('ignores unknown books, non-positive values, and clamps oversized counts when decoding', () => {
    expect(decodeBookProgressSpec('notabook:5,jude:99,genesis:-2,exodus:0,ruth:4')).toEqual({
      jude: 1,
      ruth: 4,
    });
    expect(decodeBookProgressSpec(null)).toEqual({});
  });

  it('zeros all stats when sharingEnabled is false and enforces per-field privacy toggles', () => {
    const plans = READING_PLANS;
    const activePlan = plans[0];
    const logs: ReadingLogEntry[] = [
      makeLog('l1', 'jude', [1], '2026-03-03', 'Private note never shared'),
      makeLog('l2', 'philemon', [1], '2026-03-02'),
    ];
    const summary = computeBibleProgress(logs, { todayIso: '2026-03-03' });
    const achievements = evaluateAchievements(logs, summary);

    // Master switch off: everything zeroed/nulled
    const pausedStats = buildFriendProfileStats({
      summary,
      achievements,
      preferences: {
        ...DEFAULT_PREFERENCES,
        activePlanId: activePlan.id,
        friendPrivacy: {
          ...DEFAULT_FRIEND_PRIVACY,
          sharingEnabled: false,
        },
      },
      allPlans: plans,
    });
    expect(pausedStats).toEqual({
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
    });

    // Granular opt-outs: hide bookProgress & activePlan while keeping streak, seals, and recent book
    const selectiveStats = buildFriendProfileStats({
      summary,
      achievements,
      preferences: {
        ...DEFAULT_PREFERENCES,
        activePlanId: activePlan.id,
        friendPrivacy: sanitizeFriendPrivacy({
          sharingEnabled: true,
          showBookProgress: false,
          showActivePlan: false,
          showStreak: true,
          showSealsCount: true,
          showRecentBook: true,
        }),
      },
      allPlans: plans,
    });
    expect(selectiveStats.totalChaptersRead).toBe(0);
    expect(selectiveStats.bookProgressSpec).toBe('');
    expect(selectiveStats.activePlanId).toBeNull();
    expect(selectiveStats.activePlanTitle).toBeNull();
    expect(selectiveStats.currentStreak).toBeGreaterThanOrEqual(2);
    expect(selectiveStats.unlockedSealsCount).toBeGreaterThan(0);
    expect(selectiveStats.lastReadBookId).toBe('jude');
    expect(selectiveStats.lastReadDate).toBe('2026-03-03');
  });

  it('extracts friendship counterpart cleanly with username and computes deterministic stats signatures', () => {
    const friendship: FriendshipRecord = {
      id: 'u1_u2',
      users: ['u1', 'u2'],
      requesterUid: 'u1',
      recipientUid: 'u2',
      requesterName: 'Hannah',
      requesterUsername: 'hannah',
      requesterPhotoURL: null,
      recipientName: 'David',
      recipientUsername: 'david.k',
      recipientPhotoURL: 'https://example.com/david.png',
      status: 'accepted',
      createdAt: '2026-03-01T00:00:00.000Z',
      acceptedAt: '2026-03-01T01:00:00.000Z',
      updatedAt: '2026-03-01T01:00:00.000Z',
    };

    expect(getFriendCounterpart(friendship, 'u1')).toEqual({
      uid: 'u2',
      displayName: 'David',
      username: 'david.k',
      photoURL: 'https://example.com/david.png',
    });
    expect(getFriendCounterpart(friendship, 'u2')).toEqual({
      uid: 'u1',
      displayName: 'Hannah',
      username: 'hannah',
      photoURL: null,
    });

    const sigInput = {
      displayName: 'Hannah',
      photoURL: null,
      username: 'hannah',
      discoverable: true,
      sharingEnabled: true,
      privacy: DEFAULT_FRIEND_PRIVACY,
      stats: {
        totalChaptersRead: 5,
        otChaptersRead: 3,
        ntChaptersRead: 2,
        booksCompleted: 0,
        currentStreak: 2,
        longestStreak: 2,
        unlockedSealsCount: 1,
        lastReadBookId: 'john',
        lastReadDate: '2026-03-03',
        activePlanId: null,
        activePlanTitle: null,
        bookProgressSpec: 'psalms:3,john:2',
      },
    };

    expect(computeFriendStatsSignature(sigInput)).toBe(computeFriendStatsSignature(sigInput));
  });
});
