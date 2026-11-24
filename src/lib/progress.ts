import {
  BIBLE_BOOKS,
  BOOKS_BY_ID,
  NT_TOTAL_CHAPTERS,
  OT_TOTAL_CHAPTERS,
  TOTAL_CANON_CHAPTERS,
} from '../data/bibleCanon';
import type {
  BibleProgressSummary,
  BookProgress,
  ChapterReadState,
  ReadingLogEntry,
} from '../types/bible';
import {
  addDays,
  comparePlainDates,
  diffCalendarDays,
  getDayOfWeek,
  todayPlainDate,
  toUtcDayIndex,
} from './dates';

/**
 * Formats a completion ratio as a compact percentage string (1 decimal below 10%, integer otherwise).
 */
export function formatPercent(read: number, total: number): string {
  if (total <= 0) return '0%';
  const pct = (read / total) * 100;
  return `${pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}%`;
}

/**
 * Returns the next canonical book after `bookId` (wrapping Revelation -> Genesis).
 * When `summary` is provided, skips already-completed books to land on the next
 * book with an unread chapter; if all 66 books are completed, returns the immediate
 * next canonical book.
 */
export function getNextCanonicalBookId(
  bookId: string,
  summary?: BibleProgressSummary
): string {
  const idx = BIBLE_BOOKS.findIndex((b) => b.id === bookId);
  if (idx === -1) return 'john';

  if (summary) {
    for (let offset = 1; offset <= BIBLE_BOOKS.length; offset++) {
      const candidate = BIBLE_BOOKS[(idx + offset) % BIBLE_BOOKS.length];
      const progress = summary.bookProgressById[candidate.id];
      if (!progress || progress.nextUnreadChapter !== null) {
        return candidate.id;
      }
    }
  }

  return BIBLE_BOOKS[(idx + 1) % BIBLE_BOOKS.length].id;
}

/**
 * Picks the best default book for quick-logging:
 * 1. Last read book if it still has unread chapters.
 * 2. If the last read book is completed, the next canonical book (wrapping around).
 * 3. Else first in-progress book, else John for brand-new readers.
 */
export function getSuggestedBookId(summary: BibleProgressSummary): string {
  if (summary.lastReadBookId) {
    const lastProgress = summary.bookProgressById[summary.lastReadBookId];
    if (lastProgress) {
      if (lastProgress.nextUnreadChapter !== null) {
        return lastProgress.book.id;
      }
      return getNextCanonicalBookId(lastProgress.book.id, summary);
    }
  }
  const inProgress = BIBLE_BOOKS.find((b) => {
    const p = summary.bookProgressById[b.id];
    return p && p.readChapters > 0 && !p.completed;
  });
  return inProgress?.id ?? 'john';
}

/**
 * Formats an array of chapter numbers into compact ranges, e.g. [1,2,3,5,7,8] -> "1–3, 5, 7–8".
 */
export function formatChapterRanges(chapters: number[]): string {
  if (chapters.length === 0) return '';
  const sorted = [...new Set(chapters)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    if (curr === prev + 1) {
      prev = curr;
    } else {
      ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
      start = curr;
      prev = curr;
    }
  }
  ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
  return ranges.join(', ');
}

/**
 * Parses a chapter expression like "1-5, 8, 10-12" bounded by maxChapter.
 */
export function parseChapterInput(input: string, maxChapter: number): number[] {
  const result = new Set<number>();
  const parts = input
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (rangeMatch) {
      const a = Number(rangeMatch[1]);
      const b = Number(rangeMatch[2]);
      const lo = Math.max(1, Math.min(a, b));
      const hi = Math.min(maxChapter, Math.max(a, b));
      for (let ch = lo; ch <= hi; ch++) {
        result.add(ch);
      }
      continue;
    }
    const single = Number(part);
    if (Number.isInteger(single) && single >= 1 && single <= maxChapter) {
      result.add(single);
    }
  }

  return [...result].sort((a, b) => a - b);
}

/**
 * Calculates current & longest reading streaks from unique calendar dates.
 * When `graceEnabled` is true, up to 1 missed day inside any 7-day rolling window
 * preserves the streak (Sabbath/rest grace).
 */
export function computeStreaks(
  uniqueSortedDatesAsc: string[],
  todayIso: string,
  graceEnabled: boolean
): { currentStreak: number; longestStreak: number; graceUsedThisWeek: boolean } {
  const activeDates = uniqueSortedDatesAsc.filter((d) => comparePlainDates(d, todayIso) <= 0);
  if (activeDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, graceUsedThisWeek: false };
  }

  const activeDayIndices = activeDates.map(toUtcDayIndex);
  const activeDaySet = new Set(activeDayIndices);

  // Compute longest streak in O(D) over active reading dates (no multi-year day-by-day walk)
  let longestStreak = 1;
  let run = 1;
  let lastGracedDay: number | null = null;

  for (let i = 1; i < activeDayIndices.length; i++) {
    const gap = activeDayIndices[i] - activeDayIndices[i - 1] - 1;
    if (gap === 0) {
      run += 1;
    } else if (graceEnabled && gap === 1) {
      const missedDay = activeDayIndices[i - 1] + 1;
      if (lastGracedDay === null || missedDay - lastGracedDay >= 7) {
        lastGracedDay = missedDay;
        run += 1;
      } else {
        run = 1;
      }
    } else {
      run = 1;
    }
    if (run > longestStreak) longestStreak = run;
  }

  // Compute current streak walking backwards from today (or yesterday / rest-day grace)
  const todayIdx = toUtcDayIndex(todayIso);
  let currentStreak = 0;
  let graceUsedThisWeek = false;
  let cursor = todayIdx;
  const hasToday = activeDaySet.has(todayIdx);
  const hasYesterday = activeDaySet.has(todayIdx - 1);

  if (!hasToday && !hasYesterday) {
    if (!graceEnabled || !activeDaySet.has(todayIdx - 2)) {
      return { currentStreak: 0, longestStreak, graceUsedThisWeek: false };
    }
    // Yesterday was missed; today isn't logged yet, treat yesterday as the grace gap
    cursor = todayIdx - 2;
    graceUsedThisWeek = true;
  } else if (!hasToday && hasYesterday) {
    cursor = todayIdx - 1;
  }

  let lastRecentMissStep: number | null = null;
  let stepsBack = 0;

  while (true) {
    if (activeDaySet.has(cursor)) {
      currentStreak += 1;
      stepsBack += 1;
      cursor -= 1;
    } else if (graceEnabled) {
      // Allow bridging a 1-day gap if no other missed day occurred within 7 days
      const withinWeeklyBudget =
        lastRecentMissStep === null || stepsBack - lastRecentMissStep >= 7;
      if (withinWeeklyBudget && activeDaySet.has(cursor - 1)) {
        lastRecentMissStep = stepsBack;
        if (stepsBack < 7) {
          graceUsedThisWeek = true;
        }
        stepsBack += 1;
        cursor -= 1;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
  }

  return { currentStreak, longestStreak, graceUsedThisWeek };
}

export function computeBibleProgress(
  logs: ReadingLogEntry[],
  options: { todayIso?: string; streakGraceEnabled?: boolean } = {}
): BibleProgressSummary {
  const todayIso = options.todayIso ?? todayPlainDate();
  const streakGraceEnabled = options.streakGraceEnabled ?? true;

  // Sort chronological so firstReadDate / lastReadDate & lastReadBookId resolve accurately
  const sortedLogs = [...logs].sort((a, b) => {
    const cmp = comparePlainDates(a.readDate, b.readDate);
    if (cmp !== 0) return cmp;
    return a.loggedAt.localeCompare(b.loggedAt);
  });

  const bookChapterMaps: Record<string, Record<number, ChapterReadState>> = {};
  for (const book of BIBLE_BOOKS) {
    bookChapterMaps[book.id] = {};
  }

  let totalChapterReadsAllCycles = 0;
  let notesCount = 0;
  const activeDatesSet = new Set<string>();

  for (const log of sortedLogs) {
    const book = BOOKS_BY_ID[log.bookId];
    if (!book) continue;

    activeDatesSet.add(log.readDate);
    if (log.note && log.note.trim().length > 0) {
      notesCount += 1;
    }

    const chMap = bookChapterMaps[book.id];
    const uniqueChapters = new Set(
      log.chapters.filter((ch) => Number.isInteger(ch) && ch >= 1 && ch <= book.chapterCount)
    );

    for (const ch of uniqueChapters) {
      totalChapterReadsAllCycles += 1;
      const existing = chMap[ch];
      if (!existing) {
        chMap[ch] = {
          readCount: 1,
          firstReadDate: log.readDate,
          lastReadDate: log.readDate,
        };
      } else {
        existing.readCount += 1;
        if (comparePlainDates(log.readDate, existing.firstReadDate) < 0) {
          existing.firstReadDate = log.readDate;
        }
        if (comparePlainDates(log.readDate, existing.lastReadDate) > 0) {
          existing.lastReadDate = log.readDate;
        }
      }
    }
  }

  const bookProgressById: Record<string, BookProgress> = {};
  let totalChaptersRead = 0;
  let otChaptersRead = 0;
  let ntChaptersRead = 0;
  let booksCompleted = 0;
  let booksInProgress = 0;

  for (const book of BIBLE_BOOKS) {
    const chapterMap = bookChapterMaps[book.id];
    const readCountKeys = Object.keys(chapterMap);
    const readChapters = readCountKeys.length;
    const completed = readChapters === book.chapterCount;

    let completedCycles = 0;
    if (completed) {
      completedCycles = Math.min(
        ...Array.from({ length: book.chapterCount }, (_, idx) => chapterMap[idx + 1]?.readCount ?? 0)
      );
    }

    let nextUnreadChapter: number | null = null;
    for (let ch = 1; ch <= book.chapterCount; ch++) {
      if (!chapterMap[ch]) {
        nextUnreadChapter = ch;
        break;
      }
    }

    totalChaptersRead += readChapters;
    if (book.testament === 'OT') {
      otChaptersRead += readChapters;
    } else {
      ntChaptersRead += readChapters;
    }
    if (completed) {
      booksCompleted += 1;
    } else if (readChapters > 0) {
      booksInProgress += 1;
    }

    bookProgressById[book.id] = {
      book,
      readChapters,
      totalChapters: book.chapterCount,
      percentage: (readChapters / book.chapterCount) * 100,
      completed,
      completedCycles,
      chapterMap,
      nextUnreadChapter,
    };
  }

  const uniqueDatesAsc = [...activeDatesSet].sort(comparePlainDates);
  const { currentStreak, longestStreak, graceUsedThisWeek } = computeStreaks(
    uniqueDatesAsc,
    todayIso,
    streakGraceEnabled
  );

  // Rolling 28-day pace for projected completion
  const windowStart = addDays(todayIso, -27);
  let recentChapters = 0;
  for (const log of sortedLogs) {
    if (
      comparePlainDates(log.readDate, windowStart) >= 0 &&
      comparePlainDates(log.readDate, todayIso) <= 0
    ) {
      recentChapters += new Set(log.chapters).size;
    }
  }
  const chaptersPerWeekAvg = Number(((recentChapters / 28) * 7).toFixed(1));

  let projectedFinishDate: string | null = null;
  const remainingChapters = TOTAL_CANON_CHAPTERS - totalChaptersRead;
  if (remainingChapters === 0) {
    projectedFinishDate = todayIso;
  } else if (chaptersPerWeekAvg > 0) {
    const chaptersPerDay = chaptersPerWeekAvg / 7;
    const daysNeeded = Math.ceil(remainingChapters / chaptersPerDay);
    if (daysNeeded <= 3650) {
      projectedFinishDate = addDays(todayIso, daysNeeded);
    }
  }

  const lastLog = sortedLogs[sortedLogs.length - 1] ?? null;

  return {
    totalChaptersRead,
    totalChapters: TOTAL_CANON_CHAPTERS,
    totalPercentage: (totalChaptersRead / TOTAL_CANON_CHAPTERS) * 100,
    otChaptersRead,
    otTotalChapters: OT_TOTAL_CHAPTERS,
    otPercentage: (otChaptersRead / OT_TOTAL_CHAPTERS) * 100,
    ntChaptersRead,
    ntTotalChapters: NT_TOTAL_CHAPTERS,
    ntPercentage: (ntChaptersRead / NT_TOTAL_CHAPTERS) * 100,
    booksCompleted,
    booksInProgress,
    totalSessions: logs.length,
    totalChapterReadsAllCycles,
    notesCount,
    currentStreak,
    longestStreak,
    graceUsedThisWeek,
    activeDaysCount: uniqueDatesAsc.length,
    chaptersPerWeekAvg,
    projectedFinishDate,
    lastReadBookId: lastLog?.bookId ?? null,
    bookProgressById,
  };
}

const dailyChapterCountsCache = new WeakMap<ReadingLogEntry[], Record<string, number>>();

/**
 * Returns daily chapter count map (YYYY-MM-DD -> chapters read) for heatmaps & charts.
 */
export function buildDailyChapterCounts(logs: ReadingLogEntry[]): Record<string, number> {
  const cached = dailyChapterCountsCache.get(logs);
  if (cached) return cached;
  const counts: Record<string, number> = {};
  for (const log of logs) {
    const count = new Set(log.chapters).size;
    counts[log.readDate] = (counts[log.readDate] ?? 0) + count;
  }
  dailyChapterCountsCache.set(logs, counts);
  return counts;
}

/**
 * Counts consecutive Sunday readings up to the latest Sunday with data.
 */
export function countConsecutiveSundays(logs: ReadingLogEntry[]): number {
  const sundayDates = new Set<string>();
  for (const log of logs) {
    if (getDayOfWeek(log.readDate) === 7) {
      sundayDates.add(log.readDate);
    }
  }
  if (sundayDates.size === 0) return 0;

  const sorted = [...sundayDates].sort(comparePlainDates);
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (diffCalendarDays(sorted[i - 1], sorted[i]) === 7) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}
