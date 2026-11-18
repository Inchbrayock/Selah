import React, { useCallback, useState } from 'react';
import {
  BIBLE_BOOKS,
  DIVISION_META_BY_ID,
  NT_BOOKS,
  OT_BOOKS,
} from '../../data/bibleCanon';
import { useReadingData } from '../../store/useBibleStore';
import type { BookProgress } from '../../types/bible';

interface WholeBibleMosaicProps {
  onSelectBook: (bookId: string) => void;
}

interface HoveredTile {
  bookName: string;
  chapter: number;
  readCount: number;
}

interface MosaicTestamentGroupProps {
  title: string;
  subtitle: string;
  books: typeof BIBLE_BOOKS;
  bookProgressById: Record<string, BookProgress>;
  onSelectBook: (bookId: string) => void;
  onHoverTile: (tile: HoveredTile | null) => void;
}

const MosaicTestamentGroup = React.memo<MosaicTestamentGroupProps>(
  ({ title, subtitle, books, bookProgressById, onSelectBook, onHoverTile }) => {
    const handleMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
      const tile =
        e.target instanceof HTMLElement
          ? e.target.closest<HTMLElement>('[data-mosaic-ch]')
          : null;
      if (!tile) return;
      const bookName = tile.dataset.bookName;
      const chapter = Number(tile.dataset.mosaicCh);
      const readCount = Number(tile.dataset.readCount ?? 0);
      if (bookName && chapter) {
        onHoverTile({ bookName, chapter, readCount });
      }
    };

    return (
      <div>
        <div className="flex items-baseline justify-between border-b border-[var(--border-subtle)] pb-2">
          <h3 className="font-display text-xl font-medium text-[var(--text-primary)]">{title}</h3>
          <span className="text-xs text-[var(--text-secondary)] tabular-nums">{subtitle}</span>
        </div>
        <div
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onMouseOver={handleMouseOver}
          onMouseLeave={() => onHoverTile(null)}
        >
          {books.map((book) => {
            const bp = bookProgressById[book.id];
            const divMeta = DIVISION_META_BY_ID[book.division];
            const readCountTotal = bp?.readChapters ?? 0;
            return (
              <button
                key={book.id}
                type="button"
                onClick={() => onSelectBook(book.id)}
                aria-label={`Open ${book.name}: ${readCountTotal} of ${book.chapterCount} chapters read`}
                className="tactile-press group rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5 text-left hover:border-[var(--border-strong)]"
              >
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="font-display text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--color-accent)]">
                    {book.name}
                  </span>
                  <span className="text-xs tabular-nums text-[var(--text-secondary)]">
                    {readCountTotal}/{book.chapterCount}
                  </span>
                </div>
                <div className="flex flex-wrap gap-[3px]">
                  {Array.from({ length: book.chapterCount }, (_, idx) => {
                    const ch = idx + 1;
                    const state = bp?.chapterMap[ch];
                    const readCount = state?.readCount ?? 0;
                    const bg = readCount > 0 ? divMeta.colorVar : 'var(--bg-subtle)';
                    const isReread = readCount >= 2;
                    return (
                      <span
                        key={ch}
                        aria-hidden="true"
                        data-book-name={book.name}
                        data-mosaic-ch={ch}
                        data-read-count={readCount}
                        className={`relative inline-flex h-2.5 w-2.5 items-center justify-center rounded-[1.5px] sm:h-[9px] sm:w-[9px] ${
                          readCount > 0 ? 'chapter-tile-read' : ''
                        } ${isReread ? 'ring-1 ring-[var(--text-primary)]/75' : ''}`}
                        style={{ backgroundColor: bg }}
                      >
                        {isReread && (
                          <span className="pointer-events-none h-[3px] w-[3px] rounded-full bg-[var(--bg-canvas)]" />
                        )}
                      </span>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);
MosaicTestamentGroup.displayName = 'MosaicTestamentGroup';

export const WholeBibleMosaic: React.FC<WholeBibleMosaicProps> = ({ onSelectBook }) => {
  const { summary } = useReadingData();
  const [hovered, setHovered] = useState<HoveredTile | null>(null);

  const handleHoverTile = useCallback((tile: HoveredTile | null) => {
    setHovered((prev) => {
      if (
        prev?.bookName === tile?.bookName &&
        prev?.chapter === tile?.chapter &&
        prev?.readCount === tile?.readCount
      ) {
        return prev;
      }
      return tile;
    });
  }, []);

  return (
    <section className="folio-sheet p-4 sm:p-7" aria-labelledby="mosaic-heading">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <h2
            id="mosaic-heading"
            className="font-display text-2xl font-medium text-[var(--text-primary)]"
          >
            All 1,189 Chapters
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Every square represents one chapter. Select any book to open its chapters.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[1.5px] bg-[var(--bg-subtle)]" />
            Unread
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[1.5px] bg-[var(--color-accent)]" />
            Read (section color)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-[1.5px] bg-[var(--color-accent)] ring-1 ring-[var(--text-primary)]/75">
              <span className="h-[3px] w-[3px] rounded-full bg-[var(--bg-canvas)]" />
            </span>
            Re-read 2×+
          </span>
        </div>
      </div>

      <div className="mt-4 hidden min-h-5 text-xs font-medium text-[var(--text-secondary)] sm:block">
        {hovered ? (
          <span>
            <strong className="font-semibold text-[var(--text-primary)]">
              {hovered.bookName} {hovered.chapter}
            </strong>{' '}
            — {hovered.readCount === 0 ? 'Unread' : `Read ${hovered.readCount}×`}
          </span>
        ) : (
          <span>Hover any square to inspect status, or select a book to log chapters.</span>
        )}
      </div>

      <div className="mt-5 space-y-10">
        <MosaicTestamentGroup
          title="Old Testament"
          subtitle="929 chapters"
          books={OT_BOOKS}
          bookProgressById={summary.bookProgressById}
          onSelectBook={onSelectBook}
          onHoverTile={handleHoverTile}
        />
        <MosaicTestamentGroup
          title="New Testament"
          subtitle="260 chapters"
          books={NT_BOOKS}
          bookProgressById={summary.bookProgressById}
          onSelectBook={onSelectBook}
          onHoverTile={handleHoverTile}
        />
      </div>
    </section>
  );
};
