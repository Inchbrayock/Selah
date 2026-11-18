import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';

vi.setConfig({ testTimeout: 15000 });

describe('Journal & Plans Enhanced UI', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records, edits, and links entries to a plan directly inside Reading Journal', async () => {
    render(<App />);
    expect(await screen.findByText(/Bible Progress/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Journal & Plans/i }));
    expect(await screen.findByText(/Your journal is empty/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Write first entry/i }));
    expect(
      await screen.findByRole('heading', { name: /Add a reading entry/i })
    ).toBeInTheDocument();

    // Verify open composer toggle says Close instead of "+ Hide composer"
    expect(screen.getByRole('button', { name: /^Close$/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Book$/i), { target: { value: 'psalms' } });
    fireEvent.change(screen.getByLabelText(/^Chapters$/i), { target: { value: '23' } });
    fireEvent.change(screen.getByLabelText(/Note \(optional\)/i), {
      target: { value: 'The Lord is my shepherd.' },
    });
    fireEvent.change(screen.getByLabelText(/Associate with reading plan/i), {
      target: { value: 'psalms-proverbs-31' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Save entry/i }));

    expect(await screen.findByRole('button', { name: /Psalms 23/i })).toBeInTheDocument();
    expect(screen.getByText(/The Lord is my shepherd\./i)).toBeInTheDocument();

    // Edit note via multi-line textarea
    fireEvent.click(screen.getByRole('button', { name: /Edit Psalms log/i }));
    await screen.findByRole('heading', { name: /Edit Psalms entry/i });
    const editTextarea = screen.getByLabelText(/^Note$/i);
    fireEvent.change(editTextarea, {
      target: { value: 'Still waters restore my soul.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Edit Psalms entry/i })).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Still waters restore my soul\./i)).toBeInTheDocument();

    // Follow plan link straight to Plans view
    fireEvent.click(screen.getByRole('button', { name: /Psalms & Proverbs Month/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /Reading Plans/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /Psalms & Proverbs Month/i })
    ).toBeInTheDocument();
  });

  it('filters Reading Journal by With notes lens, Plan lens, and Bible section', async () => {
    render(<App />);
    expect(await screen.findByText(/Bible Progress/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Try sample data/i }));
    await waitFor(() => {
      expect(screen.getByText(/days streak/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Journal & Plans/i }));
    expect(await screen.findByText(/Reading Journal/i)).toBeInTheDocument();

    // Sample data includes both noted and note-free entries (e.g. Mark 1-6 has no note)
    expect(screen.getByRole('button', { name: /Mark 1–6/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^With notes$/i }));
    expect(screen.queryByRole('button', { name: /Mark 1–6/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Romans 7–8/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Filter entries by Bible section/i), {
      target: { value: 'pauline' },
    });
    expect(screen.getByRole('button', { name: /Romans 7–8/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Genesis 1–10/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^From plans$/i }));
    expect(await screen.findByText(/No plan-linked entries yet/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show all entries/i }));
    expect(screen.getByRole('button', { name: /Mark 1–6/i })).toBeInTheDocument();
  });

  it('supports partial plan days, logging with a note, and navigating 365-day stages', async () => {
    render(<App />);
    expect(await screen.findByText(/Bible Progress/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Journal & Plans/i }));
    expect(await screen.findByText(/Reading Journal/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reading Plans/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /Reading Plans/i })).toBeInTheDocument();

    // Switch to Psalms & Proverbs Month
    const planGroup = screen.getByRole('group', { name: /Choose a reading plan/i });
    fireEvent.click(within(planGroup).getByRole('button', { name: /Psalms & Proverbs Month/i }));

    const activePlanSection = screen.getByRole('region', {
      name: /Psalms & Proverbs Month/i,
    });
    expect(within(activePlanSection).getByText(/Up next: Day 1 of 31/i)).toBeInTheDocument();

    // Open Proverbs from Day 1 assignment chip and mark Chapter 1 read
    fireEvent.click(within(activePlanSection).getByRole('button', { name: /Proverbs 1/i }));
    expect(await screen.findByRole('heading', { name: 'Proverbs' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^1$/ }));

    await waitFor(() => {
      expect(screen.getByText(/1 of 31 chapters read/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Close Proverbs/i }));

    // Day 1 should now display partial completion and Finish Day 1 CTA
    expect(await within(activePlanSection).findByText(/1 of 6 chapters read/i)).toBeInTheDocument();
    fireEvent.change(within(activePlanSection).getByLabelText(/Note \(optional\)/i), {
      target: { value: 'Ask for wisdom before speaking.' },
    });
    fireEvent.click(within(activePlanSection).getByRole('button', { name: /Finish Day 1/i }));

    await waitFor(() => {
      expect(within(activePlanSection).getByText(/Up next: Day 2 of 31/i)).toBeInTheDocument();
    });

    // Day 1 in Daily Readings shows 1 note and links back to the Journal
    const readingsSection = screen.getByRole('region', { name: /Daily Readings/i });
    const noteToggle = within(readingsSection).getByRole('button', {
      name: /1 note/i,
    });
    fireEvent.click(noteToggle);
    expect(within(readingsSection).getByText(/Ask for wisdom before speaking\./i)).toBeInTheDocument();

    fireEvent.click(within(readingsSection).getByRole('button', { name: /Open in journal/i }));
    expect(await screen.findByText(/Reading Journal/i)).toBeInTheDocument();
    expect(screen.getByText(/Ask for wisdom before speaking\./i)).toBeInTheDocument();

    // Return to Plans and browse Month 6 on the 365-day plan
    fireEvent.click(screen.getByRole('button', { name: /Reading Plans/i }));
    const selector = screen.getByRole('group', { name: /Choose a reading plan/i });
    fireEvent.click(within(selector).getByRole('button', { name: /Canonical Bible in 1 Year/i }));

    const progressMap = screen.getByRole('region', { name: /Progress Map/i });
    fireEvent.click(within(progressMap).getByRole('button', { name: /Month 6/i }));

    const refreshedReadings = screen.getByRole('region', { name: /Daily Readings/i });
    expect(within(refreshedReadings).getByText(/Month 6: Days 152–181/i)).toBeInTheDocument();
    expect(within(refreshedReadings).getByRole('button', { name: /Log Day 152/i })).toBeInTheDocument();
  });

  it('finds and previews plans in Plan Finder and creates, edits, and deletes custom plans', async () => {
    render(<App />);
    expect(await screen.findByText(/Bible Progress/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Journal & Plans/i }));
    expect(await screen.findByText(/Reading Journal/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reading Plans/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /Reading Plans/i })).toBeInTheDocument();

    // Open Plan Finder
    fireEvent.click(screen.getByRole('button', { name: /Find a plan/i }));
    const finderSection = await screen.findByRole('region', { name: /Plan Finder/i });
    expect(within(finderSection).getByText(/Showing 12 of 12 reading plans/i)).toBeInTheDocument();

    // Search by included book name ("Isaiah")
    fireEvent.change(within(finderSection).getByLabelText(/Search reading plans/i), {
      target: { value: 'Isaiah' },
    });
    expect(within(finderSection).getByText(/Voice of the Prophets/i)).toBeInTheDocument();
    expect(within(finderSection).queryByText(/Gospel of John in 21 Days/i)).not.toBeInTheDocument();

    // Preview schedule on Voice of the Prophets
    const prophetsCard = within(finderSection)
      .getByRole('heading', { name: /Voice of the Prophets/i })
      .closest('article')!;
    fireEvent.click(within(prophetsCard).getByRole('button', { name: /Preview schedule/i }));
    expect(within(prophetsCard).getByText(/Sample schedule checkpoints/i)).toBeInTheDocument();

    // Reset filters, apply "1 chapter daily" quick match, and activate Gospel of John in 21 Days
    fireEvent.click(within(finderSection).getByRole('button', { name: /Reset filters/i }));
    fireEvent.click(within(finderSection).getByRole('button', { name: /1 chapter daily/i }));
    const johnCard = within(finderSection)
      .getByRole('heading', { name: /Gospel of John in 21 Days/i })
      .closest('article')!;
    fireEvent.click(within(johnCard).getByRole('button', { name: /Start plan/i }));

    expect(
      await screen.findByRole('heading', { level: 2, name: /Gospel of John in 21 Days/i })
    ).toBeInTheDocument();

    // Create a custom reading plan
    fireEvent.click(screen.getByRole('button', { name: /Create custom plan/i }));
    const builderSection = await screen.findByRole('region', {
      name: /Create custom reading plan/i,
    });

    fireEvent.change(within(builderSection).getByLabelText(/Plan title/i), {
      target: { value: 'Ephesians & Philippians' },
    });
    fireEvent.click(within(builderSection).getByRole('button', { name: /Ephesians, 6 chapters/i }));
    fireEvent.click(within(builderSection).getByRole('button', { name: /Philippians, 4 chapters/i }));

    fireEvent.change(within(builderSection).getByLabelText(/Duration in days/i), {
      target: { value: '5' },
    });
    expect(
      within(builderSection).getByText(/5 days, ~2 chapters daily \(10 total\)/i)
    ).toBeInTheDocument();

    fireEvent.click(within(builderSection).getByRole('button', { name: /Save & start plan/i }));

    const activeCustomSection = await screen.findByRole('region', {
      name: /Ephesians & Philippians/i,
    });
    expect(within(activeCustomSection).getByText(/Up next: Day 1 of 5/i)).toBeInTheDocument();
    expect(
      within(activeCustomSection).getByRole('heading', { level: 3, name: /Ephesians 1–2/i })
    ).toBeInTheDocument();

    // Verify custom plan reflects on Home dashboard too
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    fireEvent.click(within(nav).getByRole('button', { name: /^Home$/i }));
    expect(await screen.findByText(/Bible Progress/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Ephesians & Philippians/i })).toBeInTheDocument();
    expect(screen.getByText(/0 of 5 days/i)).toBeInTheDocument();

    // Return to Plans and edit + delete the custom plan cleanly
    fireEvent.click(screen.getByRole('button', { name: /All plans/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /Reading Plans/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Edit plan/i }));
    const editBuilder = await screen.findByRole('region', {
      name: /Edit custom reading plan/i,
    });
    fireEvent.change(within(editBuilder).getByLabelText(/Plan title/i), {
      target: { value: 'Ephesians & Philippians Revised' },
    });
    fireEvent.click(within(editBuilder).getByRole('button', { name: /Save & view plan/i }));

    expect(
      await screen.findByRole('heading', { level: 2, name: /Ephesians & Philippians Revised/i })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/i }));

    expect(
      await screen.findByRole('heading', { level: 2, name: /Gospels & Acts Journey/i })
    ).toBeInTheDocument();
  });

  it('starts with 4 plans on the shelf and allows removing, undoing, clearing, and restoring plans', async () => {
    render(<App />);
    expect(await screen.findByText(/Bible Progress/i)).toBeInTheDocument();

    // Even after loading Sample Data across many books, the default plans start at 4
    fireEvent.click(screen.getByRole('button', { name: /Try sample data/i }));
    await waitFor(() => {
      expect(screen.getByText(/days streak/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Journal & Plans/i }));
    expect(await screen.findByText(/Reading Journal/i)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Reading Plans/i }));

    const selectorGroup = await screen.findByRole('group', { name: /Choose a reading plan/i });
    expect(within(selectorGroup).getAllByRole('article')).toHaveLength(4);

    // Sample data marks later days done while Day 1 is unread -> clarify message appears
    expect(screen.getByText(/later days already done from your log/i)).toBeInTheDocument();

    // Clicking remove on a default plan asks for inline Cancel/Delete confirmation before removing
    const canonicalCard = within(selectorGroup)
      .getByText(/Canonical Bible in 1 Year/i)
      .closest('article')!;
    fireEvent.click(within(canonicalCard).getByRole('button', { name: /Remove plan from your plans/i }));
    expect(within(canonicalCard).getByRole('button', { name: /^Cancel$/i })).toBeInTheDocument();
    expect(within(canonicalCard).getByRole('button', { name: /^Delete$/i })).toBeInTheDocument();
    expect(within(selectorGroup).getAllByRole('article')).toHaveLength(4);

    // Canceling leaves the default plan intact
    fireEvent.click(within(canonicalCard).getByRole('button', { name: /^Cancel$/i }));
    expect(within(canonicalCard).queryByRole('button', { name: /^Cancel$/i })).not.toBeInTheDocument();
    expect(within(selectorGroup).getAllByRole('article')).toHaveLength(4);

    // Confirming removes Canonical Bible in 1 Year
    fireEvent.click(within(canonicalCard).getByRole('button', { name: /Remove plan from your plans/i }));
    fireEvent.click(within(canonicalCard).getByRole('button', { name: /^Delete$/i }));

    await waitFor(() => {
      expect(within(selectorGroup).getAllByRole('article')).toHaveLength(3);
    });
    expect(within(selectorGroup).queryByText(/Canonical Bible in 1 Year/i)).not.toBeInTheDocument();

    // Undo restores Canonical Bible in 1 Year back to 4 cards
    fireEvent.click(screen.getByRole('button', { name: /^Undo$/i }));
    await waitFor(() => {
      expect(within(selectorGroup).getAllByRole('article')).toHaveLength(4);
    });

    // Remove the currently active plan (Gospels & Acts Journey) -> advances active to next plan
    const activeGospelsCard = within(selectorGroup)
      .getByText(/Gospels & Acts Journey/i)
      .closest('article')!;
    fireEvent.click(
      within(activeGospelsCard).getByRole('button', { name: /Remove plan from your plans/i })
    );
    fireEvent.click(within(activeGospelsCard).getByRole('button', { name: /^Delete$/i }));
    expect(
      await screen.findByRole('heading', { level: 2, name: /Psalms & Proverbs Month/i })
    ).toBeInTheDocument();

    // Remove the remaining 3 curated plans down to an empty list
    for (const title of [
      'Psalms & Proverbs Month',
      'New Testament in 90 Days',
      'Canonical Bible in 1 Year',
    ]) {
      const updatedGroup = screen.getByRole('group', { name: /Choose a reading plan/i });
      const card = within(updatedGroup).getByText(title).closest('article')!;
      fireEvent.click(within(card).getByRole('button', { name: /Remove plan from your plans/i }));
      fireEvent.click(within(card).getByRole('button', { name: /^Delete$/i }));
    }

    expect(await screen.findByText(/No reading plans on your shelf/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Daily Readings/i })).not.toBeInTheDocument();

    // Verify Home dashboard reflects no active reading plan cleanly
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    fireEvent.click(within(nav).getByRole('button', { name: /^Home$/i }));
    expect(await screen.findByText(/No active reading plan yet/i)).toBeInTheDocument();

    // Return via Choose a plan and restore the 4 starter plans
    fireEvent.click(screen.getByRole('button', { name: /Choose a plan/i }));
    expect(
      await screen.findByRole('heading', { level: 1, name: /Reading Plans/i }, { timeout: 4000 })
    ).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole('button', { name: /Restore 4 starter plans/i }, { timeout: 4000 })
    );

    const restoredGroup = await screen.findByRole('group', { name: /Choose a reading plan/i });
    expect(within(restoredGroup).getAllByRole('article')).toHaveLength(4);
    expect(
      await screen.findByRole('heading', { level: 2, name: /Gospels & Acts Journey/i })
    ).toBeInTheDocument();

    // Create a custom plan and delete it directly from its card
    fireEvent.click(screen.getByRole('button', { name: /Create custom plan/i }));
    const builder = await screen.findByRole('region', { name: /Create custom reading plan/i });
    fireEvent.change(within(builder).getByLabelText(/Plan title/i), {
      target: { value: 'Ephesians Solo' },
    });
    fireEvent.click(within(builder).getByRole('button', { name: /Ephesians, 6 chapters/i }));
    fireEvent.click(within(builder).getByRole('button', { name: /Save & start plan/i }));

    expect(
      await screen.findByRole('heading', { level: 2, name: /Ephesians Solo/i })
    ).toBeInTheDocument();

    const shelfWithCustom = screen.getByRole('group', { name: /Choose a reading plan/i });
    expect(within(shelfWithCustom).getAllByRole('article')).toHaveLength(5);

    const customShelfCard = within(shelfWithCustom)
      .getByText(/Ephesians Solo/i)
      .closest('article')!;
    fireEvent.click(
      within(customShelfCard).getByRole('button', { name: /Delete custom plan/i })
    );
    fireEvent.click(within(customShelfCard).getByRole('button', { name: /^Delete$/i }));

    await waitFor(() => {
      const updatedShelf = screen.getByRole('group', { name: /Choose a reading plan/i });
      expect(within(updatedShelf).getAllByRole('article')).toHaveLength(4);
      expect(within(updatedShelf).queryByText(/Ephesians Solo/i)).not.toBeInTheDocument();
    });
  });
});
