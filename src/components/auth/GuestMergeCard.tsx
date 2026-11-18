import React from 'react';
import { CloudUpload } from 'lucide-react';
import type { PendingGuestMerge } from '../../store/useBibleStore';

interface GuestMergeCardProps {
  pendingMerge: PendingGuestMerge;
  busy?: boolean;
  variant?: 'banner' | 'compact';
  onResolve: (strategy: 'merge' | 'cloud-only') => void;
}

export const GuestMergeCard: React.FC<GuestMergeCardProps> = ({
  pendingMerge,
  busy = false,
  variant = 'banner',
  onResolve,
}) => {
  const count = pendingMerge.guestLogs.length;

  if (variant === 'compact') {
    return (
      <div className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-4 text-xs">
        <p className="font-medium text-[var(--text-primary)]">
          Unmerged local readings on this device
        </p>
        <p className="mt-1 leading-relaxed text-[var(--text-secondary)]">
          Found {count} local reading {count === 1 ? 'session' : 'sessions'} created before
          sign-in alongside {pendingMerge.cloudLogsCount} saved in your cloud account.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve('merge')}
            className="tactile-press btn-primary rounded-md px-3 py-1.5 font-medium disabled:opacity-60"
          >
            Merge local into account
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve('cloud-only')}
            className="tactile-press rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 font-medium text-[var(--text-primary)] disabled:opacity-60"
          >
            Keep cloud only
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex items-start gap-3">
        <CloudUpload
          className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-accent)]"
          aria-hidden="true"
        />
        <div>
          <h2 className="font-display text-base font-medium text-[var(--text-primary)]">
            Unmerged local readings found on this device
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">
            You recorded {count} local reading {count === 1 ? 'session' : 'sessions'} before
            signing in, while your account already holds {pendingMerge.cloudLogsCount} in the
            cloud.
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onResolve('merge')}
          className="tactile-press btn-primary min-h-10 flex-1 rounded-md px-3.5 py-2 text-xs font-medium hover:opacity-90 disabled:opacity-60 sm:min-h-9 sm:flex-initial"
        >
          Merge into my account
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onResolve('cloud-only')}
          className="tactile-press min-h-10 flex-1 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface)] disabled:opacity-60 sm:min-h-9 sm:flex-initial"
        >
          Keep cloud only
        </button>
      </div>
    </div>
  );
};
