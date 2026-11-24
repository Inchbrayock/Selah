import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS_CATALOG,
  FELLOWSHIP_SEALS_CATALOG,
} from '../data/achievementsCatalog';
import { READING_PLANS } from '../data/readingPlans';
import {
  evaluateAchievements,
  evaluateFellowshipSeals,
} from '../lib/achievementsEngine';
import {
  buildSharedCustomPlanId,
  computeCohortMemberProgress,
  createCohortId,
  DEFAULT_FELLOWSHIP_STATS,
  ENCOURAGEMENT_COOLDOWN_MS,
  ENCOURAGEMENT_PRESETS,
  formatCooldownRemaining,
  getActiveLocalPlanIdForCohort,
  getEncouragementCooldownRemainingMs,
  getEncouragementDisplayText,
  getEncouragementPresetLabel,
  isValidEncouragementPresetId,
  MAX_CUSTOM_ENCOURAGEMENT_LENGTH,
  materializeSharedCohortPlan,
  sanitizeCustomEncouragementMessage,
  sanitizeFellowshipStats,
} from '../lib/fellowship';
import { computeBibleProgress } from '../lib/progress';
import type { ReadingLogEntry, SharedPlanCohort } from '../types/bible';

describe('Phase 2 optional Fellowship Seals & core solo invariant', () => {
  it('keeps the core 28 seals untouched and 100% independent of social features', () => {
    expect(ACHIEVEMENTS_CATALOG).toHaveLength(28);
    expect(ACHIEVEMENTS_CATALOG.every((a) => !a.bonus && a.category !== 'fellowship')).toBe(true);

    const zeroSummary = computeBibleProgress([]);
    const baseline = evaluateAchievements([], zeroSummary);
    expect(baseline).toHaveLength(28);
    expect(baseline.every((a) => !a.unlocked)).toBe(true);
  });

  it('defines 4 optional bonus Fellowship Seals and unlocks them monotonically from counters', () => {
    expect(FELLOWSHIP_SEALS_CATALOG).toHaveLength(4);
    expect(FELLOWSHIP_SEALS_CATALOG.every((s) => s.bonus && s.category === 'fellowship')).toBe(true);

    const locked = evaluateFellowshipSeals({ ...DEFAULT_FELLOWSHIP_STATS });
    expect(locked.every((s) => !s.unlocked)).toBe(true);

    const oneFriendAndCohort = evaluateFellowshipSeals({
      friendsPeak: 1,
      cohortsPeak: 1,
      encouragementsSent: 1,
    });
    expect(oneFriendAndCohort.find((s) => s.definition.id === 'fellowship-first-friend')?.unlocked).toBe(
      true
    );
    expect(oneFriendAndCohort.find((s) => s.definition.id === 'fellowship-read-together')?.unlocked).toBe(
      true
    );
    expect(oneFriendAndCohort.find((s) => s.definition.id === 'fellowship-encourager')?.unlocked).toBe(
      false
    );
    expect(
      oneFriendAndCohort.find((s) => s.definition.id === 'fellowship-threefold-cord')?.unlocked
    ).toBe(false);

    const allFour = evaluateFellowshipSeals({
      friendsPeak: 3,
      cohortsPeak: 2,
      encouragementsSent: 3,
    });
    expect(allFour.every((s) => s.unlocked)).toBe(true);
  });

  it('sanitizes malformed or out-of-range fellowship stats cleanly', () => {
    expect(
      sanitizeFellowshipStats({
        friendsPeak: -4,
        cohortsPeak: Number.NaN,
        encouragementsSent: 250000,
      })
    ).toEqual({
      friendsPeak: 0,
      cohortsPeak: 0,
      encouragementsSent: 100000,
    });
  });
});

describe('Quiet Encouragement presets, custom messages & 12-hour cooldown math', () => {
  it('validates allowed preset IDs (including custom) and maps readable text', () => {
    expect(ENCOURAGEMENT_PRESETS).toHaveLength(4);
    for (const preset of ENCOURAGEMENT_PRESETS) {
      expect(isValidEncouragementPresetId(preset.id)).toBe(true);
      expect(getEncouragementPresetLabel(preset.id)).toBe(preset.label);
      expect(getEncouragementDisplayText({ presetId: preset.id })).toBe(preset.label);
    }
    expect(isValidEncouragementPresetId('custom')).toBe(true);
    expect(isValidEncouragementPresetId('free-text-hack')).toBe(false);
    expect(isValidEncouragementPresetId('')).toBe(false);

    expect(sanitizeCustomEncouragementMessage('   ')).toBeNull();
    expect(sanitizeCustomEncouragementMessage('  Romans 8:28!  ')).toBe('Romans 8:28!');
    expect(
      sanitizeCustomEncouragementMessage('a'.repeat(MAX_CUSTOM_ENCOURAGEMENT_LENGTH + 50))
    ).toHaveLength(MAX_CUSTOM_ENCOURAGEMENT_LENGTH);
    expect(
      getEncouragementDisplayText({
        presetId: 'custom',
        customMessage: '  Thinking of you in Psalms today!  ',
      })
    ).toBe('Thinking of you in Psalms today!');
  });

  it('computes 12-hour cooldown remaining milliseconds and human labels accurately', () => {
    const baseMs = Date.parse('2026-04-10T08:00:00.000Z');
    const sentIso = '2026-04-10T08:00:00.000Z';

    expect(getEncouragementCooldownRemainingMs(null, baseMs)).toBe(0);
    expect(getEncouragementCooldownRemainingMs(sentIso, baseMs)).toBe(ENCOURAGEMENT_COOLDOWN_MS);
    expect(formatCooldownRemaining(getEncouragementCooldownRemainingMs(sentIso, baseMs))).toBe('12h');

    // 11h 35m elapsed -> 25m left
    const nearEndMs = baseMs + ENCOURAGEMENT_COOLDOWN_MS - 25 * 60 * 1000;
    const rem25 = getEncouragementCooldownRemainingMs(sentIso, nearEndMs);
    expect(rem25).toBe(25 * 60 * 1000);
    expect(formatCooldownRemaining(rem25)).toBe('25m');

    // Past 12h -> ready
    const afterMs = baseMs + ENCOURAGEMENT_COOLDOWN_MS + 1000;
    expect(getEncouragementCooldownRemainingMs(sentIso, afterMs)).toBe(0);
    expect(formatCooldownRemaining(0)).toBe('Ready');
  });
});

describe('Shared Reading Plan ("Read Together") snapshots & progress', () => {
  it('creates valid cohort IDs and local shared custom plan IDs matching security rules', () => {
    for (let i = 0; i < 20; i++) {
      const id = createCohortId();
      expect(id).toMatch(/^[a-z0-9-]{4,40}$/);
      const localId = buildSharedCustomPlanId(id);
      expect(localId).toMatch(/^shared-[a-z0-9-]+$/);
      expect(localId.length).toBeLessThanOrEqual(64);
    }
  });

  it('materializes both built-in plans and custom plan snapshots and computes progress without notes', () => {
    const builtinSource = READING_PLANS[0];
    const builtinCohort: SharedPlanCohort = {
      id: 'cohort-builtin-1',
      hostUid: 'uid_hannah',
      hostName: 'Hannah',
      planType: 'builtin',
      sourcePlanId: builtinSource.id,
      title: builtinSource.title,
      description: builtinSource.description,
      sections: [],
      durationDays: builtinSource.durationDays,
      accentColor: builtinSource.accentColor,
      participantUids: ['uid_hannah', 'uid_miriam'],
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    };

    expect(getActiveLocalPlanIdForCohort(builtinCohort)).toBe(builtinSource.id);
    expect(materializeSharedCohortPlan(builtinCohort).id).toBe(builtinSource.id);

    const customCohort: SharedPlanCohort = {
      id: 'cohort-gospel-abc',
      hostUid: 'uid_hannah',
      hostName: 'Hannah',
      planType: 'custom',
      sourcePlanId: 'custom-gospel-john',
      title: 'John Together',
      description: 'Four days in the Gospel of John',
      sections: [{ bookId: 'john', startChapter: 1, endChapter: 4 }],
      durationDays: 2,
      accentColor: 'var(--div-gospels)',
      participantUids: ['uid_hannah', 'uid_miriam'],
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    };

    expect(getActiveLocalPlanIdForCohort(customCohort)).toBe('shared-cohort-gospel-abc');
    const materializedCustom = materializeSharedCohortPlan(customCohort);
    expect(materializedCustom.isCustom).toBe(true);
    expect(materializedCustom.id).toBe('shared-cohort-gospel-abc');
    expect(materializedCustom.days).toHaveLength(2);

    const logs: ReadingLogEntry[] = [
      {
        id: 'log-1',
        bookId: 'john',
        chapters: [1, 2],
        readDate: '2026-04-02',
        loggedAt: '2026-04-02T09:00:00.000Z',
        note: 'Private personal journal note that must never leak',
      },
    ];
    const summary = computeBibleProgress(logs);
    const prog = computeCohortMemberProgress(customCohort, summary);
    expect(prog).toEqual({
      completedDays: 1,
      totalDays: 2,
      readChapters: 2,
      totalChapters: 4,
    });
  });
});
