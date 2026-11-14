import { describe, expect, it } from 'vitest';
import { BIBLE_BOOKS, TOTAL_CANON_CHAPTERS } from '../data/bibleCanon';
import { DEFAULT_PREFERENCES } from '../db/repository';
import { evaluateAchievements } from '../lib/achievementsEngine';
import {
  buildFriendProfileStats,
  computeFriendStatsSignature,
  decodeBookProgressSpec,
  DEFAULT_FRIEND_PRIVACY,
  encodeBookProgressSpec,
  extractInviteCodeFromLocation,
  formatFriendCode,
  FRIEND_CODE_ALPHABET,
  getFriendCounterpart,
  getFriendPairId,
  getOrderedUsersPair,
  generateFriendCode,
  isValidFriendCode,
  normalizeFriendCode,
  sanitizeFriendPrivacy,
  sanitizeHttpsPhotoUrl,
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

describe('friend codes & pair helpers', () => {
  it('generates 8-character codes restricted to the unambiguous Crockford-style alphabet', () => {
    for (let i = 0; i < 60; i++) {
      const code = generateFriendCode();
      expect(code).toHaveLength(8);
      expect(isValidFriendCode(code)).toBe(true);
      expect(code).not.toMatch(/[0O1IL]/);
      for (const ch of code) {
        expect(FRIEND_CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it('normalizes raw codes, SELAH prefixes, whitespace, and full invite URLs', () => {
    expect(normalizeFriendCode('k7m4 p9q2')).toBe('K7M4P9Q2');
    expect(normalizeFriendCode('SELAH-k7m4-p9q2')).toBe('K7M4P9Q2');
    expect(normalizeFriendCode('https://inchbrayock.github.io/Selah/?addFriend=K7M4-P9Q2')).toBe(
      'K7M4P9Q2'
    );
    expect(normalizeFriendCode('http://localhost:5173/?view=friends&addFriend=selah-k7m4p9q2#top')).toBe(
      'K7M4P9Q2'
    );

    // Ambiguous characters (0, O, 1, I, L) and invalid lengths must return null
    expect(normalizeFriendCode('07M4P9Q2')).toBeNull();
    expect(normalizeFriendCode('O7M4P9Q2')).toBeNull();
    expect(normalizeFriendCode('17M4P9Q2')).toBeNull();
    expect(normalizeFriendCode('I7M4P9Q2')).toBeNull();
    expect(normalizeFriendCode('L7M4P9Q2')).toBeNull();
    expect(normalizeFriendCode('K7M4P9Q')).toBeNull();
    expect(normalizeFriendCode('K7M4P9Q2Z')).toBeNull();
    expect(normalizeFriendCode('')).toBeNull();
  });

  it('formats 8-character friend codes as XXXX-XXXX', () => {
    expect(formatFriendCode('k7m4p9q2')).toBe('K7M4-P9Q2');
    expect(formatFriendCode('K7M4-P9Q2')).toBe('K7M4-P9Q2');
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

  it('extracts invite codes from query search strings', () => {
    expect(extractInviteCodeFromLocation('?addFriend=K7M4-P9Q2')).toBe('K7M4P9Q2');
    expect(extractInviteCodeFromLocation('?addFriend=invalid')).toBeNull();
    expect(extractInviteCodeFromLocation('')).toBeNull();
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

  it('extracts friendship counterpart cleanly and computes deterministic stats signatures', () => {
    const friendship: FriendshipRecord = {
      id: 'u1_u2',
      users: ['u1', 'u2'],
      requesterUid: 'u1',
      recipientUid: 'u2',
      requesterName: 'Hannah',
      requesterPhotoURL: null,
      recipientName: 'David',
      recipientPhotoURL: 'https://example.com/david.png',
      status: 'accepted',
      createdAt: '2026-03-01T00:00:00.000Z',
      acceptedAt: '2026-03-01T01:00:00.000Z',
      updatedAt: '2026-03-01T01:00:00.000Z',
    };

    expect(getFriendCounterpart(friendship, 'u1')).toEqual({
      uid: 'u2',
      displayName: 'David',
      photoURL: 'https://example.com/david.png',
    });
    expect(getFriendCounterpart(friendship, 'u2')).toEqual({
      uid: 'u1',
      displayName: 'Hannah',
      photoURL: null,
    });

    const sigInput = {
      displayName: 'Hannah',
      photoURL: null,
      friendCode: 'K7M4P9Q2',
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
