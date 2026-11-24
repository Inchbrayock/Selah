import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { formatPlainDate, formatShortDate, todayPlainDate } from '../lib/dates';

vi.setConfig({ testTimeout: 15000 });

function getWholeBibleChapterReadout(chaptersRead: number) {
  return screen.getByText(
    (_, el) => el?.tagName === 'SPAN' && el.textContent?.trim() === `${chaptersRead} / 1,189 ch`
  );
}

describe('Selah Bible Tracker App UI', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders Home dashboard, loads sample data, and navigates all views', async () => {
    render(<App />);

    expect(await screen.findByText(/Bible Progress/i)).toBeInTheDocument();

    const previewBtn = screen.getByRole('button', { name: /Try sample data/i });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(screen.getByText(/days streak/i)).toBeInTheDocument();
    });

    const header = document.querySelector('header');
    expect(header).not.toBeNull();
    expect(header?.textContent).not.toMatch(/1,189|134|12d|streak/i);

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    fireEvent.click(within(nav).getByRole('button', { name: /^Books$/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /^Books$/i })).toBeInTheDocument();
    expect(screen.getByText('Genesis')).toBeInTheDocument();

    const search = screen.getByLabelText(/Search Bible books/i);
    fireEvent.change(search, { target: { value: 'Psalms' } });
    expect(screen.getByText('Psalms')).toBeInTheDocument();
    expect(screen.queryByText('Revelation')).not.toBeInTheDocument();

    fireEvent.click(within(nav).getByRole('button', { name: /^Milestones$/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /^Milestones$/i })).toBeInTheDocument();

    fireEvent.click(within(nav).getByRole('button', { name: /Journal & Plans/i }));
    expect(await screen.findByText(/Reading Journal/i)).toBeInTheDocument();
  });

  it('filters Log History entries by book and chapter, note, and displayed date', async () => {
    render(<App />);
    expect(await screen.findByText(/Bible Progress/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Try sample data/i }));
    await waitFor(() => {
      expect(screen.getByText(/days streak/i)).toBeInTheDocument();
    });

    const header = document.querySelector('header');
    expect(header).not.toBeNull();
    expect(header?.textContent).not.toMatch(/1,189|134|12d|streak/i);

    fireEvent.click(screen.getByRole('button', { name: /Journal & Plans/i }));
    expect(await screen.findByText(/Reading Journal/i)).toBeInTheDocument();

    const journalSearch = screen.getByLabelText(/Filter reading journal/i);
    fireEvent.change(journalSearch, { target: { value: 'Romans 8' } });
    expect(screen.getByText(/Romans 7–8/i)).toBeInTheDocument();
    expect(screen.queryByText(/Genesis 1–10/i)).not.toBeInTheDocument();

    fireEvent.change(journalSearch, { target: { value: "God's word" } });
    expect(screen.getByText(/Psalms 103, 119, 121, 139/i)).toBeInTheDocument();
    expect(screen.queryByText(/Romans 7–8/i)).not.toBeInTheDocument();

    const todayShort = formatShortDate(todayPlainDate());
    fireEvent.change(journalSearch, { target: { value: todayShort } });
    expect(screen.getByText(/Romans 14–16/i)).toBeInTheDocument();
    expect(screen.queryByText(/Genesis 1–10/i)).not.toBeInTheDocument();

    fireEvent.change(journalSearch, { target: { value: 'zzzz-no-match' } });
    expect(screen.getByText(/No matching entries/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Reset search$/i }));
    expect(screen.getByText(/Genesis 1–10/i)).toBeInTheDocument();
  });

  it('logs a chapter via Quick Log, syncs Quick Log with selected book, unlocks Open the Scroll, and opens Book chapter grid', async () => {
    render(<App />);
    expect(await screen.findByText(/Bible Progress/i)).toBeInTheDocument();

    // Switching the book selector updates the 1-tap Quick Log button to match
    fireEvent.change(screen.getByLabelText(/^Book$/i), { target: { value: 'genesis' } });
    expect(screen.getByRole('button', { name: /Quick Log: Gen 1/i })).toBeInTheDocument();

    // Switch back to John and tap Quick Log
    fireEvent.change(screen.getByLabelText(/^Book$/i), { target: { value: 'john' } });
    const quickLogBtn = screen.getByRole('button', { name: /Quick Log: John 1/i });
    fireEvent.click(quickLogBtn);

    await waitFor(() => {
      expect(getWholeBibleChapterReadout(1)).toBeInTheDocument();
    });

    expect(await screen.findByText(/^Open the Scroll$/i)).toBeInTheDocument();

    // Unlocked count is omitted from the navigation bar on both mobile and desktop
    expect(screen.queryByTestId('nav-seals-count')).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('button', { name: /^Milestones$/i })).not.toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: /Open John chapters/i }));
    expect(await screen.findByRole('heading', { name: 'John' })).toBeInTheDocument();

    const ch2Btn = screen.getByRole('button', { name: /^2$/ });
    fireEvent.click(ch2Btn);

    await waitFor(() => {
      expect(screen.getByText(/2 of 21 chapters read \(10%\)/i)).toBeInTheDocument();
    });
  });

  it('automatically advances Quick Log to the next book and chapter when finishing a book', async () => {
    render(<App />);
    expect(await screen.findByText(/Bible Progress/i)).toBeInTheDocument();

    // Select a 1-chapter book (Philemon) and finish it via Quick Log -> should advance to Hebrews 1
    fireEvent.change(screen.getByLabelText(/^Book$/i), { target: { value: 'philemon' } });
    fireEvent.click(screen.getByRole('button', { name: /Quick Log: Phlm 1/i }));

    expect(
      await screen.findByRole('button', { name: /Quick Log: Heb 1/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Book$/i)).toHaveValue('hebrews');

    // Select Jude (1 chapter) and finish it via Quick Log -> should advance to Revelation 1
    fireEvent.change(screen.getByLabelText(/^Book$/i), { target: { value: 'jude' } });
    fireEvent.click(screen.getByRole('button', { name: /Quick Log: Jude 1/i }));

    expect(
      await screen.findByRole('button', { name: /Quick Log: Rev 1/i })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Book$/i)).toHaveValue('revelation');
  });

  it('opens dedicated Settings page from profile popover, switches color scheme, and navigates back', async () => {
    render(<App />);
    expect(await screen.findByText(/Bible Progress/i)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Sign in or open account menu/i })
    );
    const popover = await screen.findByTestId('account-popover');
    fireEvent.click(within(popover).getByRole('button', { name: /Settings/i }));

    expect(
      await screen.findByRole('heading', { level: 1, name: /^Settings$/i })
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(popover).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Dark/i }));
    expect(
      document.querySelector('meta[name="color-scheme"]')?.getAttribute('content')
    ).toBe('dark');
    expect(localStorage.getItem('selah-color-scheme')).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: /Back to Home/i }));
    expect(await screen.findByText(/Bible Progress/i)).toBeInTheDocument();
  });

  it('renders 66 proportional book bars and opens book dialogs from the bar', async () => {
    render(<App />);
    expect(await screen.findByText(/Bible Progress/i)).toBeInTheDocument();

    const spineGroup = screen.getByRole('group', { name: /66-book Bible progress bar/i });
    const spineButtons = spineGroup.querySelectorAll('button');
    expect(spineButtons).toHaveLength(66);

    const psalmsSpine = screen.getByRole('button', { name: /Psalms: 0 of 150 chapters read/i });
    fireEvent.mouseEnter(psalmsSpine);
    expect(screen.getByText(/Wisdom & Poetry/i)).toBeInTheDocument();

    fireEvent.click(psalmsSpine);
    expect(await screen.findByRole('heading', { name: 'Psalms' })).toBeInTheDocument();
  });

  it('logs a multi-chapter range via touch-friendly Range tap mode inside BookDetailDialog', async () => {
    render(<App />);
    expect(await screen.findByText(/Bible Progress/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Open John chapters/i }));
    expect(await screen.findByRole('heading', { name: 'John' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Range$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^2$/ }));
    expect(screen.getByText(/Selected Ch\. 2\./i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^5$/ }));

    await waitFor(() => {
      expect(screen.getByText(/4 of 21 chapters read \(19%\)/i)).toBeInTheDocument();
    });
  });

  it('logs the next day of the active reading plan from Home and opens Reading Plans directly', async () => {
    render(<App />);
    expect(await screen.findByText(/Bible Progress/i)).toBeInTheDocument();

    expect(screen.getByText(/Gospels & Acts Journey/i)).toBeInTheDocument();
    expect(screen.getByText(/Matthew 1–3/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Log Day 1/i }));

    await waitFor(() => {
      expect(screen.getByText(/1 of 45 days/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Matthew 4–6/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /All plans/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /Reading Plans/i })).toBeInTheDocument();
  });

  it('filters Reading Activity heatmap, summary, and human-readable monthly table by year', async () => {
    const today = todayPlainDate();
    const currentYear = Number(today.slice(0, 4));
    const pastYear = currentYear - 2;
    const pastDate = `${pastYear}-06-15`;
    const pastMonthLabel = formatPlainDate(`${pastYear}-06-01`, { month: 'short', year: 'numeric' });
    const currentMonthLabel = formatPlainDate(`${today.slice(0, 7)}-01`, {
      month: 'short',
      year: 'numeric',
    });

    render(<App />);
    expect(await screen.findByText(/Bible Progress/i)).toBeInTheDocument();

    // Use quick range chip 1–3 and log in a past year
    fireEvent.click(screen.getByRole('button', { name: /^1–3$/i }));
    fireEvent.change(screen.getByLabelText(/^Date read$/i), { target: { value: pastDate } });
    fireEvent.click(screen.getByRole('button', { name: /Log Reading/i }));

    await waitFor(() => {
      expect(getWholeBibleChapterReadout(3)).toBeInTheDocument();
    });

    // Log 1 chapter today via Quick Log
    fireEvent.click(screen.getByRole('button', { name: /Quick Log: John 4/i }));
    await waitFor(() => {
      expect(getWholeBibleChapterReadout(4)).toBeInTheDocument();
    });

    const heatmapSection = screen.getByRole('region', { name: /Reading Activity/i });
    const yearFilterGroup = within(heatmapSection).getByRole('group', {
      name: /Filter reading activity by year/i,
    });

    const rollingBtn = within(yearFilterGroup).getByRole('button', { name: /Last 52 weeks/i });
    const currentYearBtn = within(yearFilterGroup).getByRole('button', {
      name: String(currentYear),
    });
    const pastYearBtn = within(yearFilterGroup).getByRole('button', { name: String(pastYear) });

    // Default rolling 52 weeks excludes the 2-year-old session
    expect(rollingBtn).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(heatmapSection).getByText(/1 active day \(1 chapter\)/i)
    ).toBeInTheDocument();

    // Open Monthly summary table and verify human-readable month label (e.g. "Nov 2026")
    fireEvent.click(within(heatmapSection).getByRole('button', { name: /Monthly summary table/i }));
    expect(await within(heatmapSection).findByText(currentMonthLabel)).toBeInTheDocument();
    expect(within(heatmapSection).queryByText(pastMonthLabel)).not.toBeInTheDocument();

    // Switch to pastYear
    fireEvent.click(pastYearBtn);
    expect(pastYearBtn).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(heatmapSection).getByRole('grid', {
        name: new RegExp(`${pastYear} Bible reading activity`, 'i'),
      })
    ).toBeInTheDocument();
    expect(
      within(heatmapSection).getByText(
        new RegExp(`In ${pastYear}: 1 active day \\(3 chapters\\)`, 'i')
      )
    ).toBeInTheDocument();
    expect(within(heatmapSection).getByText(pastMonthLabel)).toBeInTheDocument();
    expect(within(heatmapSection).queryByText(currentMonthLabel)).not.toBeInTheDocument();

    const pastSquare = within(heatmapSection).getByRole('button', {
      name: `${formatPlainDate(pastDate)}: 3 chapters read`,
    });
    fireEvent.click(pastSquare);
    expect(
      within(heatmapSection).getByText(
        (_, el) =>
          el?.tagName === 'SPAN' &&
          el.textContent === `${formatPlainDate(pastDate)} — 3 chapters read`
      )
    ).toBeInTheDocument();

    // Switch to currentYear and verify readout resets & currentYear data displays
    fireEvent.click(currentYearBtn);
    expect(currentYearBtn).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(heatmapSection).getByText(/Tap or hover any square to see chapters logged/i)
    ).toBeInTheDocument();
    expect(
      within(heatmapSection).getByRole('grid', {
        name: new RegExp(`${currentYear} Bible reading activity`, 'i'),
      })
    ).toBeInTheDocument();
    expect(
      within(heatmapSection).getByText(
        new RegExp(`In ${currentYear}: 1 active day \\(1 chapter\\)`, 'i')
      )
    ).toBeInTheDocument();
    expect(within(heatmapSection).getByText(currentMonthLabel)).toBeInTheDocument();
    expect(within(heatmapSection).queryByText(pastMonthLabel)).not.toBeInTheDocument();
  });
});
