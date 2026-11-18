import {
  ACHIEVEMENTS_CATALOG,
  FELLOWSHIP_SEALS_CATALOG,
} from '../data/achievementsCatalog';
import { BOOKS_BY_ID } from '../data/bibleCanon';
import { comparePlainDates, diffCalendarDays, getDayOfWeek } from './dates';
import type {
  AchievementDefinition,
  AchievementEvalContext,
  AchievementStatus,
  BibleProgressSummary,
  FellowshipStatsCounters,
  ReadingLogEntry,
} from '../types/bible';

const CHAPTER_THRESHOLDS = [1, 10, 50, 100, 300, 600, 1000, 1189] as const;

function buildAchievementEvalContext(
  logs: ReadingLogEntry[],
  summary: BibleProgressSummary
): AchievementEvalContext {
  const sortedLogsAsc = [...logs].sort((a, b) => comparePlainDates(a.readDate, b.readDate));
  const latestLogDate = sortedLogsAsc.length > 0 ? sortedLogsAsc[sortedLogsAsc.length - 1].readDate : null;

  // Compute all chapter-threshold unlock dates in a single linear pass
  const chapterThresholdDates = new Map<number, string>();
  if (summary.totalChaptersRead > 0) {
    const seen = new Set<string>();
    let nextIdx = 0;
    for (const log of sortedLogsAsc) {
      if (nextIdx >= CHAPTER_THRESHOLDS.length) break;
      for (const ch of log.chapters) {
        seen.add(`${log.bookId}:${ch}`);
        while (
          nextIdx < CHAPTER_THRESHOLDS.length &&
          seen.size >= CHAPTER_THRESHOLDS[nextIdx]
        ) {
          chapterThresholdDates.set(CHAPTER_THRESHOLDS[nextIdx], log.readDate);
          nextIdx += 1;
        }
      }
    }
  }

  // Compute consecutive Sunday run and 4th consecutive Sunday unlock date in one pass
  const sundaySet = new Set<string>();
  for (const log of sortedLogsAsc) {
    if (getDayOfWeek(log.readDate) === 7) {
      sundaySet.add(log.readDate);
    }
  }
  const sundays = [...sundaySet];
  let best = sundays.length > 0 ? 1 : 0;
  let fourthDate: string | null = null;
  if (sundays.length > 1) {
    let run = 1;
    for (let i = 1; i < sundays.length; i++) {
      if (diffCalendarDays(sundays[i - 1], sundays[i]) === 7) {
        run += 1;
        if (run > best) best = run;
        if (run >= 4 && fourthDate === null) {
          fourthDate = sundays[i];
        }
      } else {
        run = 1;
      }
    }
  }

  return {
    logs,
    summary,
    booksById: BOOKS_BY_ID,
    sortedLogsAsc,
    latestLogDate,
    chapterThresholdDates,
    consecutiveSundays: { best, fourthDate },
  };
}

export function evaluateAchievements(
  logs: ReadingLogEntry[],
  summary: BibleProgressSummary
): AchievementStatus[] {
  const ctx = buildAchievementEvalContext(logs, summary);

  return ACHIEVEMENTS_CATALOG.map((definition) => {
    const { current, unlockedAt } = definition.evaluate(ctx);
    const clampedCurrent = Math.min(Math.max(0, current), definition.target);
    const unlocked = unlockedAt !== null && clampedCurrent >= definition.target;
    const percentage = Math.min(100, (clampedCurrent / definition.target) * 100);

    return {
      definition,
      unlocked,
      unlockedAt,
      current: clampedCurrent,
      target: definition.target,
      percentage,
    };
  });
}

export function evaluateFellowshipSeals(
  stats: FellowshipStatsCounters
): AchievementStatus[] {
  return FELLOWSHIP_SEALS_CATALOG.map((def) => {
    const rawCurrent = def.evaluateFellowship(stats);
    const clampedCurrent = Math.min(Math.max(0, rawCurrent), def.target);
    const unlocked = clampedCurrent >= def.target;
    const percentage = Math.min(100, (clampedCurrent / def.target) * 100);

    const definition: AchievementDefinition = {
      id: def.id,
      title: def.title,
      subtitle: def.subtitle,
      description: def.description,
      scriptureEcho: def.scriptureEcho,
      tier: def.tier,
      category: def.category,
      motif: def.motif,
      bonus: true,
      target: def.target,
      evaluate: () => ({
        current: clampedCurrent,
        unlockedAt: null,
      }),
    };

    return {
      definition,
      unlocked,
      unlockedAt: null,
      current: clampedCurrent,
      target: def.target,
      percentage,
    };
  });
}
