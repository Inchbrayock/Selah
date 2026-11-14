import React, { useMemo, useState } from 'react';
import { BIBLE_BOOKS, DIVISIONS, DIVISION_META_BY_ID } from '../../data/bibleCanon';
import { decodeBookProgressSpec } from '../../lib/friends';
import type { CanonBook } from '../../types/bible';

interface MiniCanonicalSpineProps {
  bookProgressSpec: string;
  interactive?: boolean;
  heightClassName?: string;
}

/**
 * Compact 66-book proportional canonical ribbon mirroring CanonicalSpineBar
 * in Selah's mineral division pigments.
 */
export const MiniCanonicalSpine: React.FC<MiniCanonicalSpineProps> = ({
  bookProgressSpec,
  interactive = false,
  heightClassName,
}) => {
  const countsByBook = useMemo(() => decodeBookProgressSpec(bookProgressSpec), [bookProgressSpec]);
  const [hoveredBook, setHoveredBook] = useState<CanonBook | null>(null);

  const otBooks = useMemo(() => BIBLE_BOOKS.filter((b) => b.testament === 'OT'), []);
  const ntBooks = useMemo(() => BIBLE_BOOKS.filter((b) => b.testament === 'NT'), []);

  const totalRead = useMemo(
    () => Object.values(countsByBook).reduce((sum, count) => sum + count, 0),
    [countsByBook]
  );

  const barHeight = heightClassName ?? (interactive ? 'h-7 sm:h-8' : 'h-2.5 sm:h-3');

  const renderGroup = (books: CanonBook[]) =>
    books.map((book) => {
      const read = countsByBook[book.id] ?? 0;
      const pct = book.chapterCount > 0 ? Math.min(100, (read / book.chapterCount) * 100) : 0;
      const complete = read >= book.chapterCount;
      const divMeta = DIVISION_META_BY_ID[book.division];
      const isHovered = interactive && hoveredBook?.id === book.id;

      if (interactive) {
        return (
          <button
            key={book.id}
            type="button"
            onMouseEnter={() => setHoveredBook(book)}
            onFocus={() => setHoveredBook(book)}
            onMouseLeave={() => setHoveredBook(null)}
            onBlur={() => setHoveredBook(null)}
            style={{ flexGrow: book.chapterCount, flexBasis: 0 }}
            aria-label={`${book.name}: ${read} of ${book.chapterCount} chapters`}
            className={`relative ${barHeight} min-w-[2px] overflow-hidden rounded-[1.5px] bg-[var(--bg-subtle)] transition-transform ${
              isHovered
                ? '-translate-y-0.5 ring-1 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--bg-elevated)]'
                : ''
            }`}
          >
            {pct > 0 && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0"
                style={{
                  height: `${pct}%`,
                  backgroundColor: complete ? 'var(--color-sage)' : divMeta.colorVar,
                }}
              />
            )}
          </button>
        );
      }

      return (
        <span
          key={book.id}
          aria-hidden="true"
          style={{ flexGrow: book.chapterCount, flexBasis: 0 }}
          className={`relative ${barHeight} min-w-[1px] overflow-hidden rounded-[1px] bg-[var(--bg-subtle)]`}
        >
          {pct > 0 && (
            <span
              className="absolute inset-x-0 bottom-0"
              style={{
                height: `${pct}%`,
                backgroundColor: complete ? 'var(--color-sage)' : divMeta.colorVar,
              }}
            />
          )}
        </span>
      );
    });

  const hoveredRead = hoveredBook ? countsByBook[hoveredBook.id] ?? 0 : 0;

  return (
    <div>
      {interactive && (
        <div className="mb-2 flex min-h-5 items-center justify-between gap-2 text-xs">
          {hoveredBook ? (
            <span className="font-medium text-[var(--text-primary)] tabular-nums">
              {hoveredBook.name}: {hoveredRead} of {hoveredBook.chapterCount} chapters
            </span>
          ) : (
            <span className="text-[var(--text-secondary)]">
              Select or hover any book spine to inspect progress
            </span>
          )}
        </div>
      )}

      <div
        role={interactive ? undefined : 'img'}
        aria-label={
          interactive
            ? undefined
            : `66-book reading spine: ${totalRead.toLocaleString()} of 1,189 chapters read`
        }
        className="flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-2"
      >
        <div className="flex flex-[929_1_0%] items-end gap-[1px]">{renderGroup(otBooks)}</div>
        <div className="flex flex-[260_1_0%] items-end gap-[1px]">{renderGroup(ntBooks)}</div>
      </div>

      {interactive && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[0.7rem] text-[var(--text-secondary)]">
          {DIVISIONS.map((div) => (
            <span key={div.id} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-xs"
                style={{ backgroundColor: div.colorVar }}
              />
              <span>{div.shortLabel}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
