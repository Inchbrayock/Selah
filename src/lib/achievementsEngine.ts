import {
  ACHIEVEMENTS_CATALOG,
  FELLOWSHIP_SEALS_CATALOG,
  resolveFellowshipUnlockDate,
} from '../data/achievementsCatalog';
import { BOOKS_BY_ID } from '../data/bibleCanon';
import type {
  AchievementDefinition,
  AchievementStatus,
  BibleProgressSummary,
  FellowshipStatsCounters,
  ReadingLogEntry,
} from '../types/bible';

export function evaluateAchievements(
  logs: ReadingLogEntry[],
  summary: BibleProgressSummary
): AchievementStatus[] {
  const ctx = {
    logs,
    summary,
    booksById: BOOKS_BY_ID,
  };

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
        unlockedAt: resolveFellowshipUnlockDate(unlocked),
      }),
    };

    return {
      definition,
      unlocked,
      unlockedAt: resolveFellowshipUnlockDate(unlocked),
      current: clampedCurrent,
      target: def.target,
      percentage,
    };
  });
}
