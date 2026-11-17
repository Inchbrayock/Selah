import React, { useEffect, useState } from 'react';
import { Award, BookOpen, Compass, ShieldBan, UserMinus, X } from 'lucide-react';
import { BOOKS_BY_ID, OT_TOTAL_CHAPTERS, NT_TOTAL_CHAPTERS, TOTAL_CANON_CHAPTERS } from '../../data/bibleCanon';
import { formatPlainDate } from '../../lib/dates';
import { formatUsernameHandle } from '../../lib/friends';
import { useBibleStore } from '../../store/useBibleStore';
import type { FriendConnection } from '../../types/bible';
import { InlineDeleteConfirm } from '../ui/InlineDeleteConfirm';
import { ModalDialog } from '../ui/ModalDialog';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { SanctuaryLamp } from '../ui/SanctuaryLamp';
import { EncouragementSender } from './EncouragementSender';
import { MiniCanonicalSpine } from './MiniCanonicalSpine';

interface FriendFolioDialogProps {
  connection: FriendConnection | null;
  onClose: () => void;
}

function formatPct(read: number, total: number): string {
  if (total <= 0) return '0%';
  const pct = (read / total) * 100;
  return `${pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}%`;
}

export const FriendFolioDialog: React.FC<FriendFolioDialogProps> = ({
  connection,
  onClose,
}) => {
  const { preferences, removeFriend, blockFriend } = useBibleStore();
  const [confirmAction, setConfirmAction] = useState<'remove' | 'block' | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmAction(null);
    setBusy(false);
    setActionError(null);
  }, [connection?.friendUid]);

  const profile = connection?.profile ?? null;
  const privacy = profile?.privacy;
  const sharing = Boolean(profile?.sharingEnabled);

  const recentBook =
    sharing && privacy?.showRecentBook && profile?.stats.lastReadBookId
      ? BOOKS_BY_ID[profile.stats.lastReadBookId] ?? null
      : null;

  const isLampLit = Boolean(
    sharing && privacy?.showStreak && (profile?.stats.currentStreak ?? 0) > 0
  );

  const sharedSamePlan = Boolean(
    sharing &&
      privacy?.showActivePlan &&
      profile?.stats.activePlanId &&
      preferences.activePlanId &&
      profile.stats.activePlanId === preferences.activePlanId
  );

  const handleRemove = async () => {
    if (!connection) return;
    setBusy(true);
    setActionError(null);
    try {
      await removeFriend(connection.friendship.id);
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove friend.');
      setBusy(false);
    }
  };

  const handleBlock = async () => {
    if (!connection) return;
    setBusy(true);
    setActionError(null);
    try {
      await blockFriend(
        connection.friendUid,
        connection.displayName,
        connection.friendship.id
      );
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not block reader.');
      setBusy(false);
    }
  };

  return (
    <ModalDialog open={Boolean(connection)} onClose={onClose} labelledBy="friend-folio-title">
      {connection && (
        <>
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 pb-3.5 pt-5 sm:px-6 sm:py-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <ProfileAvatar
                user={{
                  displayName: connection.displayName,
                  email: null,
                  photoURL: connection.photoURL,
                }}
                sizeClassName="h-12 w-12"
                textClassName="text-base"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h2
                    id="friend-folio-title"
                    className="truncate font-display text-xl font-medium text-[var(--text-primary)] sm:text-2xl"
                  >
                    {connection.displayName}
                  </h2>
                  {formatUsernameHandle(connection.username) && (
                    <span className="text-xs text-[var(--text-secondary)]">
                      {formatUsernameHandle(connection.username)}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {!profile
                    ? 'Loading reading summary…'
                    : !sharing
                      ? 'Progress sharing is currently paused'
                      : recentBook
                        ? profile.stats.lastReadDate
                          ? `Last read ${recentBook.name}, ${formatPlainDate(profile.stats.lastReadDate, {
                              month: 'short',
                              day: 'numeric',
                            })}`
                          : `Last read ${recentBook.name}`
                        : `Connected ${formatPlainDate(
                            (connection.friendship.acceptedAt ?? connection.friendship.createdAt).slice(
                              0,
                              10
                            ),
                            { month: 'short', day: 'numeric', year: 'numeric' }
                          )}`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close friend details"
              className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
            {!profile ? (
              <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-sm text-[var(--text-secondary)]">
                Syncing {connection.displayName}’s reading summary from the cloud…
              </div>
            ) : !sharing ? (
              <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                {connection.displayName} has paused sharing reading stats with their circle.
              </div>
            ) : (
              <>
                {privacy?.showBookProgress && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 border-y border-[var(--border-subtle)] sm:grid-cols-3 sm:divide-x sm:divide-[var(--border-subtle)]">
                      <div className="col-span-2 border-b border-[var(--border-subtle)] py-3.5 sm:col-span-1 sm:border-b-0 sm:pr-4">
                        <p className="text-xs text-[var(--text-secondary)]">Whole Bible</p>
                        <div className="mt-0.5 flex items-baseline gap-2.5">
                          <span className="font-display text-2xl font-medium tabular-nums text-[var(--text-primary)] sm:text-3xl">
                            {formatPct(profile.stats.totalChaptersRead, TOTAL_CANON_CHAPTERS)}
                          </span>
                          <span className="text-xs text-[var(--text-secondary)] tabular-nums">
                            {profile.stats.totalChaptersRead.toLocaleString()} /{' '}
                            {TOTAL_CANON_CHAPTERS.toLocaleString()} ch
                          </span>
                        </div>
                      </div>

                      <div className="border-r border-[var(--border-subtle)] py-3.5 pr-3 sm:border-r-0 sm:px-4">
                        <p className="text-xs text-[var(--text-secondary)]">Old Testament</p>
                        <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
                          <span className="font-display text-xl font-medium tabular-nums text-[var(--text-primary)] sm:text-2xl">
                            {formatPct(profile.stats.otChaptersRead, OT_TOTAL_CHAPTERS)}
                          </span>
                          <span className="text-xs text-[var(--text-secondary)] tabular-nums">
                            {profile.stats.otChaptersRead} ch
                          </span>
                        </div>
                      </div>

                      <div className="py-3.5 pl-3 sm:pl-4">
                        <p className="text-xs text-[var(--text-secondary)]">New Testament</p>
                        <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
                          <span className="font-display text-xl font-medium tabular-nums text-[var(--text-primary)] sm:text-2xl">
                            {formatPct(profile.stats.ntChaptersRead, NT_TOTAL_CHAPTERS)}
                          </span>
                          <span className="text-xs text-[var(--text-secondary)] tabular-nums">
                            {profile.stats.ntChaptersRead} ch
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5">
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
                        <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                          <BookOpen className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" />
                          <span>Canonical journey</span>
                        </span>
                        <span className="tabular-nums">
                          {profile.stats.booksCompleted} of 66 books completed
                        </span>
                      </div>
                      <MiniCanonicalSpine
                        bookProgressSpec={profile.stats.bookProgressSpec}
                        interactive
                      />
                    </div>
                  </div>
                )}

                {(privacy?.showStreak || privacy?.showSealsCount || privacy?.showActivePlan) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {privacy?.showStreak && (
                      <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5">
                        <div>
                          <p className="text-xs text-[var(--text-secondary)]">Reading rhythm</p>
                          <p className="mt-0.5 font-display text-xl font-medium tabular-nums text-[var(--text-primary)]">
                            {profile.stats.currentStreak}{' '}
                            <span className="font-sans text-xs font-normal text-[var(--text-secondary)]">
                              {profile.stats.currentStreak === 1 ? 'day streak' : 'days streak'}
                            </span>
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--text-secondary)] tabular-nums">
                            Best streak: {profile.stats.longestStreak}{' '}
                            {profile.stats.longestStreak === 1 ? 'day' : 'days'}
                          </p>
                        </div>
                        <SanctuaryLamp active={isLampLit} size={36} />
                      </div>
                    )}

                    {(privacy?.showSealsCount || privacy?.showActivePlan) && (
                      <div className="flex flex-col justify-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5">
                        {privacy?.showSealsCount && (
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                              <Award className="h-3.5 w-3.5 text-[var(--color-lamp)]" aria-hidden="true" />
                              <span>Hall of Seals</span>
                            </span>
                            <span className="font-medium tabular-nums text-[var(--text-primary)]">
                              {profile.stats.unlockedSealsCount} earned
                            </span>
                          </div>
                        )}
                        {privacy?.showActivePlan && (
                          <div className="flex items-start justify-between gap-2 text-xs">
                            <span className="inline-flex shrink-0 items-center gap-1.5 text-[var(--text-secondary)]">
                              <Compass className="h-3.5 w-3.5 text-[var(--color-sage)]" aria-hidden="true" />
                              <span>Active plan</span>
                            </span>
                            <span className="text-right font-medium text-[var(--text-primary)]">
                              {profile.stats.activePlanTitle || 'Free-form reading'}
                            </span>
                          </div>
                        )}
                        {sharedSamePlan && (
                          <p className="rounded bg-[var(--color-sage-soft)] px-2 py-1 text-xs font-medium text-[var(--color-sage)]">
                            You are both following {profile.stats.activePlanTitle}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!privacy?.showBookProgress &&
                  !privacy?.showStreak &&
                  !privacy?.showSealsCount &&
                  !privacy?.showActivePlan &&
                  !privacy?.showRecentBook && (
                    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-sm text-[var(--text-secondary)]">
                      {connection.displayName} has hidden individual reading metrics for their circle.
                    </div>
                  )}
              </>
            )}

            <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
              <EncouragementSender
                recipientUid={connection.friendUid}
                recipientName={connection.displayName}
              />
            </div>

            {actionError && (
              <p role="alert" className="text-xs font-medium text-[var(--color-crimson)]">
                {actionError}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3 sm:px-6">
            {confirmAction === 'remove' ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--text-secondary)]">
                  Remove {connection.displayName}?
                </span>
                <InlineDeleteConfirm
                  confirmLabel="Remove"
                  onCancel={() => setConfirmAction(null)}
                  onConfirm={() => {
                    if (!busy) void handleRemove();
                  }}
                />
              </div>
            ) : confirmAction === 'block' ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--text-secondary)]">
                  Block {connection.displayName}?
                </span>
                <InlineDeleteConfirm
                  confirmLabel="Block"
                  onCancel={() => setConfirmAction(null)}
                  onConfirm={() => {
                    if (!busy) void handleBlock();
                  }}
                />
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmAction('remove')}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--color-crimson)] hover:text-[var(--color-crimson)] disabled:opacity-60"
                >
                  <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Remove friend</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmAction('block')}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--color-crimson)] hover:text-[var(--color-crimson)] disabled:opacity-60"
                >
                  <ShieldBan className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Block</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-9 items-center rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-canvas)]"
            >
              Done
            </button>
          </div>
        </>
      )}
    </ModalDialog>
  );
};
