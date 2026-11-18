import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Feather } from 'lucide-react';
import {
  ENCOURAGEMENT_PRESETS,
  formatCooldownRemaining,
  getEncouragementCooldownRemainingMs,
} from '../../lib/fellowship';
import { SPRING_TACTILE, TACTILE_TAP } from '../../lib/motion';
import { useFriendsStore } from '../../store/useBibleStore';
import type { EncouragementPresetId } from '../../types/bible';

interface EncouragementSenderProps {
  recipientUid: string;
  recipientName: string;
  cohortTitle?: string | null;
  compact?: boolean;
}

export const EncouragementSender: React.FC<EncouragementSenderProps> = ({
  recipientUid,
  recipientName,
  cohortTitle = null,
  compact = false,
}) => {
  const {
    sentEncouragementCooldowns,
    sendQuietEncouragement,
    refreshEncouragementCooldown,
  } = useFriendsStore();
  const [expanded, setExpanded] = useState(!compact);
  const [sendingId, setSendingId] = useState<EncouragementPresetId | null>(null);
  const [justSentId, setJustSentId] = useState<EncouragementPresetId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setJustSentId(null);
    void refreshEncouragementCooldown(recipientUid);
  }, [recipientUid, refreshEncouragementCooldown]);

  const lastSentIso = sentEncouragementCooldowns[recipientUid] ?? null;
  const remainingMs = getEncouragementCooldownRemainingMs(lastSentIso);
  const onCooldown = remainingMs > 0;

  async function handleSend(presetId: EncouragementPresetId) {
    if (sendingId || onCooldown) return;
    setError(null);
    setSendingId(presetId);
    try {
      await sendQuietEncouragement({ recipientUid, presetId, cohortTitle });
      setJustSentId(presetId);
      if (compact) {
        setExpanded(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send encouragement.');
    } finally {
      setSendingId(null);
    }
  }

  if (compact && !expanded) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setExpanded(true);
          }}
          disabled={onCooldown}
          title={
            onCooldown
              ? `Next encouragement available in ${formatCooldownRemaining(remainingMs)}`
              : `Send an encouragement to ${recipientName}`
          }
          className="tactile-press inline-flex min-h-8 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-60"
        >
          {justSentId || onCooldown ? (
            <Check className="h-3.5 w-3.5 text-[var(--color-sage)]" aria-hidden="true" />
          ) : (
            <Feather className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" />
          )}
          <span>
            {onCooldown
              ? `Sent · wait ${formatCooldownRemaining(remainingMs)}`
              : 'Send encouragement'}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]">
          <Feather className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" />
          <span>Send encouragement</span>
        </div>
        <div className="flex items-center gap-2">
          {onCooldown && (
            <span className="text-[0.7rem] text-[var(--text-secondary)] tabular-nums">
              Available again in {formatCooldownRemaining(remainingMs)}
            </span>
          )}
          {compact && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Close
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {ENCOURAGEMENT_PRESETS.map((preset) => {
          const isSending = sendingId === preset.id;
          const isSent = justSentId === preset.id;
          return (
            <motion.button
              key={preset.id}
              type="button"
              whileTap={TACTILE_TAP}
              transition={SPRING_TACTILE}
              disabled={onCooldown || sendingId !== null}
              onClick={() => void handleSend(preset.id)}
              className="flex min-h-10 items-center justify-between gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 py-2 text-left text-xs leading-snug text-[var(--text-primary)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--bg-surface)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              <span className="font-display text-[0.875rem] italic text-[var(--text-primary)]">
                “{preset.label}”
              </span>
              {isSent && (
                <Check className="h-3.5 w-3.5 shrink-0 text-[var(--color-sage)]" aria-hidden="true" />
              )}
              {isSending && (
                <span className="shrink-0 text-[0.7rem] text-[var(--text-secondary)]">
                  Sending…
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {onCooldown && (
        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
          You already sent an encouragement to {recipientName}. You can send one every 12 hours.
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-[var(--color-crimson)]">
          {error}
        </p>
      )}
    </div>
  );
};
