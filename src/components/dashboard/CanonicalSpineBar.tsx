import React, { useMemo, useState } from 'react';
import {
  BIBLE_BOOKS,
  DIVISIONS,
  DIVISION_META_BY_ID,
  NT_BOOKS,
  OT_BOOKS,
} from '../../data/bibleCanon';
import { useReadingData } from '../../store/useBibleStore';
import type { BibleDivision, BookProgress, CanonBook } from '../../types/bible';

interface CanonicalSpineBarProps {
  onOpenBook: (bookId: string) => void;
}

interface SpineSegmentProps {
  books: CanonBook[];
  bookProgressById: Record<string, BookProgress>;
  hoveredBookId: string | null;
  activeDivision: BibleDivision | null;
  onHoverBook: (book: CanonBook | null) => void;
  onOpenBook: (bookId: string) => void;
}

const SpineSegment = React.memo<SpineSegmentProps>(
  ({
    books,
    bookProgressById,
    hoveredBookId,
    activeDivision,
    onHoverBook,
    onOpenBook,
  }) => (
    <div className="flex min-w-0 items-stretch gap-px pt-1 sm:gap-[2px]">
      {books.map((book) => {
        const bp = bookProgressById[book.id];
        const divMeta = DIVISION_META_BY_ID[book.division];
        const pct = bp?.percentage ?? 0;
        const isComplete = bp?.completed ?? false;
        const isActive = hoveredBookId === book.id;
        const isDivisionHighlighted = activeDivision === book.division;
        const isDimmedByDivision = activeDivision !== null && activeDivision !== book.division;

        return (
          <button
            key={book.id}
            type="button"
            onClick={() => onOpenBook(book.id)}
            onMouseEnter={() => onHoverBook(book)}
            onFocus={() => onHoverBook(book)}
            onMouseLeave={() => onHoverBook(null)}
            onBlur={() => onHoverBook(null)}
            style={{ flexGrow: book.chapterCount, flexBasis: 0 }}
            title={`${book.name}: ${bp?.readChapters ?? 0} of ${book.chapterCount} chapters read`}
            aria-label={`${book.name}: ${bp?.readChapters ?? 0} of ${book.chapterCount} chapters read`}
            className={`group relative h-11 min-w-[2px] overflow-hidden rounded-[2px] bg-[var(--bg-subtle)] transition-[transform,opacity,box-shadow] duration-150 active:scale-y-90 sm:h-12 sm:min-w-[3px] ${
              isActive || isDivisionHighlighted
                ? '-translate-y-0.5 ring-1 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--bg-elevated)]'
                : ''
            } ${isDimmedByDivision ? 'opacity-35' : 'opacity-100'}`}
          >
            <span
              aria-hidden="true"
              className={`absolute inset-0 transition-opacity ${
                isDivisionHighlighted ? 'opacity-30' : 'opacity-0 group-hover:opacity-20'
              }`}
              style={{ backgroundColor: divMeta.colorVar }}
            />
            {pct > 0 && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 origin-bottom transition-[height] duration-300 ease-out"
                style={{
                  height: `${pct}%`,
                  backgroundColor: isComplete ? 'var(--color-sage)' : divMeta.colorVar,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  )
);
SpineSegment.displayName = 'SpineSegment';

const BOOKS_BY_DIVISION: Record<BibleDivision, CanonBook[]> = Object.fromEntries(
  DIVISIONS.map((div) => [div.id, BIBLE_BOOKS.filter((b) => b.division === div.id)])
) as Record<BibleDivision, CanonBook[]>;

export const CanonicalSpineBar: React.FC<CanonicalSpineBarProps> = React.memo(({ onOpenBook }) => {
  const { summary } = useReadingData();
  const [hoveredBook, setHoveredBook] = useState<CanonBook | null>(null);
  const [hoveredDivision, setHoveredDivision] = useState<BibleDivision | null>(null);
  const [pinnedDivision, setPinnedDivision] = useState<BibleDivision | null>(null);

  const divisionStats = useMemo(() => {
    return DIVISIONS.map((div) => {
      const books = BOOKS_BY_DIVISION[div.id];
      let read = 0;
      let total = 0;
      for (const b of books) {
        total += b.chapterCount;
        read += summary.bookProgressById[b.id]?.readChapters ?? 0;
      }
      return { div, read, total, bookCount: books.length };
    });
  }, [summary.bookProgressById]);

  const activeDivision = hoveredDivision ?? pinnedDivision;
  const hoveredProgress = hoveredBook ? summary.bookProgressById[hoveredBook.id] : null;
  const hoveredDiv = hoveredBook ? DIVISION_META_BY_ID[hoveredBook.division] : null;
  const activeDivisionStat = activeDivision
    ? divisionStats.find((d) => d.div.id === activeDivision) ?? null
    : null;

  return (
    <div className="pt-5">
      {/* Live Inspection Line */}
      <div className="mb-2.5 min-h-5 text-xs">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          {hoveredBook && hoveredProgress && hoveredDiv ? (
            <>
              <div className="flex items-baseline gap-2.5">
                <span className="font-display text-sm font-medium text-[var(--text-primary)]">
                  {hoveredBook.name}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: hoveredDiv.colorVar }}
                  />
                  {hoveredDiv.label}
                </span>
              </div>
              <span className="font-medium tabular-nums text-[var(--text-primary)]">
                {hoveredProgress.readChapters} of {hoveredProgress.totalChapters} chapters (
                {Math.round(hoveredProgress.percentage)}%)
              </span>
            </>
          ) : activeDivisionStat ? (
            <>
              <div className="flex items-baseline gap-2.5">
                <span className="inline-flex items-center gap-1.5 font-display text-sm font-medium text-[var(--text-primary)]">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: activeDivisionStat.div.colorVar }}
                  />
                  {activeDivisionStat.div.label}
                </span>
                <span className="text-[var(--text-secondary)]">
                  {activeDivisionStat.bookCount} books
                </span>
              </div>
              <span className="font-medium tabular-nums text-[var(--text-primary)]">
                {activeDivisionStat.read} of {activeDivisionStat.total} chapters (
                {Math.round((activeDivisionStat.read / activeDivisionStat.total) * 100)}%)
              </span>
            </>
          ) : (
            <>
              <span className="text-[var(--text-secondary)]">
                All 66 books sized by chapter count. Click any bar to open its chapters.
              </span>
              <span className="hidden text-[var(--text-secondary)] tabular-nums sm:inline">
                Genesis to Revelation
              </span>
            </>
          )}
        </div>
      </div>

      {/* 66-Book Proportional Progress Track */}
      <div
        className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-3"
        role="group"
        aria-label="66-book Bible progress bar"
      >
        <div className="spine-segment-ot min-w-0">
          <SpineSegment
            books={OT_BOOKS}
            bookProgressById={summary.bookProgressById}
            hoveredBookId={hoveredBook?.id ?? null}
            activeDivision={activeDivision}
            onHoverBook={setHoveredBook}
            onOpenBook={onOpenBook}
          />
          <div className="mt-1 flex items-center justify-between text-[0.7rem] text-[var(--text-secondary)] tabular-nums sm:hidden">
            <span>Old Testament</span>
            <span>39 books, 929 ch</span>
          </div>
        </div>
        <div className="hidden w-px shrink-0 bg-[var(--border-strong)] sm:block" aria-hidden="true" />
        <div className="spine-segment-nt min-w-0">
          <SpineSegment
            books={NT_BOOKS}
            bookProgressById={summary.bookProgressById}
            hoveredBookId={hoveredBook?.id ?? null}
            activeDivision={activeDivision}
            onHoverBook={setHoveredBook}
            onOpenBook={onOpenBook}
          />
          <div className="mt-1 flex items-center justify-between text-[0.7rem] text-[var(--text-secondary)] tabular-nums sm:hidden">
            <span>New Testament</span>
            <span>27 books, 260 ch</span>
          </div>
        </div>
      </div>

      {/* Testament Span Labels (Desktop / Tablet) */}
      <div className="mt-2 hidden items-center justify-between text-[0.72rem] text-[var(--text-secondary)] tabular-nums sm:flex">
        <span>Old Testament (39 books, 929 chapters)</span>
        <span>New Testament (27 books, 260 chapters)</span>
      </div>

      {/* 8-Division Balanced Grid Key */}
      <div
        className="mt-3 grid grid-cols-2 gap-1 border-t border-[var(--border-subtle)]/70 pt-3 text-[0.72rem] text-[var(--text-secondary)] sm:grid-cols-4 sm:gap-1.5"
        aria-label="Bible sections legend"
      >
        {divisionStats.map(({ div, read, total }) => {
          const isPinned = pinnedDivision === div.id;
          const isHighlighted = activeDivision === div.id;
          return (
            <button
              key={div.id}
              type="button"
              aria-pressed={isPinned}
              onClick={() => setPinnedDivision((prev) => (prev === div.id ? null : div.id))}
              onMouseEnter={() => setHoveredDivision(div.id)}
              onMouseLeave={() => setHoveredDivision(null)}
              className={`tactile-press flex min-h-7 items-center justify-between gap-1.5 rounded-md px-2 py-0.5 text-left transition-colors sm:min-h-0 ${
                isPinned
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] ring-1 ring-[var(--border-strong)]'
                  : isHighlighted
                    ? 'text-[var(--text-primary)]'
                    : 'hover:bg-[var(--bg-surface)]/50 hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: div.colorVar }}
                />
                <span className="truncate">{div.shortLabel}</span>
              </span>
              <span className="shrink-0 tabular-nums opacity-75">
                {read}/{total}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
CanonicalSpineBar.displayName = 'CanonicalSpineBar';
