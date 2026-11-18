import { materializeCustomPlan } from './customPlans';
import { computePlanProgress, getReadingPlanById } from './plans';
import type {
  BibleProgressSummary,
  EncouragementPresetId,
  FellowshipStatsCounters,
  ReadingPlan,
  SharedPlanCohort,
} from '../types/bible';

export interface EncouragementPresetOption {
  id: EncouragementPresetId;
  label: string;
}

export const ENCOURAGEMENT_PRESETS: readonly EncouragementPresetOption[] = [
  {
    id: 'praying',
    label: 'Praying for your reading today',
  },
  {
    id: 'alongside',
    label: 'Reading along with you',
  },
  {
    id: 'keep-going',
    label: 'Great job keeping your streak going!',
  },
  {
    id: 'grace-peace',
    label: 'Grace and peace as you read',
  },
] as const;

export const ENCOURAGEMENT_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export const DEFAULT_FELLOWSHIP_STATS: FellowshipStatsCounters = {
  friendsPeak: 0,
  cohortsPeak: 0,
  encouragementsSent: 0,
};

function clampCounter(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100000, Math.round(raw)));
}

export function sanitizeFellowshipStats(
  input?: Partial<FellowshipStatsCounters> | null
): FellowshipStatsCounters {
  return {
    friendsPeak: clampCounter(input?.friendsPeak),
    cohortsPeak: clampCounter(input?.cohortsPeak),
    encouragementsSent: clampCounter(input?.encouragementsSent),
  };
}

export function isValidEncouragementPresetId(value: unknown): value is EncouragementPresetId {
  return ENCOURAGEMENT_PRESETS.some((item) => item.id === value);
}

export function getEncouragementPresetLabel(presetId: EncouragementPresetId): string {
  return (
    ENCOURAGEMENT_PRESETS.find((item) => item.id === presetId)?.label ??
    'Praying for your reading today'
  );
}

export function getEncouragementCooldownRemainingMs(
  sentAtIso: string | null | undefined,
  nowMs: number = Date.now()
): number {
  if (!sentAtIso) return 0;
  const sentMs = Date.parse(sentAtIso);
  if (!Number.isFinite(sentMs)) return 0;
  const elapsed = nowMs - sentMs;
  if (elapsed < 0) return ENCOURAGEMENT_COOLDOWN_MS;
  return Math.max(0, ENCOURAGEMENT_COOLDOWN_MS - elapsed);
}

export function formatCooldownRemaining(ms: number): string {
  if (ms <= 0) return 'Ready';
  const totalMinutes = Math.ceil(ms / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.ceil(totalMinutes / 60);
  return `${hours}h`;
}

export function createCohortId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now().toString(36).slice(-6);
  return `cohort-${stamp}-${rand}`.replace(/[^a-z0-9-]/g, '').slice(0, 40);
}

export function buildSharedCustomPlanId(cohortId: string): string {
  const clean = cohortId.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `shared-${clean}`.slice(0, 64);
}

export function materializeSharedCohortPlan(cohort: SharedPlanCohort): ReadingPlan {
  if (cohort.planType === 'builtin') {
    const builtIn = getReadingPlanById(cohort.sourcePlanId, []);
    if (builtIn && builtIn.id === cohort.sourcePlanId) {
      return builtIn;
    }
  }

  return materializeCustomPlan({
    id: buildSharedCustomPlanId(cohort.id),
    title: cohort.title,
    description: cohort.description,
    sections: cohort.sections,
    durationDays: cohort.durationDays,
    accentColor: cohort.accentColor,
    createdAt: cohort.createdAt,
    updatedAt: cohort.updatedAt,
  });
}

export function computeCohortMemberProgress(
  cohort: SharedPlanCohort,
  summary: BibleProgressSummary
): {
  completedDays: number;
  totalDays: number;
  readChapters: number;
  totalChapters: number;
} {
  const plan = materializeSharedCohortPlan(cohort);
  const progress = computePlanProgress(plan, summary);
  const totalDays = Math.max(1, Math.min(1189, plan.durationDays));
  const totalChapters = Math.max(1, Math.min(1189, progress.totalChaptersCount));
  return {
    completedDays: Math.max(0, Math.min(totalDays, progress.completedDaysCount)),
    totalDays,
    readChapters: Math.max(0, Math.min(totalChapters, progress.readChaptersCount)),
    totalChapters,
  };
}

export function getActiveLocalPlanIdForCohort(cohort: SharedPlanCohort): string {
  if (cohort.planType === 'builtin') {
    return cohort.sourcePlanId;
  }
  return buildSharedCustomPlanId(cohort.id);
}
