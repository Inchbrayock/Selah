import React from 'react';
import { Eye, EyeOff, Search } from 'lucide-react';
import { sanitizeFriendPrivacy } from '../../lib/friends';
import { useBibleStore } from '../../store/useBibleStore';
import type { FriendPrivacySettings } from '../../types/bible';

const GRANULAR_TOGGLES: {
  key: Exclude<keyof FriendPrivacySettings, 'sharingEnabled' | 'discoverable'>;
  label: string;
  detail: string;
}[] = [
  {
    key: 'showBookProgress',
    label: '66-book progress and chapter totals',
    detail: 'Share Whole Bible, Old Testament, and New Testament chapter counts.',
  },
  {
    key: 'showStreak',
    label: 'Reading streak and lamp status',
    detail: 'Show whether your reading lamp is lit and your current day streak.',
  },
  {
    key: 'showRecentBook',
    label: 'Last read book and date',
    detail: 'Show the most recent book name and calendar day you logged.',
  },
  {
    key: 'showActivePlan',
    label: 'Active reading plan',
    detail: 'Let friends see which guided reading plan you are currently following.',
  },
  {
    key: 'showSealsCount',
    label: 'Earned seals count',
    detail: 'Show how many illuminated seals you have unlocked.',
  },
  {
    key: 'showPhoto',
    label: 'Profile photo',
    detail: 'Display your chosen profile portrait instead of a monogram.',
  },
];

export const FriendPrivacyPanel: React.FC = () => {
  const { preferences, updatePreferences } = useBibleStore();
  const privacy = sanitizeFriendPrivacy(preferences.friendPrivacy);

  const toggleSetting = (key: keyof FriendPrivacySettings, value: boolean) => {
    void updatePreferences({
      friendPrivacy: {
        ...privacy,
        [key]: value,
      },
    });
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
            Circle privacy
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            Choose whether readers can find you in search and what accepted friends can view.
            Personal study notes, reflection entries, and your email address are never shared.
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
              Share reading summary with accepted friends
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-secondary)]">
              Turn off at any time to pause sharing without removing anyone from your circle.
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
    </section>
  );
};
