import { beforeEach, describe, expect, it } from 'vitest';
import {
  addReadingLogsBatch,
  clearAllSanctuaryData,
  loadSanctuaryState,
  removeChaptersFromBookLogs,
} from '../db/repository';

describe('Repository batch and targeted writes', () => {
  beforeEach(async () => {
    await clearAllSanctuaryData();
  });

  it('inserts multiple reading entries in one batch and removes book chapters incrementally', async () => {
    const created = await addReadingLogsBatch([
      { bookId: 'psalms', chapters: [1, 2, 3], readDate: '2026-11-10', planId: 'psalms-proverbs-31' },
      { bookId: 'proverbs', chapters: [1], readDate: '2026-11-10', planId: 'psalms-proverbs-31' },
      { bookId: 'psalms', chapters: [4], readDate: '2026-11-11' },
    ]);

    expect(created).toHaveLength(3);
    const initial = await loadSanctuaryState();
    expect(initial.logs).toHaveLength(3);

    // Remove chapters 2 and 4 from Psalms: first entry keeps [1, 3], third entry is deleted, Proverbs is untouched
    const afterRemove = await removeChaptersFromBookLogs('psalms', [2, 4], initial.logs);
    expect(afterRemove).toHaveLength(2);
    expect(afterRemove.find((l) => l.bookId === 'psalms')?.chapters).toEqual([1, 3]);
    expect(afterRemove.find((l) => l.bookId === 'proverbs')?.chapters).toEqual([1]);

    // Confirm persisted state matches returned array
    const persisted = await loadSanctuaryState();
    expect(persisted.logs).toHaveLength(2);
    expect(persisted.logs.find((l) => l.bookId === 'psalms')?.chapters).toEqual([1, 3]);
  });
});
