import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Feather } from 'lucide-react';
import { formatShortDate } from '../../lib/dates';
import { getEncouragementPresetLabel } from '../../lib/fellowship';
import { SPRING_TACTILE, TACTILE_TAP } from '../../lib/motion';
import { useBibleStore } from '../../store/useBibleStore';
import { ProfileAvatar } from '../ui/ProfileAvatar';

function formatNoteDate(sentAtIso: string): string {
  const dayPart = sentAtIso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayPart)) {
    try {
      return formatShortDate(dayPart);
    } catch {
      return 'Recently';
    }
  }
  return 'Recently';
}

export const EncouragementSlipsPanel: React.FC = () => {
  const { receivedEncouragements, acknowledgeQuietEncouragement } = useBibleStore();
  const [busySenderUid, setBusySenderUid] = useState<string | null>(null);
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  if (receivedEncouragements.length === 0) {
    return null;
  }

  const unacknowledged = receivedEncouragements.filter((item) => !item.acknowledgedAt);
  const acknowledged = receivedEncouragements.filter((item) => Boolean(item.acknowledgedAt));
  const visible = showAcknowledged ? receivedEncouragements : unacknowledged;

  async function handleAcknowledge(senderUid: string) {
    setBusySenderUid(senderUid);
    try {
      await acknowledgeQuietEncouragement(senderUid);
    } finally {
      setBusySenderUid(null);
    }
  }

  return (
    <section aria-labelledby="quiet-encouragements-heading" className="folio-sheet p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Feather className="h-4 w-4 text-[var(--color-accent)]" aria-hidden="true" />
          <h2
            id="quiet-encouragements-heading"
            className="font-display text-xl font-medium text-[var(--text-primary)]"
          >
            Quiet notes
          </h2>
          {unacknowledged.length > 0 && (
            <span className="rounded-md bg-[var(--color-accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--color-accent)] tabular-nums">
              {unacknowledged.length} new
            </span>
          )}
        </div>
        {acknowledged.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAcknowledged((v) => !v)}
            className="min-h-8 rounded-md px-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            {showAcknowledged
              ? 'Hide acknowledged notes'
              : `Show recent notes (${acknowledged.length})`}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          All quiet notes from your Reading Circle have been acknowledged.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--border-subtle)] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
          {visible.map((item) => {
            const isAcked = Boolean(item.acknowledgedAt);
            const busy = busySenderUid === item.senderUid;
            return (
              <li
                key={item.senderUid}
                className="flex flex-col gap-3 border-l-2 border-l-[var(--color-accent)] p-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <ProfileAvatar
                    user={{
                      displayName: item.senderName,
                      email: null,
                      photoURL: item.senderPhotoURL,
                    }}
                    sizeClassName="h-9 w-9"
                    textClassName="text-xs"
                  />
                  <div className="min-w-0">
                    <p className="font-display text-base italic leading-snug text-[var(--text-primary)]">
                      “{getEncouragementPresetLabel(item.presetId)}”
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                      From <span className="font-medium text-[var(--text-primary)]">{item.senderName}</span>
                      {item.cohortTitle ? ` while reading ${item.cohortTitle}` : ''} on{' '}
                      {formatNoteDate(item.sentAt)}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-end">
                  {isAcked ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                      <Check className="h-3.5 w-3.5 text-[var(--color-sage)]" aria-hidden="true" />
                      <span>Acknowledged</span>
                    </span>
                  ) : (
                    <motion.button
                      type="button"
                      whileTap={TACTILE_TAP}
                      transition={SPRING_TACTILE}
                      disabled={busy}
                      onClick={() => void handleAcknowledge(item.senderUid)}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--color-accent)] disabled:opacity-55"
                    >
                      <Check className="h-3.5 w-3.5 text-[var(--color-sage)]" aria-hidden="true" />
                      <span>{busy ? 'Saving…' : 'Acknowledge'}</span>
                    </motion.button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
