import React, { useEffect, useId, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Feather, Send } from 'lucide-react';
import {
  ENCOURAGEMENT_PRESETS,
  formatCooldownRemaining,
  getEncouragementCooldownRemainingMs,
  MAX_CUSTOM_ENCOURAGEMENT_LENGTH,
  sanitizeCustomEncouragementMessage,
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
  const customInputId = useId();
  const [expanded, setExpanded] = useState(!compact);
  const [sendingId, setSendingId] = useState<EncouragementPresetId | null>(null);
  const [justSentId, setJustSentId] = useState<EncouragementPresetId | null>(null);
  const [customText, setCustomText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setJustSentId(null);
    setCustomText('');
    void refreshEncouragementCooldown(recipientUid);
  }, [recipientUid, refreshEncouragementCooldown]);

  const lastSentIso = sentEncouragementCooldowns[recipientUid] ?? null;
  const remainingMs = getEncouragementCooldownRemainingMs(lastSentIso);
  const onCooldown = remainingMs > 0;
  const sanitizedCustom = sanitizeCustomEncouragementMessage(customText);

  async function handleSend(presetId: EncouragementPresetId, customMessage?: string | null) {
    if (sendingId || onCooldown) return;
    setError(null);
    setSendingId(presetId);
    try {
      await sendQuietEncouragement({
        recipientUid,
        presetId,
        customMessage: presetId === 'custom' ? customMessage ?? null : null,
        cohortTitle,
      });
      setJustSentId(presetId);
      if (presetId === 'custom') {
        setCustomText('');
      }
      if (compact) {
        setExpanded(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send encouragement.');
    } finally {
      setSendingId(null);
    }
  }

  async function handleCustomSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sanitizedCustom) {
      setError('Write a short message of encouragement before sending.');
      return;
    }
    await handleSend('custom', sanitizedCustom);
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
    <div className="space-y-3">
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

      <form
        onSubmit={(e) => void handleCustomSubmit(e)}
        className="space-y-2 border-t border-[var(--border-subtle)] pt-3"
      >
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor={customInputId}
            className="text-xs font-medium text-[var(--text-secondary)]"
          >
            Or write a personal note
          </label>
          <span className="text-[0.7rem] text-[var(--text-secondary)] tabular-nums">
            {customText.length}/{MAX_CUSTOM_ENCOURAGEMENT_LENGTH}
          </span>
        </div>
        <textarea
          id={customInputId}
          rows={2}
          maxLength={MAX_CUSTOM_ENCOURAGEMENT_LENGTH}
          value={customText}
          disabled={onCooldown || sendingId !== null}
          onChange={(e) => {
            setCustomText(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && sanitizedCustom && !onCooldown && sendingId === null) {
              e.preventDefault();
              void handleSend('custom', sanitizedCustom);
            }
          }}
          placeholder={`Write an encouragement or verse for ${recipientName}…`}
          className="folio-input w-full resize-none px-3 py-2 text-base leading-relaxed placeholder:text-[var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-55 sm:text-sm"
        />
        <div className="flex items-center justify-end">
          <motion.button
            type="submit"
            whileTap={TACTILE_TAP}
            transition={SPRING_TACTILE}
            disabled={onCooldown || sendingId !== null || !sanitizedCustom}
            className="btn-primary inline-flex min-h-9 items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {justSentId === 'custom' ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>
              {sendingId === 'custom'
                ? 'Sending…'
                : justSentId === 'custom'
                  ? 'Sent'
                  : 'Send note'}
            </span>
          </motion.button>
        </div>
      </form>

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
