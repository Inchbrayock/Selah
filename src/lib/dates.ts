const MS_PER_DAY = 86_400_000;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export interface PlainDateParts {
  year: number;
  month: number;
  day: number;
  /** ISO weekday: 1 = Monday ... 7 = Sunday */
  dayOfWeek: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const formattedDateCache = new Map<string, string>();
const MAX_FORMATTED_DATE_CACHE = 2048;

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function pad4(value: number): string {
  return String(value).padStart(4, '0');
}

function formatIsoParts(year: number, month: number, day: number): string {
  return `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
}

function parseValidatedParts(isoDate: string): { year: number; month: number; day: number; utcMs: number } {
  const match = ISO_DATE_RE.exec(isoDate);
  if (!match) {
    throw new RangeError(`Invalid plain date: ${isoDate}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcMs = Date.UTC(year, month - 1, day);
  const check = new Date(utcMs);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid calendar date: ${isoDate}`);
  }
  return { year, month, day, utcMs };
}

/**
 * Converts a validated YYYY-MM-DD date string to an integer UTC day index (days since 1970-01-01).
 * Immune to local timezone and DST shifts.
 */
export function toUtcDayIndex(isoDate: string): number {
  return Math.floor(parseValidatedParts(isoDate).utcMs / MS_PER_DAY);
}

function fromUtcDayIndex(dayIndex: number): PlainDateParts & { iso: string } {
  const d = new Date(dayIndex * MS_PER_DAY);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const utcDay = d.getUTCDay();
  const dayOfWeek = utcDay === 0 ? 7 : utcDay;
  return {
    year,
    month,
    day,
    dayOfWeek,
    iso: formatIsoParts(year, month, day),
  };
}

export function todayPlainDate(): string {
  const now = new Date();
  return formatIsoParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function parsePlainDate(isoDate: string): PlainDateParts {
  const { year, month, day, utcMs } = parseValidatedParts(isoDate);
  const utcDay = new Date(utcMs).getUTCDay();
  return {
    year,
    month,
    day,
    dayOfWeek: utcDay === 0 ? 7 : utcDay,
  };
}

export function addDays(isoDate: string, days: number): string {
  return fromUtcDayIndex(toUtcDayIndex(isoDate) + days).iso;
}

export function comparePlainDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function diffCalendarDays(earlierIso: string, laterIso: string): number {
  return toUtcDayIndex(laterIso) - toUtcDayIndex(earlierIso);
}

export function getDayOfWeek(isoDate: string): number {
  // ISO weekday: 1 = Monday ... 7 = Sunday
  return parsePlainDate(isoDate).dayOfWeek;
}

export function getLocalHourFromIsoInstant(isoInstant: string): number {
  const parsed = new Date(isoInstant);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getHours();
}

function getDateFormatter(options: Intl.DateTimeFormatOptions): {
  key: string;
  formatter: Intl.DateTimeFormat;
} {
  const key = `${options.year ?? ''}|${options.month ?? ''}|${options.day ?? ''}|${options.weekday ?? ''}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' });
    formatterCache.set(key, formatter);
  }
  return { key, formatter };
}

export function formatPlainDate(
  isoDate: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
): string {
  const { key, formatter } = getDateFormatter(options);
  const cacheKey = `${key}|${isoDate}`;
  const cached = formattedDateCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const { year, month, day } = parseValidatedParts(isoDate);
  // Use UTC noon so date formatting never drifts across calendar day boundaries
  const formatted = formatter.format(new Date(Date.UTC(year, month - 1, day, 12)));

  if (formattedDateCache.size >= MAX_FORMATTED_DATE_CACHE) {
    formattedDateCache.clear();
  }
  formattedDateCache.set(cacheKey, formatted);
  return formatted;
}

export function formatShortDate(isoDate: string): string {
  return formatPlainDate(isoDate, { month: 'short', day: 'numeric' });
}

export interface HeatmapDay {
  date: string;
  dayOfWeekIndex: number;
  weekIndex: number;
  isFuture: boolean;
  isOutsideRange: boolean;
}

export interface HeatmapMonthLabel {
  weekIndex: number;
  label: string;
}

export interface HeatmapCalendarData {
  days: HeatmapDay[];
  monthLabels: HeatmapMonthLabel[];
  weekCount: number;
}

function buildHeatmapGrid(
  startSundayIndex: number,
  weekCount: number,
  todayIndex: number,
  restrictYear?: number
): HeatmapCalendarData {
  const totalDays = weekCount * 7;
  const days: HeatmapDay[] = new Array(totalDays);
  const monthLabels: HeatmapMonthLabel[] = [];
  let lastMonth = -1;

  for (let i = 0; i < totalDays; i++) {
    const dayIndex = startSundayIndex + i;
    const current = fromUtcDayIndex(dayIndex);
    const weekIndex = Math.floor(i / 7);
    const dayOfWeekIndex = i % 7;
    const isOutsideRange = restrictYear !== undefined && current.year !== restrictYear;
    const isFuture = dayIndex > todayIndex;

    if (!isOutsideRange && dayOfWeekIndex === 0 && current.month !== lastMonth) {
      monthLabels.push({
        weekIndex,
        label: MONTH_SHORT_NAMES[current.month - 1],
      });
      lastMonth = current.month;
    }

    days[i] = {
      date: current.iso,
      dayOfWeekIndex,
      weekIndex,
      isFuture,
      isOutsideRange,
    };
  }

  return { days, monthLabels, weekCount };
}

const heatmapCalendarCache = new Map<string, HeatmapCalendarData>();
const MAX_HEATMAP_CACHE = 16;

/**
 * Generates an array of YYYY-MM-DD strings aligned to Sunday..Saturday columns
 * covering the last `weeks` weeks ending on `endDateIso`.
 */
export function buildHeatmapCalendar(endDateIso: string, weeks = 52): HeatmapCalendarData {
  const cacheKey = `rolling|${endDateIso}|${weeks}`;
  const cached = heatmapCalendarCache.get(cacheKey);
  if (cached) return cached;

  const endIndex = toUtcDayIndex(endDateIso);
  const end = fromUtcDayIndex(endIndex);
  // Convert ISO dayOfWeek (1=Mon..7=Sun) to Sunday-first index (0=Sun..6=Sat)
  const endSundayOffset = end.dayOfWeek === 7 ? 0 : end.dayOfWeek;
  const endWeekSaturdayIndex = endIndex + (6 - endSundayOffset);
  const startSundayIndex = endWeekSaturdayIndex - (weeks * 7 - 1);

  const result = buildHeatmapGrid(startSundayIndex, weeks, endIndex);
  if (heatmapCalendarCache.size >= MAX_HEATMAP_CACHE) {
    heatmapCalendarCache.clear();
  }
  heatmapCalendarCache.set(cacheKey, result);
  return result;
}

/**
 * Generates an array of YYYY-MM-DD strings aligned to Sunday..Saturday columns
 * covering the full calendar `year`, marking padding days outside `year` via `isOutsideRange`.
 */
export function buildYearHeatmapCalendar(
  year: number,
  todayIso = todayPlainDate()
): HeatmapCalendarData {
  const cacheKey = `year|${year}|${todayIso}`;
  const cached = heatmapCalendarCache.get(cacheKey);
  if (cached) return cached;

  const todayIndex = toUtcDayIndex(todayIso);
  const jan1Index = Math.floor(Date.UTC(year, 0, 1) / MS_PER_DAY);
  const dec31Index = Math.floor(Date.UTC(year, 11, 31) / MS_PER_DAY);

  const jan1Dow = fromUtcDayIndex(jan1Index).dayOfWeek;
  const startOffset = jan1Dow === 7 ? 0 : jan1Dow;
  const startSundayIndex = jan1Index - startOffset;

  const dec31Dow = fromUtcDayIndex(dec31Index).dayOfWeek;
  const endOffset = dec31Dow === 7 ? 0 : dec31Dow;
  const endSaturdayIndex = dec31Index + (6 - endOffset);

  const totalDays = endSaturdayIndex - startSundayIndex + 1;
  const weekCount = Math.round(totalDays / 7);

  const result = buildHeatmapGrid(startSundayIndex, weekCount, todayIndex, year);
  if (heatmapCalendarCache.size >= MAX_HEATMAP_CACHE) {
    heatmapCalendarCache.clear();
  }
  heatmapCalendarCache.set(cacheKey, result);
  return result;
}
