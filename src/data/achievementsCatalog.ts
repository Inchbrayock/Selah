import { BIBLE_BOOKS, NT_BOOKS, OT_BOOKS } from './bibleCanon';
import { comparePlainDates, diffCalendarDays, getDayOfWeek, getLocalHourFromIsoInstant } from '../lib/dates';
import { countConsecutiveSundays } from '../lib/progress';
import type {
  AchievementDefinition,
  AchievementEvalContext,
  FellowshipStatsCounters,
} from '../types/bible';

const DIVISION_BOOK_IDS: Record<string, string[]> = {};
for (const book of BIBLE_BOOKS) {
  (DIVISION_BOOK_IDS[book.division] ??= []).push(book.id);
}
const OT_BOOK_IDS = OT_BOOKS.map((b) => b.id);
const NT_BOOK_IDS = NT_BOOKS.map((b) => b.id);
const PROPHET_BOOK_IDS = [
  ...(DIVISION_BOOK_IDS['major-prophets'] ?? []),
  ...(DIVISION_BOOK_IDS['minor-prophets'] ?? []),
];

function latestLogDate(ctx: AchievementEvalContext): string | null {
  if (ctx.latestLogDate !== undefined) return ctx.latestLogDate;
  let latest: string | null = null;
  for (const log of ctx.logs) {
    if (!latest || log.readDate > latest) {
      latest = log.readDate;
    }
  }
  return latest;
}

function getSortedLogsAsc(ctx: AchievementEvalContext) {
  return (
    ctx.sortedLogsAsc ?? [...ctx.logs].sort((a, b) => comparePlainDates(a.readDate, b.readDate))
  );
}

function nthConsecutiveSundayDate(ctx: AchievementEvalContext, targetCount: number): string | null {
  if (targetCount === 4 && ctx.consecutiveSundays) {
    return ctx.consecutiveSundays.fourthDate;
  }
  const sundays = Array.from(
    new Set(ctx.logs.filter((l) => getDayOfWeek(l.readDate) === 7).map((l) => l.readDate))
  ).sort();
  if (sundays.length === 0) return null;
  let run = 1;
  if (targetCount <= 1) return sundays[0];
  for (let i = 1; i < sundays.length; i++) {
    if (diffCalendarDays(sundays[i - 1], sundays[i]) === 7) {
      run += 1;
      if (run >= targetCount) return sundays[i];
    } else {
      run = 1;
    }
  }
  return null;
}

function latestReadDateForChapters(
  ctx: AchievementEvalContext,
  requirements: { bookId: string; chapters?: number[] }[]
): string | null {
  let latest: string | null = null;
  for (const req of requirements) {
    const bp = ctx.summary.bookProgressById[req.bookId];
    if (!bp) return null;
    if (req.chapters) {
      for (const ch of req.chapters) {
        const state = bp.chapterMap[ch];
        if (!state) return null;
        if (!latest || state.firstReadDate > latest) {
          latest = state.firstReadDate;
        }
      }
    } else {
      for (let ch = 1; ch <= bp.totalChapters; ch++) {
        const state = bp.chapterMap[ch];
        if (!state) return null;
        if (!latest || state.firstReadDate > latest) {
          latest = state.firstReadDate;
        }
      }
    }
  }
  return latest;
}

function evaluateBooksCompletion(
  ctx: AchievementEvalContext,
  bookIds: string[]
): { current: number; unlockedAt: string | null } {
  let completed = 0;
  for (const id of bookIds) {
    if (ctx.summary.bookProgressById[id]?.completed) {
      completed += 1;
    }
  }
  const unlockedAt =
    completed === bookIds.length
      ? latestReadDateForChapters(
          ctx,
          bookIds.map((bookId) => ({ bookId }))
        )
      : null;
  return { current: completed, unlockedAt };
}

function evaluateChapterThreshold(
  ctx: AchievementEvalContext,
  threshold: number
): { current: number; unlockedAt: string | null } {
  const uniqueRead = ctx.summary.totalChaptersRead;
  if (uniqueRead < threshold) {
    return { current: uniqueRead, unlockedAt: null };
  }
  const precomputed = ctx.chapterThresholdDates?.get(threshold);
  if (precomputed) {
    return { current: threshold, unlockedAt: precomputed };
  }
  const seen = new Set<string>();
  const sorted = getSortedLogsAsc(ctx);
  for (const log of sorted) {
    for (const ch of log.chapters) {
      seen.add(`${log.bookId}:${ch}`);
      if (seen.size >= threshold) {
        return { current: threshold, unlockedAt: log.readDate };
      }
    }
  }
  return { current: uniqueRead, unlockedAt: null };
}

function evaluateSingleDayChapterCount(
  ctx: AchievementEvalContext,
  targetCount: number
): { current: number; unlockedAt: string | null } {
  const byDate: Record<string, Set<string>> = {};
  for (const log of ctx.logs) {
    if (!byDate[log.readDate]) byDate[log.readDate] = new Set();
    for (const ch of log.chapters) {
      byDate[log.readDate].add(`${log.bookId}:${ch}`);
    }
  }

  let best = 0;
  let unlockedAt: string | null = null;
  for (const date of Object.keys(byDate).sort()) {
    const count = byDate[date].size;
    if (count > best) best = count;
    if (count >= targetCount && !unlockedAt) {
      unlockedAt = date;
    }
  }

  return { current: Math.min(best, targetCount), unlockedAt };
}

export const ACHIEVEMENTS_CATALOG: AchievementDefinition[] = [
  // ── Volume & Milestones ──────────────────────────────────────────
  {
    id: 'first-scroll',
    title: 'Open the Scroll',
    subtitle: 'First Chapter Logged',
    description: 'Log your very first chapter of Scripture.',
    scriptureEcho: '“Your word is a lamp to my feet and a light to my path.” — Ps 119:105',
    tier: 'bronze',
    category: 'milestones',
    motif: 'scroll',
    target: 1,
    evaluate: (ctx) => evaluateChapterThreshold(ctx, 1),
  },
  {
    id: 'ten-chapters',
    title: 'Kindled Ember',
    subtitle: '10 Unique Chapters',
    description: 'Read and log 10 distinct chapters of the Bible.',
    scriptureEcho: '“Faith comes from hearing, and hearing through the word of Christ.” — Rom 10:17',
    tier: 'bronze',
    category: 'milestones',
    motif: 'lamp',
    target: 10,
    evaluate: (ctx) => evaluateChapterThreshold(ctx, 10),
  },
  {
    id: 'fifty-chapters',
    title: 'Steadfast Seeker',
    subtitle: '50 Unique Chapters',
    description: 'Read and log 50 distinct chapters across Scripture.',
    scriptureEcho: '“Blessed are those who hunger and thirst for righteousness.” — Matt 5:6',
    tier: 'bronze',
    category: 'milestones',
    motif: 'compass',
    target: 50,
    evaluate: (ctx) => evaluateChapterThreshold(ctx, 50),
  },
  {
    id: 'hundred-chapters',
    title: 'Centurion of the Word',
    subtitle: '100 Unique Chapters',
    description: 'Read and log 100 distinct chapters across the Bible.',
    scriptureEcho: '“Let the word of Christ dwell in you richly.” — Col 3:16',
    tier: 'silver',
    category: 'milestones',
    motif: 'shield',
    target: 100,
    evaluate: (ctx) => evaluateChapterThreshold(ctx, 100),
  },
  {
    id: 'quarter-canon',
    title: 'Quarter Pilgrim',
    subtitle: '300 Unique Chapters',
    description: 'Cross the 300-chapter milestone—more than a quarter of the Bible.',
    scriptureEcho: '“My soul clings to you; your right hand upholds me.” — Ps 63:8',
    tier: 'silver',
    category: 'milestones',
    motif: 'star',
    target: 300,
    evaluate: (ctx) => evaluateChapterThreshold(ctx, 300),
  },
  {
    id: 'half-canon',
    title: 'Midday Meridian',
    subtitle: '600 Unique Chapters',
    description: 'Pass the halfway mark of the entire biblical canon.',
    scriptureEcho: '“The path of the righteous is like the light of dawn, shining brighter.” — Prov 4:18',
    tier: 'gold',
    category: 'milestones',
    motif: 'sunrise',
    target: 600,
    evaluate: (ctx) => evaluateChapterThreshold(ctx, 600),
  },
  {
    id: 'thousand-chapters',
    title: 'Millennium Lantern',
    subtitle: '1,000 Unique Chapters',
    description: 'Reach 1,000 chapters read—only 189 left to complete the whole canon.',
    scriptureEcho: '“Forever, O Lord, your word is firmly fixed in the heavens.” — Ps 119:89',
    tier: 'gold',
    category: 'milestones',
    motif: 'flame',
    target: 1000,
    evaluate: (ctx) => evaluateChapterThreshold(ctx, 1000),
  },
  {
    id: 'alpha-and-omega',
    title: 'Alpha & Omega',
    subtitle: 'Complete Bible (1,189 Chapters)',
    description: 'Read every chapter of all 66 books from Genesis to Revelation.',
    scriptureEcho: '“I am the Alpha and the Omega, the beginning and the end.” — Rev 21:6',
    tier: 'luminous',
    category: 'milestones',
    motif: 'alpha-omega',
    target: 1189,
    evaluate: (ctx) => evaluateChapterThreshold(ctx, 1189),
  },

  // ── Books & Divisions ────────────────────────────────────────────
  {
    id: 'in-the-beginning',
    title: 'In the Beginning',
    subtitle: 'Book of Genesis',
    description: 'Complete all 50 chapters of Genesis.',
    scriptureEcho: '“In the beginning, God created the heavens and the earth.” — Gen 1:1',
    tier: 'silver',
    category: 'divisions',
    motif: 'scroll',
    target: 1,
    evaluate: (ctx) => evaluateBooksCompletion(ctx, ['genesis']),
  },
  {
    id: 'the-lawgiver',
    title: 'Keeper of the Torah',
    subtitle: 'All 5 Books of the Pentateuch',
    description: 'Complete Genesis, Exodus, Leviticus, Numbers, and Deuteronomy.',
    scriptureEcho: '“This Book of the Law shall not depart from your mouth.” — Josh 1:8',
    tier: 'gold',
    category: 'divisions',
    motif: 'tablets',
    target: 5,
    evaluate: (ctx) => evaluateBooksCompletion(ctx, DIVISION_BOOK_IDS['pentateuch'] ?? []),
  },
  {
    id: 'chronicles-of-kings',
    title: 'Chronicler of Covenants',
    subtitle: 'All 12 Historical Books',
    description: 'Complete Joshua through Esther.',
    scriptureEcho: '“Remember his wondrous works that he has done.” — 1 Chr 16:12',
    tier: 'gold',
    category: 'divisions',
    motif: 'crown',
    target: 12,
    evaluate: (ctx) => evaluateBooksCompletion(ctx, DIVISION_BOOK_IDS['history'] ?? []),
  },
  {
    id: 'sweet-psalmist',
    title: 'Sweet Psalmist',
    subtitle: 'All 150 Psalms',
    description: 'Complete the entire book of Psalms from Psalm 1 to Psalm 150.',
    scriptureEcho: '“Sing to the Lord a new song; sing to the Lord, all the earth!” — Ps 96:1',
    tier: 'gold',
    category: 'divisions',
    motif: 'harp',
    target: 150,
    evaluate: (ctx) => {
      const ps = ctx.summary.bookProgressById['psalms'];
      const unlockedAt = ps?.completed
        ? latestReadDateForChapters(ctx, [{ bookId: 'psalms' }])
        : null;
      return { current: ps?.readChapters ?? 0, unlockedAt };
    },
  },
  {
    id: 'wisdom-seeker',
    title: 'Wellspring of Wisdom',
    subtitle: 'All 5 Wisdom & Poetry Books',
    description: 'Complete Job, Psalms, Proverbs, Ecclesiastes, and Song of Solomon.',
    scriptureEcho: '“The fear of the Lord is the beginning of wisdom.” — Prov 9:10',
    tier: 'gold',
    category: 'divisions',
    motif: 'lamp',
    target: 5,
    evaluate: (ctx) => evaluateBooksCompletion(ctx, DIVISION_BOOK_IDS['wisdom'] ?? []),
  },
  {
    id: 'voice-of-prophets',
    title: 'Watchman on the Wall',
    subtitle: 'Major & Minor Prophets (17 Books)',
    description: 'Complete all 17 prophetic books from Isaiah through Malachi.',
    scriptureEcho: '“Here am I! Send me.” — Isa 6:8',
    tier: 'luminous',
    category: 'divisions',
    motif: 'flame',
    target: 17,
    evaluate: (ctx) => evaluateBooksCompletion(ctx, PROPHET_BOOK_IDS),
  },
  {
    id: 'witness-of-gospels',
    title: 'Fourfold Witness',
    subtitle: 'Matthew, Mark, Luke & John',
    description: 'Complete all four Gospels tracing the life, death, and resurrection of Jesus.',
    scriptureEcho: '“And the Word became flesh and dwelt among us.” — John 1:14',
    tier: 'gold',
    category: 'divisions',
    motif: 'dove',
    target: 4,
    evaluate: (ctx) => evaluateBooksCompletion(ctx, ['matthew', 'mark', 'luke', 'john']),
  },
  {
    id: 'pauline-letters',
    title: 'Messenger to the Churches',
    subtitle: 'All 13 Pauline Epistles',
    description: 'Complete Romans through Philemon.',
    scriptureEcho: '“I have fought the good fight, I have finished the race.” — 2 Tim 4:7',
    tier: 'gold',
    category: 'divisions',
    motif: 'quill',
    target: 13,
    evaluate: (ctx) => evaluateBooksCompletion(ctx, DIVISION_BOOK_IDS['pauline'] ?? []),
  },
  {
    id: 'new-testament-crown',
    title: 'New Covenant Crown',
    subtitle: 'Complete New Testament (27 Books)',
    description: 'Complete every book of the New Testament from Matthew to Revelation.',
    scriptureEcho: '“Grace to you and peace from him who is and who was and who is to come.” — Rev 1:4',
    tier: 'luminous',
    category: 'divisions',
    motif: 'crown',
    target: 27,
    evaluate: (ctx) => evaluateBooksCompletion(ctx, NT_BOOK_IDS),
  },
  {
    id: 'old-testament-pillar',
    title: 'Pillar of the Covenant',
    subtitle: 'Complete Old Testament (39 Books)',
    description: 'Complete every book of the Old Testament from Genesis to Malachi.',
    scriptureEcho: '“The steadfast love of the Lord never ceases.” — Lam 3:22',
    tier: 'luminous',
    category: 'divisions',
    motif: 'tablets',
    target: 39,
    evaluate: (ctx) => evaluateBooksCompletion(ctx, OT_BOOK_IDS),
  },

  // ── Consistency & Rhythm ─────────────────────────────────────────
  {
    id: 'first-book-finished',
    title: 'Finisher’s Seal',
    subtitle: 'First Complete Book',
    description: 'Read every chapter of any single book of the Bible.',
    scriptureEcho: '“Better is the end of a thing than its beginning.” — Eccl 7:8',
    tier: 'bronze',
    category: 'consistency',
    motif: 'star',
    target: 1,
    evaluate: (ctx) => {
      const count = ctx.summary.booksCompleted;
      let firstDate: string | null = null;
      if (count >= 1) {
        for (const book of BIBLE_BOOKS) {
          if (ctx.summary.bookProgressById[book.id]?.completed) {
            const d = latestReadDateForChapters(ctx, [{ bookId: book.id }]);
            if (d && (!firstDate || d < firstDate)) firstDate = d;
          }
        }
      }
      return { current: Math.min(count, 1), unlockedAt: firstDate };
    },
  },
  {
    id: 'sevenfold-light',
    title: 'Sevenfold Light',
    subtitle: '7-Day Reading Streak',
    description: 'Maintain a reading rhythm across 7 days.',
    scriptureEcho: '“Give us each day our daily bread.” — Luke 11:3',
    tier: 'bronze',
    category: 'consistency',
    motif: 'lamp',
    target: 7,
    evaluate: (ctx) => ({
      current: Math.min(ctx.summary.longestStreak, 7),
      unlockedAt: ctx.summary.longestStreak >= 7 ? latestLogDate(ctx) : null,
    }),
  },
  {
    id: 'moon-of-devotion',
    title: 'Moon of Devotion',
    subtitle: '30-Day Reading Streak',
    description: 'Keep your reading lamp burning for a 30-day streak.',
    scriptureEcho: '“On his law he meditates day and night.” — Ps 1:2',
    tier: 'silver',
    category: 'consistency',
    motif: 'moon',
    target: 30,
    evaluate: (ctx) => ({
      current: Math.min(ctx.summary.longestStreak, 30),
      unlockedAt: ctx.summary.longestStreak >= 30 ? latestLogDate(ctx) : null,
    }),
  },
  {
    id: 'season-of-grace',
    title: 'Season of Grace',
    subtitle: '100-Day Reading Streak',
    description: 'Reach a 100-day reading streak.',
    scriptureEcho: '“They are new every morning; great is your faithfulness.” — Lam 3:23',
    tier: 'gold',
    category: 'consistency',
    motif: 'flame',
    target: 100,
    evaluate: (ctx) => ({
      current: Math.min(ctx.summary.longestStreak, 100),
      unlockedAt: ctx.summary.longestStreak >= 100 ? latestLogDate(ctx) : null,
    }),
  },
  {
    id: 'sunday-rhythm',
    title: 'Lord’s Day Rhythm',
    subtitle: '4 Consecutive Sundays',
    description: 'Log Scripture readings on four consecutive Sundays.',
    scriptureEcho: '“This is the day that the Lord has made; let us rejoice.” — Ps 118:24',
    tier: 'silver',
    category: 'consistency',
    motif: 'chalice',
    target: 4,
    evaluate: (ctx) => {
      const best = ctx.consecutiveSundays?.best ?? countConsecutiveSundays(ctx.logs);
      return {
        current: Math.min(best, 4),
        unlockedAt: best >= 4 ? nthConsecutiveSundayDate(ctx, 4) : null,
      };
    },
  },

  // ── Habits & Reflections ─────────────────────────────────────────
  {
    id: 'heart-scribe',
    title: 'Heart Scribe',
    subtitle: '10 Reflection Notes',
    description: 'Record personal notes or favorite verses on 10 reading entries.',
    scriptureEcho: '“I have stored up your word in my heart.” — Ps 119:11',
    tier: 'silver',
    category: 'habits',
    motif: 'quill',
    target: 10,
    evaluate: (ctx) => {
      const sorted = getSortedLogsAsc(ctx);
      let count = 0;
      let tenthDate: string | null = null;
      for (const log of sorted) {
        if (log.note && log.note.trim().length > 0) {
          count += 1;
          if (count === 10) tenthDate = log.readDate;
        }
      }
      return {
        current: Math.min(count, 10),
        unlockedAt: tenthDate,
      };
    },
  },
  {
    id: 'morning-watch',
    title: 'Morning Watch',
    subtitle: 'Early Dawn Reader',
    description: 'Log 5 reading sessions before 8:00 AM local time.',
    scriptureEcho: '“In the morning, O Lord, you hear my voice.” — Ps 5:3',
    tier: 'bronze',
    category: 'habits',
    motif: 'sunrise',
    target: 5,
    evaluate: (ctx) => {
      const sorted = getSortedLogsAsc(ctx);
      let count = 0;
      let fifthDate: string | null = null;
      for (const log of sorted) {
        if (getLocalHourFromIsoInstant(log.loggedAt) < 8) {
          count += 1;
          if (count === 5) fifthDate = log.readDate;
        }
      }
      return {
        current: Math.min(count, 5),
        unlockedAt: fifthDate,
      };
    },
  },
  {
    id: 'deep-dive',
    title: 'Deep Waters',
    subtitle: '10 Chapters in One Day',
    description: 'Read and log at least 10 unique chapters on a single calendar day.',
    scriptureEcho: '“Deep calls to deep at the roar of your waterfalls.” — Ps 42:7',
    tier: 'silver',
    category: 'habits',
    motif: 'compass',
    target: 10,
    evaluate: (ctx) => evaluateSingleDayChapterCount(ctx, 10),
  },

  // ── Secret & Special Milestones ──────────────────────────────────
  {
    id: 'longest-song',
    title: 'The Alphabet of Delight',
    subtitle: 'Secret · Psalm 119',
    description: 'Read Psalm 119—the longest chapter in the Bible.',
    scriptureEcho: '“Oh how I love your law! It is my meditation all the day.” — Ps 119:97',
    tier: 'silver',
    category: 'special',
    motif: 'harp',
    secret: true,
    target: 1,
    evaluate: (ctx) => {
      const state = ctx.summary.bookProgressById['psalms']?.chapterMap[119];
      return {
        current: state ? 1 : 0,
        unlockedAt: state?.firstReadDate ?? null,
      };
    },
  },
  {
    id: 'second-wind',
    title: 'Second Pass',
    subtitle: 'Re-Read a Complete Book',
    description: 'Complete every chapter of any book at least twice.',
    scriptureEcho: '“Therefore every scribe… brings out of his treasure what is new and what is old.” — Matt 13:52',
    tier: 'gold',
    category: 'special',
    motif: 'dove',
    secret: true,
    target: 1,
    evaluate: (ctx) => {
      const rereadBook = BIBLE_BOOKS.find(
        (b) => (ctx.summary.bookProgressById[b.id]?.completedCycles ?? 0) >= 2
      );
      return {
        current: rereadBook ? 1 : 0,
        unlockedAt: rereadBook
          ? latestReadDateForChapters(ctx, [{ bookId: rereadBook.id }])
          : null,
      };
    },
  },
];

export interface FellowshipAchievementDefinition extends Omit<AchievementDefinition, 'evaluate'> {
  bonus: true;
  evaluateFellowship: (stats: FellowshipStatsCounters) => number;
}

/**
 * Optional bonus milestones for reading with friends.
 * Strictly separate from the 28 core milestones so solo/offline readers always achieve 28/28.
 */
export const FELLOWSHIP_SEALS_CATALOG: FellowshipAchievementDefinition[] = [
  {
    id: 'fellowship-first-friend',
    title: 'Iron Sharpens Iron',
    subtitle: 'Add a Friend',
    description: 'Connect with your first friend on Selah.',
    scriptureEcho: '“Iron sharpens iron, and one man sharpens another.” — Prov 27:17',
    tier: 'bronze',
    category: 'fellowship',
    motif: 'fellowship',
    bonus: true,
    target: 1,
    evaluateFellowship: (stats) => stats.friendsPeak,
  },
  {
    id: 'fellowship-read-together',
    title: 'Two Are Better Than One',
    subtitle: 'Shared Reading Plan',
    description: 'Start or join a Read Together plan with friends.',
    scriptureEcho: '“Two are better than one, because they have a good reward for their toil.” — Eccl 4:9',
    tier: 'silver',
    category: 'fellowship',
    motif: 'fellowship',
    bonus: true,
    target: 1,
    evaluateFellowship: (stats) => stats.cohortsPeak,
  },
  {
    id: 'fellowship-encourager',
    title: 'Word in Season',
    subtitle: '3 Encouragements Sent',
    description: 'Send 3 encouragement notes to friends.',
    scriptureEcho: '“A word in season, how good it is!” — Prov 15:23',
    tier: 'silver',
    category: 'fellowship',
    motif: 'fellowship',
    bonus: true,
    target: 3,
    evaluateFellowship: (stats) => stats.encouragementsSent,
  },
  {
    id: 'fellowship-threefold-cord',
    title: 'A Threefold Cord',
    subtitle: 'Three Friends',
    description: 'Connect with 3 friends on Selah.',
    scriptureEcho: '“A threefold cord is not quickly broken.” — Eccl 4:12',
    tier: 'gold',
    category: 'fellowship',
    motif: 'fellowship',
    bonus: true,
    target: 3,
    evaluateFellowship: (stats) => stats.friendsPeak,
  },
];
