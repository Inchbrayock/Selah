import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BookMarked, Check, Plus } from 'lucide-react';
import { NT_BOOKS, OT_BOOKS } from '../../data/bibleCanon';
import { todayPlainDate } from '../../lib/dates';
import { FOLIO_EASE, SPRING_SEAL, SPRING_TACTILE } from '../../lib/motion';
import { useReadingData } from '../../store/useBibleStore';
import { useReadingLogForm } from '../shared/useReadingLogForm';

interface QuickLogCardProps {
  onOpenBook?: (bookId: string) => void;
  headingLevel?: 'h1' | 'h2';
}

export const QuickLogCard: React.FC<QuickLogCardProps> = ({
  onOpenBook,
  headingLevel = 'h2',
}) => {
  const { summary, logChapters } = useReadingData();
  const {
    bookId,
    selectBook,
    advanceBookIfFinished,
    chaptersText,
    setChaptersText,
    readDate,
    setReadDate,
    note,
    setNote,
    error,
    setError,
    selectedBook,
    selectedProgress,
    nextChapter,
    parseAndValidateChapters,
  } = useReadingLogForm(summary, { syncSuggestedBook: true });

  const [loggedSource, setLoggedSource] = useState<'quick' | 'manual' | null>(null);
  const [quickStamp, setQuickStamp] = useState<{ id: number; label: string } | null>(null);
  const stampIdRef = useRef(0);

  // Quick-range presets tailored to the currently selected book's next chapter
  const rangePresets = useMemo(() => {
    const max = selectedBook.chapterCount;
    const start = Math.min(nextChapter, max);
    const presets: { label: string; value: string }[] = [
      { label: `Ch. ${start}`, value: String(start) },
    ];
    for (const span of [2, 3, 5]) {
      const end = Math.min(max, start + span - 1);
      if (end > start && !presets.some((p) => p.value === `${start}-${end}`)) {
        presets.push({ label: `${start}–${end}`, value: `${start}-${end}` });
      }
    }
    return presets;
  }, [nextChapter, selectedBook.chapterCount]);

  const triggerStamp = (label: string) => {
    const id = ++stampIdRef.current;
    setQuickStamp({ id, label });
    setTimeout(() => {
      setQuickStamp((prev) => (prev?.id === id ? null : prev));
    }, 1500);
  };

  const handleOneClickNext = async () => {
    const loggedBookId = selectedBook.id;
    const loggedShortName = selectedBook.shortName;
    const loggedChapter = nextChapter;
    await logChapters({
      bookId: loggedBookId,
      chapters: [loggedChapter],
      readDate: todayPlainDate(),
    });
    advanceBookIfFinished(loggedBookId, [loggedChapter], { keepSyncingSuggested: true });
    setLoggedSource('quick');
    triggerStamp(`+1 ch · ${loggedShortName} ${loggedChapter}`);
    setTimeout(() => setLoggedSource((prev) => (prev === 'quick' ? null : prev)), 2200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseAndValidateChapters();
    if (!parsed) return;

    const loggedBookId = selectedBook.id;
    const effectiveDate = readDate || todayPlainDate();
    await logChapters({
      bookId: loggedBookId,
      chapters: parsed,
      readDate: effectiveDate,
      note,
    });
    advanceBookIfFinished(loggedBookId, parsed, {
      keepSyncingSuggested: effectiveDate === todayPlainDate(),
    });
    setChaptersText('');
    setNote('');
    setLoggedSource('manual');
    triggerStamp(`+${parsed.length} ch`);
    setTimeout(() => setLoggedSource((prev) => (prev === 'manual' ? null : prev)), 2600);
  };

  const HeadingTag = headingLevel;

  return (
    <section
      className="folio-sheet relative flex h-full flex-col justify-between overflow-hidden p-4 sm:p-7"
      aria-labelledby="quick-log-heading"
    >
      {/* Brief luminous seal sweep when a reading is logged */}
      <AnimatePresence>
        {quickStamp ? (
          <motion.span
            key={quickStamp.id}
            aria-hidden="true"
            initial={{ x: '-110%', opacity: 0.7 }}
            animate={{ x: '140%', opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.75, ease: FOLIO_EASE }}
            className="pointer-events-none absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-[color-mix(in_oklab,var(--color-sage)_14%,transparent)] to-transparent"
          />
        ) : null}
      </AnimatePresence>

      <div>
        <div className="flex flex-col justify-between gap-3.5 border-b border-[var(--border-subtle)] pb-4 sm:flex-row sm:flex-wrap sm:items-start sm:gap-4 sm:pb-5">
          <div>
            <HeadingTag
              id="quick-log-heading"
              className="font-display text-2xl font-medium tracking-tight text-[var(--text-primary)]"
            >
              Log a Reading
            </HeadingTag>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Record today’s chapters or backdate an earlier reading.
            </p>
          </div>

          <div className="relative w-full sm:w-auto">
            <AnimatePresence>
              {quickStamp ? (
                <motion.span
                  key={quickStamp.id}
                  aria-hidden="true"
                  initial={{ opacity: 0, y: 4, scale: 0.85 }}
                  animate={{ opacity: 1, y: -22, scale: 1 }}
                  exit={{ opacity: 0, y: -34, scale: 0.94 }}
                  transition={SPRING_SEAL}
                  className="pointer-events-none absolute right-2 top-0 z-10 rounded-full border border-[var(--color-sage)] bg-[var(--color-sage-soft)] px-2.5 py-0.5 text-[0.7rem] font-semibold text-[var(--color-sage)] shadow-xs tabular-nums"
                >
                  {quickStamp.label}
                </motion.span>
              ) : null}
            </AnimatePresence>

            <button
              type="button"
              onClick={() => void handleOneClickNext()}
              className="tactile-press btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-opacity hover:opacity-90 sm:min-h-10 sm:w-auto"
            >
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Quick Log: {selectedBook.shortName} {nextChapter}
              </span>
            </button>
          </div>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="mt-5 grid grid-cols-2 gap-3.5 sm:mt-6 sm:grid-cols-12 sm:gap-4"
        >
          <div className="col-span-2 sm:col-span-5">
            <label
              htmlFor="quick-book-select"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              Book
            </label>
            <select
              id="quick-book-select"
              value={bookId}
              onChange={(e) => selectBook(e.target.value, { clearChapters: true })}
              className="folio-input mt-1.5 min-h-11 w-full px-3 py-2 text-base font-medium sm:min-h-10 sm:text-sm"
            >
              <optgroup label="Old Testament">
                {OT_BOOKS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.chapterCount} ch)
                  </option>
                ))}
              </optgroup>
              <optgroup label="New Testament">
                {NT_BOOKS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.chapterCount} ch)
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="col-span-1 sm:col-span-4">
            <label
              htmlFor="quick-chapters-input"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              Chapters
            </label>
            <input
              id="quick-chapters-input"
              type="text"
              value={chaptersText}
              onChange={(e) => {
                setChaptersText(e.target.value);
                setError(null);
              }}
              placeholder={`Next: ${nextChapter} (or 1-4)`}
              aria-describedby="quick-chapters-hint"
              className="folio-input mt-1.5 min-h-11 w-full px-3 py-2 text-base placeholder:text-[var(--text-secondary)] sm:min-h-10 sm:text-sm"
            />
            <p id="quick-chapters-hint" className="mt-1 text-xs text-[var(--text-secondary)]">
              Up to ch. {selectedBook.chapterCount}
            </p>
          </div>

          <div className="col-span-1 sm:col-span-3">
            <label
              htmlFor="quick-date-input"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              Date read
            </label>
            <input
              id="quick-date-input"
              type="date"
              value={readDate}
              max={todayPlainDate()}
              onChange={(e) => setReadDate(e.target.value)}
              className="folio-input mt-1.5 min-h-11 w-full px-2.5 py-2 text-base sm:min-h-10 sm:px-3 sm:text-sm"
            />
          </div>

          {/* 1-tap chapter range presets */}
          {rangePresets.length > 1 && (
            <div className="col-span-2 flex flex-wrap items-center gap-1.5 sm:col-span-12">
              <span className="text-xs text-[var(--text-secondary)]">Quick range:</span>
              {rangePresets.map((preset) => {
                const isSelected = chaptersText.trim() === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => {
                      setChaptersText(preset.value);
                      setError(null);
                    }}
                    className={`min-h-7 rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors ${
                      isSelected
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          )}

          <div className="col-span-2 sm:col-span-8">
            <label
              htmlFor="quick-note-input"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              Note or key verse (optional)
            </label>
            <textarea
              id="quick-note-input"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What stood out in today’s reading?"
              className="folio-input mt-1.5 w-full resize-none px-3 py-2 text-base placeholder:text-[var(--text-secondary)] sm:text-sm"
            />
          </div>

          <div className="col-span-2 flex items-end sm:col-span-4">
            <motion.button
              type="submit"
              animate={{ scale: loggedSource === 'manual' ? 1.02 : 1 }}
              transition={SPRING_TACTILE}
              className="tactile-press btn-sage inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 sm:min-h-10 sm:px-3"
            >
              {loggedSource === 'manual' ? (
                <>
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <motion.path
                      d="M20 6 9 17l-5-5"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.28, ease: FOLIO_EASE }}
                    />
                  </svg>
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Log Reading</span>
                </>
              )}
            </motion.button>
          </div>
        </form>

        {error ? (
          <p role="alert" className="mt-3 text-xs font-medium text-[var(--color-crimson)]">
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3.5 text-xs text-[var(--text-secondary)] sm:mt-6 sm:pt-4">
        <span className="tabular-nums">
          {selectedBook.name}: {selectedProgress?.readChapters ?? 0} of {selectedBook.chapterCount}{' '}
          chapters read
        </span>
        {onOpenBook ? (
          <button
            type="button"
            onClick={() => onOpenBook(selectedBook.id)}
            className="tactile-press inline-flex min-h-9 items-center gap-1.5 font-medium text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            <BookMarked className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Open {selectedBook.name} chapters</span>
          </button>
        ) : null}
      </div>
    </section>
  );
};
