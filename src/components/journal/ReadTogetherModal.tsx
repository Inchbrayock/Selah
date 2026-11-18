import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Check, Lock, UserPlus, Users } from 'lucide-react';
import { SPRING_TACTILE, TACTILE_TAP } from '../../lib/motion';
import { useAccountSync, useFriendsStore } from '../../store/useBibleStore';
import type { ReadingPlan, SharedPlanCohort } from '../../types/bible';
import { ModalDialog } from '../ui/ModalDialog';
import { ProfileAvatar } from '../ui/ProfileAvatar';

interface ReadTogetherModalProps {
  open: boolean;
  plan: ReadingPlan | null;
  availablePlans?: ReadingPlan[];
  existingCohort?: SharedPlanCohort | null;
  initialFriendUid?: string | null;
  onClose: () => void;
  onCreated?: (cohort: SharedPlanCohort) => void;
  onOpenAccount?: () => void;
  onOpenFriends?: () => void;
}

export const ReadTogetherModal: React.FC<ReadTogetherModalProps> = ({
  open,
  plan,
  availablePlans,
  existingCohort = null,
  initialFriendUid = null,
  onClose,
  onCreated,
  onOpenAccount,
  onOpenFriends,
}) => {
  const { user } = useAccountSync();
  const { friends, createSharedPlanCohort, inviteFriendToSharedCohort } = useFriendsStore();
  const [pickedPlanId, setPickedPlanId] = useState<string>(plan?.id ?? availablePlans?.[0]?.id ?? '');
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectivePlan = useMemo(() => {
    if (existingCohort || !availablePlans || availablePlans.length === 0) return plan;
    return availablePlans.find((p) => p.id === pickedPlanId) ?? plan ?? availablePlans[0] ?? null;
  }, [availablePlans, existingCohort, pickedPlanId, plan]);

  const alreadyInvited = useMemo(
    () => new Set(existingCohort?.participantUids ?? []),
    [existingCohort]
  );

  const eligibleFriends = useMemo(
    () => friends.filter((f) => !alreadyInvited.has(f.friendUid)),
    [alreadyInvited, friends]
  );

  useEffect(() => {
    if (open) {
      setPickedPlanId(plan?.id ?? availablePlans?.[0]?.id ?? '');
      const preselect =
        initialFriendUid &&
        !alreadyInvited.has(initialFriendUid) &&
        friends.some((f) => f.friendUid === initialFriendUid)
          ? [initialFriendUid]
          : [];
      setSelectedUids(preselect);
      setSubmitting(false);
      setError(null);
    }
  }, [open, plan?.id, existingCohort?.id, initialFriendUid, alreadyInvited, availablePlans, friends]);

  const remainingSlots = existingCohort
    ? Math.max(0, 12 - existingCohort.participantUids.length)
    : 11;

  function toggleFriend(uid: string) {
    setError(null);
    setSelectedUids((prev) => {
      if (prev.includes(uid)) {
        return prev.filter((id) => id !== uid);
      }
      if (prev.length >= remainingSlots) {
        return prev;
      }
      return [...prev, uid];
    });
  }

  async function handleSubmit() {
    if (!effectivePlan || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (existingCohort) {
        for (const uid of selectedUids) {
          await inviteFriendToSharedCohort(existingCohort.id, uid);
        }
        onClose();
      } else {
        const created = await createSharedPlanCohort(effectivePlan, selectedUids);
        onCreated?.(created);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save shared reading plan.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!effectivePlan) return null;

  const isInvitingMore = Boolean(existingCohort);
  const showPlanPicker = !isInvitingMore && Boolean(availablePlans && availablePlans.length > 1);

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      labelledBy="read-together-modal-title"
      className="sm:max-w-lg"
    >
      <div className="space-y-4 px-4 pb-4 pt-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <Users className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2
              id="read-together-modal-title"
              className="font-display text-xl font-medium tracking-tight text-[var(--text-primary)]"
            >
              {isInvitingMore ? 'Invite friends to read together' : 'Read together'}
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">
              {isInvitingMore
                ? `Invite friends to join "${existingCohort?.title}".`
                : `Share "${effectivePlan.title}" so friends can track reading days alongside you.`}
            </p>
          </div>
        </div>

        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5">
          {showPlanPicker && availablePlans ? (
            <div className="space-y-2">
              <label
                htmlFor="read-together-plan-select"
                className="block text-xs font-medium text-[var(--text-secondary)]"
              >
                Choose reading plan
              </label>
              <select
                id="read-together-plan-select"
                value={effectivePlan.id}
                onChange={(e) => setPickedPlanId(e.target.value)}
                className="folio-input min-h-10 w-full px-3 py-1.5 text-sm font-medium text-[var(--text-primary)]"
              >
                {availablePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.durationDays} {p.durationDays === 1 ? 'day' : 'days'})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <BookOpen className="h-4 w-4 shrink-0 text-[var(--color-accent)]" aria-hidden="true" />
                <p className="truncate font-display text-base font-medium text-[var(--text-primary)]">
                  {effectivePlan.title}
                </p>
              </div>
              <span className="shrink-0 text-xs text-[var(--text-secondary)] tabular-nums">
                {effectivePlan.durationDays} {effectivePlan.durationDays === 1 ? 'day' : 'days'}
              </span>
            </div>
          )}
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-sage)]" aria-hidden="true" />
            <span>
              Only completed plan days and chapter totals are shared. Your journal notes always stay
              private.
            </span>
          </p>
        </div>

        {!user ? (
          <div className="space-y-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-xs leading-relaxed text-[var(--text-secondary)]">
            <p>
              Sign in to invite friends to read{' '}
              <strong className="font-medium text-[var(--text-primary)]">{effectivePlan.title}</strong>{' '}
              together.
            </p>
          </div>
        ) : eligibleFriends.length === 0 ? (
          <div className="space-y-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 text-xs leading-relaxed text-[var(--text-secondary)]">
            <p>
              {friends.length === 0
                ? 'You haven’t added any friends yet. Add friends first, or start this shared group now and invite them later.'
                : 'All of your friends are already in this shared plan.'}
            </p>
            {friends.length === 0 && onOpenFriends && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFriends();
                }}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Find friends</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span>Choose friends to invite</span>
              <span className="tabular-nums">
                {selectedUids.length} selected (up to {remainingSlots})
              </span>
            </div>
            <ul className="max-h-56 divide-y divide-[var(--border-subtle)] overflow-y-auto rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
              {eligibleFriends.map((friend) => {
                const checked = selectedUids.includes(friend.friendUid);
                const disabled = !checked && selectedUids.length >= remainingSlots;
                return (
                  <li key={friend.friendUid}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleFriend(friend.friendUid)}
                      aria-pressed={checked}
                      className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--bg-surface)] disabled:opacity-50"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <ProfileAvatar
                          user={{
                            displayName: friend.displayName,
                            email: null,
                            photoURL: friend.photoURL,
                          }}
                          sizeClassName="h-8 w-8"
                          textClassName="text-xs"
                        />
                        <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                          {friend.displayName}
                        </span>
                      </div>
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                          checked
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-white'
                            : 'border-[var(--border-strong)] bg-[var(--bg-elevated)]'
                        }`}
                      >
                        {checked && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs font-medium text-[var(--color-crimson)]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="min-h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          {!user && onOpenAccount && (
            <motion.button
              type="button"
              whileTap={TACTILE_TAP}
              transition={SPRING_TACTILE}
              onClick={() => {
                onClose();
                onOpenAccount();
              }}
              className="btn-primary inline-flex min-h-9 items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium"
            >
              <span>Sign in</span>
            </motion.button>
          )}
          {user && (
            <motion.button
              type="button"
              whileTap={TACTILE_TAP}
              transition={SPRING_TACTILE}
              disabled={submitting || (isInvitingMore && selectedUids.length === 0)}
              onClick={() => void handleSubmit()}
              className="btn-primary inline-flex min-h-9 items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium disabled:opacity-55"
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {submitting
                  ? 'Saving…'
                  : isInvitingMore
                    ? `Send ${selectedUids.length || ''} ${selectedUids.length === 1 ? 'invite' : 'invites'}`.trim()
                    : selectedUids.length > 0
                      ? `Share with ${selectedUids.length} ${selectedUids.length === 1 ? 'friend' : 'friends'}`
                      : 'Start Read Together'}
              </span>
            </motion.button>
          )}
        </div>
      </div>
    </ModalDialog>
  );
};
