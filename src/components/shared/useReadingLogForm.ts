import { useEffect, useMemo, useRef, useState } from 'react';
import { BIBLE_BOOKS, BOOKS_BY_ID } from '../../data/bibleCanon';
import { todayPlainDate } from '../../lib/dates';
import { getSuggestedBookId, parseChapterInput } from '../../lib/progress';
import type { BibleProgressSummary } from '../../types/bible';

/**
 * Shared state and chapter-range validation hook for logging Bible passages
 * (reused by QuickLogCard and JournalComposer).
 */
export function useReadingLogForm(
  summary: BibleProgressSummary,
  options: { syncSuggestedBook?: boolean } = {}
) {
  const { syncSuggestedBook = false } = options;
  const suggestedBookId = useMemo(() => getSuggestedBookId(summary), [summary]);

  const [bookId, setBookIdState] = useState<string>(suggestedBookId);
  const manualBookSelectionRef = useRef(false);
  const [chaptersText, setChaptersText] = useState('');
  const [readDate, setReadDate] = useState(() => todayPlainDate());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (syncSuggestedBook && !manualBookSelectionRef.current) {
      setBookIdState(suggestedBookId);
    }
  }, [suggestedBookId, syncSuggestedBook]);

  const selectBook = (nextBookId: string, options?: { clearChapters?: boolean }) => {
    manualBookSelectionRef.current = true;
    setBookIdState(nextBookId);
    if (options?.clearChapters) {
      setChaptersText('');
    }
    setError(null);
  };

  const selectedBook = BOOKS_BY_ID[bookId] ?? BIBLE_BOOKS[0];
  const selectedProgress = summary.bookProgressById[selectedBook.id];
  const nextChapter = selectedProgress?.nextUnreadChapter ?? 1;

  const parseAndValidateChapters = (): number[] | null => {
    setError(null);
    const expr = chaptersText.trim() || String(nextChapter);
    const parsed = parseChapterInput(expr, selectedBook.chapterCount);
    if (parsed.length === 0) {
      setError(
        `Enter chapter numbers between 1 and ${selectedBook.chapterCount} (for example, 1-3 or 5).`
      );
      return null;
    }
    return parsed;
  };

  return {
    bookId,
    selectBook,
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
  };
}
