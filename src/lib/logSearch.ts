import { BIBLE_BOOKS } from '../data/bibleCanon';
import type { CanonBook, ReadingLogEntry } from '../types/bible';
import { parsePlainDate } from './dates';
import { formatChapterRanges } from './progress';

const MONTH_SHORT_EN = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const;

const MONTH_LONG_EN = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

const MONTH_TOKENS = new Set<string>([
  ...MONTH_SHORT_EN,
  ...MONTH_LONG_EN,
  'sept',
]);

const BOOK_EXTRA_ALIASES: Record<string, string[]> = {
  psalms: ['psalm'],
  'song-of-solomon': ['song of songs'],
};

/** Normalizes punctuation, dashes, diacritics, and whitespace for search matching. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const NUMBERED_BOOK_STEMS = BIBLE_BOOKS.filter((b) => /^[1-3]\s/.test(b.name)).flatMap((b) => [
  normalizeSearchText(b.name),
  normalizeSearchText(b.shortName),
]);

interface DateSearchInfo {
  texts: string[];
  month: number | null;
  day: number | null;
}

const dateSearchInfoCache = new Map<string, DateSearchInfo>();
const MAX_DATE_SEARCH_CACHE = 1024;
const bookAliasesCache = new Map<string, string[]>();
const indexedLogCache = new WeakMap<ReadingLogEntry, IndexedReadingLog>();

function buildDateSearchInfo(isoDate: string): DateSearchInfo {
  const cached = dateSearchInfoCache.get(isoDate);
  if (cached) return cached;

  const normalizedIso = normalizeSearchText(isoDate);
  let info: DateSearchInfo;
  try {
    const plain = parsePlainDate(isoDate);
    const monthIdx = plain.month - 1;
    const monthShort = MONTH_SHORT_EN[monthIdx];
    const monthLong = MONTH_LONG_EN[monthIdx];
    const monthNames =
      monthShort === 'sep' ? [monthShort, 'sept', monthLong] : [monthShort, monthLong];

    const y = String(plain.year);
    const m = String(plain.month);
    const mm = m.padStart(2, '0');
    const d = String(plain.day);
    const dd = d.padStart(2, '0');

    const texts = new Set<string>([
      normalizedIso,
      `${mm}/${dd}/${y}`,
      `${m}/${d}/${y}`,
      `${dd}/${mm}/${y}`,
      `${d}/${m}/${y}`,
      `${y}/${mm}/${dd}`,
      `${y}/${m}/${d}`,
      `${mm}-${dd}-${y}`,
      `${m}-${d}-${y}`,
      `${dd}-${mm}-${y}`,
      `${d}-${m}-${y}`,
    ]);

    for (const mon of monthNames) {
      texts.add(`${mon} ${d}, ${y}`);
      texts.add(`${mon} ${d} ${y}`);
      texts.add(`${mon} ${dd}, ${y}`);
      texts.add(`${mon} ${dd} ${y}`);
      texts.add(`${d} ${mon} ${y}`);
      texts.add(`${dd} ${mon} ${y}`);
    }

    info = {
      texts: [...texts],
      month: plain.month,
      day: plain.day,
    };
  } catch {
    info = {
      texts: normalizedIso ? [normalizedIso] : [],
      month: null,
      day: null,
    };
  }

  if (dateSearchInfoCache.size >= MAX_DATE_SEARCH_CACHE) {
    dateSearchInfoCache.clear();
  }
  dateSearchInfoCache.set(isoDate, info);
  return info;
}

function getBookAliases(book: CanonBook | undefined): string[] {
  if (!book) return [];
  const cached = bookAliasesCache.get(book.id);
  if (cached) return cached;
  const aliases = [
    normalizeSearchText(book.name),
    normalizeSearchText(book.shortName),
    ...(BOOK_EXTRA_ALIASES[book.id] ?? []),
  ];
  const unique = [...new Set(aliases.filter(Boolean))];
  bookAliasesCache.set(book.id, unique);
  return unique;
}

type QueryToken =
  | { kind: 'book'; value: string }
  | { kind: 'date'; value: string; rawPair: string }
  | { kind: 'range'; start: number; end: number; raw: string }
  | { kind: 'rangePrefix'; start: number; raw: string }
  | { kind: 'number'; value: number; raw: string }
  | { kind: 'text'; value: string };

function tokenizeQuery(normalizedQuery: string): QueryToken[] {
  const compactRanges = normalizedQuery
    .replace(/\b(\d{1,3})\s*-\s*(\d{1,3})\b/g, '$1-$2')
    .replace(/\b(\d{1,3})\s+-$/g, '$1-');
  const rawTokens = compactRanges
    .split(/[\s,]+/)
    .map((token) => token.replace(/([a-z])\.+$/g, '$1'))
    .filter(Boolean);
  const tokens: QueryToken[] = [];

  let i = 0;
  while (i < rawTokens.length) {
    const curr = rawTokens[i];
    const next = i + 1 < rawTokens.length ? rawTokens[i + 1] : null;

    // Pair numbered Bible book prefixes (e.g. "1 john", "2 kings", "1 cor")
    if ((curr === '1' || curr === '2' || curr === '3') && next) {
      const pair = `${curr} ${next}`;
      if (NUMBERED_BOOK_STEMS.some((stem) => stem.startsWith(pair))) {
        tokens.push({ kind: 'book', value: pair });
        i += 2;
        continue;
      }
    }

    // Pair month + day (e.g. "nov 12") or day + month (e.g. "12 nov")
    if (MONTH_TOKENS.has(curr) && next && /^\d{1,2}$/.test(next)) {
      const dayNum = Number(next);
      if (dayNum >= 1 && dayNum <= 31) {
        tokens.push({ kind: 'date', value: `${curr} ${dayNum}`, rawPair: `${curr} ${next}` });
        i += 2;
        continue;
      }
    }
    if (/^\d{1,2}$/.test(curr) && next && MONTH_TOKENS.has(next)) {
      const dayNum = Number(curr);
      if (dayNum >= 1 && dayNum <= 31) {
        tokens.push({ kind: 'date', value: `${dayNum} ${next}`, rawPair: `${curr} ${next}` });
        i += 2;
        continue;
      }
    }

    const rangeMatch = curr.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const a = Number(rangeMatch[1]);
      const b = Number(rangeMatch[2]);
      if (a >= 1 && b >= 1 && a <= 150 && b <= 150) {
        tokens.push({
          kind: 'range',
          start: Math.min(a, b),
          end: Math.max(a, b),
          raw: curr,
        });
        i += 1;
        continue;
      }
    }

    const prefixMatch = curr.match(/^(\d+)-$/);
    if (prefixMatch) {
      const ch = Number(prefixMatch[1]);
      if (ch >= 1 && ch <= 150) {
        tokens.push({ kind: 'rangePrefix', start: ch, raw: curr });
        i += 1;
        continue;
      }
    }

    if (/^\d+$/.test(curr)) {
      tokens.push({ kind: 'number', value: Number(curr), raw: curr });
      i += 1;
      continue;
    }

    tokens.push({ kind: 'text', value: curr });
    i += 1;
  }

  return tokens;
}

export interface IndexedReadingLog {
  log: ReadingLogEntry;
  bookAliases: string[];
  chapterSet: Set<number>;
  chapterRange: string;
  noteText: string;
  dateInfo: DateSearchInfo;
}

/** Precomputes normalized search fields for a reading log entry. */
export function indexReadingLogForSearch(
  log: ReadingLogEntry,
  book: CanonBook | undefined
): IndexedReadingLog {
  const cached = indexedLogCache.get(log);
  if (cached && (!book || cached.log.bookId === book.id)) {
    return cached;
  }
  const indexed: IndexedReadingLog = {
    log,
    bookAliases: getBookAliases(book),
    chapterSet: new Set(log.chapters),
    chapterRange: normalizeSearchText(formatChapterRanges(log.chapters)),
    noteText: log.note ? normalizeSearchText(log.note) : '',
    dateInfo: buildDateSearchInfo(log.readDate),
  };
  if (book && log.bookId === book.id) {
    indexedLogCache.set(log, indexed);
  }
  return indexed;
}

export interface CompiledLogSearchQuery {
  normalized: string;
  isPureShortNumber: boolean;
  tokens: QueryToken[];
  hasBookOrWordToken: boolean;
}

/** Pre-tokenizes a user search query once outside filter loops. */
export function compileLogSearchQuery(rawQuery: string): CompiledLogSearchQuery {
  const normalized = normalizeSearchText(rawQuery);
  if (!normalized) {
    return {
      normalized: '',
      isPureShortNumber: false,
      tokens: [],
      hasBookOrWordToken: false,
    };
  }
  const isPureShortNumber = /^\d{1,3}$/.test(normalized) && Number(normalized) <= 150;
  const tokens = tokenizeQuery(normalized);
  const hasBookOrWordToken = tokens.some(
    (t) =>
      t.kind === 'book' ||
      (t.kind === 'text' &&
        !MONTH_TOKENS.has(t.value) &&
        !t.value.includes('/') &&
        !t.value.includes('-'))
  );
  return {
    normalized,
    isPureShortNumber,
    tokens,
    hasBookOrWordToken,
  };
}

/** Matches a pre-indexed reading log entry against a pre-compiled search query. */
export function matchesCompiledReadingLog(
  entry: IndexedReadingLog,
  compiled: CompiledLogSearchQuery
): boolean {
  const { normalized: q, isPureShortNumber, tokens, hasBookOrWordToken } = compiled;
  if (!q) return true;

  const { bookAliases, chapterSet, chapterRange, noteText, dateInfo } = entry;

  if (noteText && noteText.includes(q)) {
    return true;
  }

  if (!isPureShortNumber && dateInfo.texts.some((t) => t.startsWith(q))) {
    return true;
  }

  if (tokens.length === 0) return true;

  return tokens.every((tok) => {
    switch (tok.kind) {
      case 'book':
        return bookAliases.some((a) => a.includes(tok.value)) || noteText.includes(tok.value);

      case 'date':
        return (
          dateInfo.texts.some((d) => d.startsWith(tok.value) || d.startsWith(tok.rawPair)) ||
          noteText.includes(tok.rawPair)
        );

      case 'range': {
        for (let ch = tok.start; ch <= tok.end; ch++) {
          if (chapterSet.has(ch)) return true;
        }
        if (noteText.includes(tok.raw)) return true;
        if (!hasBookOrWordToken && dateInfo.texts.some((d) => d.startsWith(tok.raw))) {
          return true;
        }
        return false;
      }

      case 'rangePrefix':
        return (
          chapterSet.has(tok.start) ||
          noteText.includes(tok.raw) ||
          (!hasBookOrWordToken && dateInfo.texts.some((d) => d.startsWith(tok.raw)))
        );

      case 'number': {
        if (tok.value > 150) {
          return dateInfo.texts.some((d) => d.startsWith(tok.raw)) || noteText.includes(tok.raw);
        }
        if (chapterSet.has(tok.value) || noteText.includes(tok.raw)) {
          return true;
        }
        if (!hasBookOrWordToken) {
          if (dateInfo.day === tok.value || dateInfo.month === tok.value) {
            return true;
          }
          if (tok.value >= 1 && tok.value <= 3 && bookAliases.some((a) => a.startsWith(`${tok.raw} `))) {
            return true;
          }
        }
        return false;
      }

      case 'text':
        return (
          bookAliases.some((a) => a.includes(tok.value)) ||
          noteText.includes(tok.value) ||
          dateInfo.texts.some((d) => d.startsWith(tok.value)) ||
          chapterRange.includes(tok.value)
        );
    }
  });
}

/** Matches a pre-indexed reading log entry against a user search query. */
export function matchesIndexedReadingLog(
  entry: IndexedReadingLog,
  rawQuery: string
): boolean {
  return matchesCompiledReadingLog(entry, compileLogSearchQuery(rawQuery));
}

/** Matches a reading log entry against a search query across book, chapters, note, and date. */
export function matchesReadingLogQuery(
  log: ReadingLogEntry,
  book: CanonBook | undefined,
  rawQuery: string
): boolean {
  return matchesIndexedReadingLog(indexReadingLogForSearch(log, book), rawQuery);
}
