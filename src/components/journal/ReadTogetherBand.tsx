import React, { useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Check, UserPlus, Users } from 'lucide-react';
import { formatShortDate } from '../../lib/dates';
import { getActiveLocalPlanIdForCohort } from '../../lib/fellowship';
import { SPRING_PROGRESS, SPRING_TACTILE, TACTILE_TAP } from '../../lib/motion';
import { useAccountSync, useFriendsStore } from '../../store/useBibleStore';
import type { SharedPlanCohort } from '../../types/bible';
import { EncouragementSender } from '../friends/EncouragementSender';
import { InlineDeleteConfirm } from '../ui/InlineDeleteConfirm';
import { ProfileAvatar } from '../ui/ProfileAvatar';

interface ReadTogetherBandProps {
  activePlanId: string | null;
  onSelectLocalPlan: (localPlanId: string) => void;
  onInviteToCohort: (cohort: SharedPlanCohort) => void;
  hideHeader?: boolean;
}

function formatLastRead(dateStr: string | null): string | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  try {
    return formatShortDate(dateStr);
  } catch {
    return null;
  }
}

export const ReadTogetherBand: React.FC<ReadTogetherBandProps> = ({
  activePlanId,
  onSelectLocalPlan,
  onInviteToCohort,
  hideHeader = false,
}) => {
  const { user } = useAccountSync();
  const {
    friends,
    sharedPlans,
    joinSharedPlanCohort,
    leaveSharedPlanCohort,
    deleteSharedPlanCohort,
  } = useFriendsStore();
  const [busyCohortId, setBusyCohortId] = useState<string | null>(null);
  const [confirmEndCohortId, setConfirmEndCohortId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!user || sharedPlans.length === 0) {
    return null;
  }

  const pendingInvites = sharedPlans.filter((sp) => sp.myMembership?.status !== 'joined');
  const joinedCohorts = sharedPlans.filter((sp) => sp.myMembership?.status === 'joined');

  async function handleJoin(cohortId: string) {
    setActionError(null);
    setBusyCohortId(cohortId);
    try {
      await joinSharedPlanCohort(cohortId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not join shared reading plan.');
    } finally {
      setBusyCohortId(null);
    }
  }

  async function handleLeaveOrDecline(cohortId: string) {
    setActionError(null);
    setBusyCohortId(cohortId);
    try {
      await leaveSharedPlanCohort(cohortId);
      setConfirmEndCohortId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not leave shared reading plan.');
    } finally {
      setBusyCohortId(null);
    }
  }

  async function handleDeleteCohort(cohortId: string) {
    setActionError(null);
    setBusyCohortId(cohortId);
    try {
      await deleteSharedPlanCohort(cohortId);
      setConfirmEndCohortId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not end shared reading plan.');
    } finally {
      setBusyCohortId(null);
    }
  }

  return (
    <section aria-labelledby={hideHeader ? undefined : 'read-together-heading'} className="space-y-4">
      {!hideHeader && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
            <h3
              id="read-together-heading"
              className="font-display text-lg font-medium text-[var(--text-primary)]"
            >
              Read together
            </h3>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Plan days and chapter progress only — journal notes stay private
          </p>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="rounded-md border border-[var(--color-crimson)] bg-[var(--bg-elevated)] px-3.5 py-2.5 text-xs font-medium text-[var(--color-crimson)]"
        >
          {actionError}
        </div>
      )}

      {/* Pending shared reading invitations */}
      {pendingInvites.length > 0 && (
        <div className="space-y-2.5">
          {pendingInvites.map(({ cohort }) => {
            const busy = busyCohortId === cohort.id;
            return (
              <div
                key={cohort.id}
                className="folio-sheet flex flex-col gap-3 border-l-2 border-l-[var(--color-lamp)] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-[var(--color-lamp-soft)] px-2 py-0.5 text-[0.7rem] font-medium text-[var(--text-primary)]">
                      Shared plan invite
                    </span>
                    <span className="text-xs text-[var(--text-secondary)] tabular-nums">
                      {cohort.durationDays} {cohort.durationDays === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                  <p className="mt-1.5 font-display text-base font-medium text-[var(--text-primary)]">
                    {cohort.title}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    Invited by {cohort.hostName}
                    {cohort.description ? ` — ${cohort.description}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    transition={SPRING_TACTILE}
                    disabled={busy}
                    onClick={() => void handleJoin(cohort.id)}
                    className="btn-primary inline-flex min-h-9 items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium disabled:opacity-55"
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{busy ? 'Joining…' : 'Join plan'}</span>
                  </motion.button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleLeaveOrDecline(cohort.id)}
                    className="min-h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-55"
                  >
                    Decline
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Joined Read Together cohorts */}
      {joinedCohorts.length > 0 && (
        <div className="space-y-4">
          {joinedCohorts.map(({ cohort, members }) => {
            const isHost = cohort.hostUid === user.uid;
            const localPlanId = getActiveLocalPlanIdForCohort(cohort);
            const isCurrentActive = activePlanId === localPlanId;
            const busy = busyCohortId === cohort.id;
            const joinedMembers = members.filter((m) => m.status === 'joined');
            const invitedMembers = members.filter((m) => m.status === 'invited');
            const acceptedFriendUids = new Set(friends.map((f) => f.friendUid));
            const hasMoreFriendsToInvite =
              isHost &&
              cohort.participantUids.length < 12 &&
              friends.some((f) => !cohort.participantUids.includes(f.friendUid));

            return (
              <div key={cohort.id} className="folio-sheet overflow-hidden p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-3.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <BookOpen
                        className="h-4 w-4 shrink-0"
                        style={{ color: cohort.accentColor }}
                        aria-hidden="true"
                      />
                      <h4 className="font-display text-lg font-medium text-[var(--text-primary)]">
                        {cohort.title}
                      </h4>
                      {isCurrentActive && (
                        <span className="rounded bg-[var(--color-accent-soft)] px-2 py-0.5 text-[0.7rem] font-medium text-[var(--color-accent)]">
                          Active plan
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-secondary)] tabular-nums">
                      {joinedMembers.length} {joinedMembers.length === 1 ? 'reader' : 'readers'} joined
                      {invitedMembers.length > 0 ? `, ${invitedMembers.length} invited` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!isCurrentActive && (
                      <button
                        type="button"
                        onClick={() => onSelectLocalPlan(localPlanId)}
                        className="inline-flex min-h-8 items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)]"
                      >
                        Open plan
                      </button>
                    )}
                    {hasMoreFriendsToInvite && (
                      <button
                        type="button"
                        onClick={() => onInviteToCohort(cohort)}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                      >
                        <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Invite friend</span>
                      </button>
                    )}
                    {confirmEndCohortId === cohort.id ? (
                      <InlineDeleteConfirm
                        confirmLabel={isHost ? 'End group' : 'Leave'}
                        onCancel={() => setConfirmEndCohortId(null)}
                        onConfirm={() => {
                          if (busy) return;
                          if (isHost) {
                            void handleDeleteCohort(cohort.id);
                          } else {
                            void handleLeaveOrDecline(cohort.id);
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmEndCohortId(cohort.id)}
                        className="min-h-8 rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--color-crimson)] disabled:opacity-55"
                      >
                        {isHost ? 'End group' : 'Leave'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Member progress ledger */}
                <ul className="mt-3 divide-y divide-[var(--border-subtle)]">
                  {joinedMembers.map((member) => {
                    const isSelf = member.uid === user.uid;
                    const memberIsHost = member.uid === cohort.hostUid;
                    const pct =
                      member.totalDays > 0
                        ? Math.min(100, Math.round((member.completedDays / member.totalDays) * 100))
                        : 0;
                    const lastReadLabel = formatLastRead(member.lastReadDate);
                    const canSendNote = !isSelf && acceptedFriendUids.has(member.uid);

                    return (
                      <li key={member.uid} className="space-y-2 py-3 first:pt-1 last:pb-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <ProfileAvatar
                              user={{
                                displayName: member.displayName,
                                email: null,
                                photoURL: member.photoURL,
                              }}
                              sizeClassName="h-7 w-7"
                              textClassName="text-[0.68rem]"
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                                  {member.displayName}
                                </span>
                                {isSelf && (
                                  <span className="rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[0.68rem] font-medium text-[var(--text-secondary)]">
                                    You
                                  </span>
                                )}
                                {memberIsHost && (
                                  <span className="rounded bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[0.68rem] font-medium text-[var(--color-accent)]">
                                    Host
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)] tabular-nums">
                            {lastReadLabel && <span>Read {lastReadLabel}</span>}
                            <span className="font-medium text-[var(--text-primary)]">
                              Day {member.completedDays} of {member.totalDays}
                            </span>
                            <span>
                              {member.readChapters}/{member.totalChapters} ch
                            </span>
                          </div>
                        </div>

                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ backgroundColor: cohort.accentColor }}
                            initial={false}
                            animate={{ width: `${pct}%` }}
                            transition={SPRING_PROGRESS}
                          />
                        </div>

                        {canSendNote && (
                          <div className="pt-0.5">
                            <EncouragementSender
                              recipientUid={member.uid}
                              recipientName={member.displayName}
                              cohortTitle={cohort.title}
                              compact
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {invitedMembers.length > 0 && (
                  <p className="mt-3 border-t border-[var(--border-subtle)] pt-2.5 text-xs text-[var(--text-secondary)]">
                    Invited: {invitedMembers.map((m) => m.displayName).join(', ')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
