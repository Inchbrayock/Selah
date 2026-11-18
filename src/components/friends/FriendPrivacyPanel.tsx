import React, { useState } from 'react';
import { Eye, EyeOff, Search, ShieldOff } from 'lucide-react';
import { sanitizeFriendPrivacy } from '../../lib/friends';
import { useFriendsStore, useReadingData } from '../../store/useBibleStore';
import type { FriendPrivacySettings } from '../../types/bible';

const GRANULAR_TOGGLES: {
  key: Exclude<keyof FriendPrivacySettings, 'sharingEnabled' | 'discoverable'>;
  label: string;
  detail: string;
}[] = [
  {
    key: 'showBookProgress',
    label: 'Bible progress & chapter counts',
    detail: 'Share Whole Bible, Old Testament, and New Testament chapter totals.',
  },
  {
    key: 'showStreak',
    label: 'Reading streak',
    detail: 'Show your current day streak and whether you read recently.',
  },
  {
    key: 'showRecentBook',
    label: 'Last read book & date',
    detail: 'Show the most recent book name and date you logged.',
  },
  {
    key: 'showActivePlan',
    label: 'Active reading plan',
    detail: 'Let friends see which reading plan you are currently following.',
  },
  {
    key: 'showSealsCount',
    label: 'Milestones unlocked',
    detail: 'Show how many reading milestones you have unlocked.',
  },
  {
    key: 'showPhoto',
    label: 'Profile picture',
    detail: 'Show your profile picture instead of your initials.',
  },
];

export const FriendPrivacyPanel: React.FC = () => {
  const { preferences, updatePreferences } = useReadingData();
  const { blockedUsers, unblockFriend } = useFriendsStore();
  const privacy = sanitizeFriendPrivacy(preferences.friendPrivacy);
  const [unblockingUid, setUnblockingUid] = useState<string | null>(null);
  const [unblockError, setUnblockError] = useState<string | null>(null);

  const toggleSetting = (key: keyof FriendPrivacySettings, value: boolean) => {
    void updatePreferences({
      friendPrivacy: {
        ...privacy,
        [key]: value,
      },
    });
  };

  const handleUnblock = async (blockedUid: string) => {
    setUnblockError(null);
    setUnblockingUid(blockedUid);
    try {
      await unblockFriend(blockedUid);
    } catch (err) {
      setUnblockError(err instanceof Error ? err.message : 'Could not unblock user.');
    } finally {
      setUnblockingUid(null);
    }
  };

  return (
    <section
      aria-labelledby="friend-privacy-heading"
      className="folio-sheet space-y-4 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div className="max-w-[60ch]">
          <h2
            id="friend-privacy-heading"
            className="font-display text-xl font-medium text-[var(--text-primary)]"
          >
            Friend privacy
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            Choose whether people can find you in search and what accepted friends can see.
            Personal journal notes and your email address are never shared.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">
          {privacy.sharingEnabled ? (
            <>
              <Eye className="h-3.5 w-3.5 text-[var(--color-sage)]" aria-hidden="true" />
              <span>Sharing active</span>
            </>
          ) : (
            <>
              <EyeOff className="h-3.5 w-3.5 text-[var(--color-lamp)]" aria-hidden="true" />
              <span>Sharing paused</span>
            </>
          )}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3.5">
          <div>
            <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
              <Search className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" />
              <span>Appear in people search</span>
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-secondary)]">
              Allow other readers to find your name and @username to send you a friend request.
            </span>
          </div>
          <input
            type="checkbox"
            checked={privacy.discoverable}
            onChange={(e) => toggleSetting('discoverable', e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
          />
        </label>

        <label className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3.5">
          <div>
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              Share reading summary with friends
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-secondary)]">
              Turn off at any time to pause sharing without removing any friends.
            </span>
          </div>
          <input
            type="checkbox"
            checked={privacy.sharingEnabled}
            onChange={(e) => toggleSetting('sharingEnabled', e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
          />
        </label>
      </div>

      <div className={`grid gap-2.5 sm:grid-cols-2 ${!privacy.sharingEnabled ? 'opacity-55' : ''}`}>
        {GRANULAR_TOGGLES.map((item) => (
          <label
            key={item.key}
            className="flex cursor-pointer items-start justify-between gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3"
          >
            <div>
              <span className="block text-sm font-medium text-[var(--text-primary)]">
                {item.label}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-secondary)]">
                {item.detail}
              </span>
            </div>
            <input
              type="checkbox"
              disabled={!privacy.sharingEnabled}
              checked={privacy[item.key]}
              onChange={(e) => toggleSetting(item.key, e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 disabled:cursor-not-allowed"
            />
          </label>
        ))}
      </div>

      {/* Blocked Users Management */}
      <div className="border-t border-[var(--border-subtle)] pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <ShieldOff className="h-3.5 w-3.5 text-[var(--text-secondary)]" aria-hidden="true" />
            <h3 className="text-sm font-medium text-[var(--text-primary)]">
              Blocked users{blockedUsers.length > 0 ? ` (${blockedUsers.length})` : ''}
            </h3>
          </div>
        </div>

        {blockedUsers.length === 0 ? (
          <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
            No blocked users. Anyone you block will appear here so you can unblock them later.
          </p>
        ) : (
          <ul className="mt-2.5 divide-y divide-[var(--border-subtle)] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
            {blockedUsers.map((record) => {
              const busy = unblockingUid === record.blockedUid;
              return (
                <li
                  key={record.blockedUid}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                >
                  <span className="truncate text-sm font-medium text-[var(--text-primary)]">
                    {record.displayName}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleUnblock(record.blockedUid)}
                    className="min-h-8 shrink-0 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] disabled:opacity-55"
                  >
                    {busy ? 'Unblocking…' : 'Unblock'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {unblockError && (
          <p role="alert" className="mt-2 text-xs font-medium text-[var(--color-crimson)]">
            {unblockError}
          </p>
        )}
      </div>
    </section>
  );
};
