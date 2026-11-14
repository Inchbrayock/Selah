import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  CloudOff,
  Copy,
  RefreshCw,
  Search,
  Share2,
  Shield,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { BOOKS_BY_ID, TOTAL_CANON_CHAPTERS } from '../../data/bibleCanon';
import { formatPlainDate } from '../../lib/dates';
import {
  buildFriendInviteUrl,
  formatFriendCode,
  normalizeFriendCode,
} from '../../lib/friends';
import { SPRING_TACTILE, TACTILE_TAP } from '../../lib/motion';
import { isNativePlatform } from '../../lib/nativeShell';
import { useBibleStore } from '../../store/useBibleStore';
import type { FriendCodeLookup, FriendConnection } from '../../types/bible';
import { InlineDeleteConfirm } from '../ui/InlineDeleteConfirm';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { SanctuaryLamp } from '../ui/SanctuaryLamp';
import { FriendFolioDialog } from './FriendFolioDialog';
import { FriendPrivacyPanel } from './FriendPrivacyPanel';
import { MiniCanonicalSpine } from './MiniCanonicalSpine';

interface FriendsViewProps {
  onBack: () => void;
  backLabel: string;
  onOpenAccount: () => void;
}

type CircleSort = 'recent' | 'name' | 'progress';

function formatPercent(read: number, total: number): string {
  if (total <= 0) return '0%';
  const pct = (read / total) * 100;
  return `${pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}%`;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }
  return false;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  onBack,
  backLabel,
  onOpenAccount,
}) => {
  const {
    firebaseAvailable,
    user,
    syncStatus,
    ownFriendProfile,
    friends,
    incomingRequests,
    outgoingRequests,
    friendsLoading,
    friendsError,
    friendsFromCache,
    pendingInviteCode,
    clearPendingInviteCode,
    ensureFriendProfileReady,
    lookupFriendByCode,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    blockFriend,
    regenerateFriendCode,
  } = useBibleStore();

  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [lookupResult, setLookupResult] = useState<FriendCodeLookup | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [requestBusyId, setRequestBusyId] = useState<string | null>(null);
  const [blockConfirmPairId, setBlockConfirmPairId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [codeStatus, setCodeStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<CircleSort>('recent');
  const [selectedFriendUid, setSelectedFriendUid] = useState<string | null>(null);

  useEffect(() => {
    if (user && !ownFriendProfile) {
      void ensureFriendProfileReady();
    }
  }, [ensureFriendProfileReady, ownFriendProfile, user]);

  const runCodeLookup = useCallback(
    async (raw: string) => {
      setActionError(null);
      setActionStatus(null);
      setLookupResult(null);
      setLookupBusy(true);
      try {
        const result = await lookupFriendByCode(raw);
        if (!result) {
          const formatted = normalizeFriendCode(raw);
          setActionError(
            formatted
              ? `No reader matched code ${formatFriendCode(formatted)}. Check the letters and try again.`
              : 'No reader matched that code.'
          );
          return;
        }
        setLookupResult(result);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : 'Could not look up that friend code.'
        );
      } finally {
        setLookupBusy(false);
      }
    },
    [lookupFriendByCode]
  );

  // Consume deep-linked invite code automatically once signed in
  useEffect(() => {
    if (!user || !pendingInviteCode) return;
    const formatted = formatFriendCode(pendingInviteCode);
    setCodeInput(formatted);
    clearPendingInviteCode();
    void runCodeLookup(formatted);
  }, [clearPendingInviteCode, pendingInviteCode, runCodeLookup, user]);

  const selectedConnection = useMemo(
    () => friends.find((f) => f.friendUid === selectedFriendUid) ?? null,
    [friends, selectedFriendUid]
  );

  const visibleFriends = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? friends.filter((conn) => {
          const planTitle = conn.profile?.stats.activePlanTitle?.toLowerCase() ?? '';
          const bookName = conn.profile?.stats.lastReadBookId
            ? BOOKS_BY_ID[conn.profile.stats.lastReadBookId]?.name.toLowerCase() ?? ''
            : '';
          return (
            conn.displayName.toLowerCase().includes(q) ||
            planTitle.includes(q) ||
            bookName.includes(q)
          );
        })
      : [...friends];

    return filtered.sort((a, b) => {
      if (sortBy === 'name') {
        return a.displayName.localeCompare(b.displayName);
      }
      if (sortBy === 'progress') {
        const aCh = a.profile?.sharingEnabled && a.profile.privacy.showBookProgress
          ? a.profile.stats.totalChaptersRead
          : -1;
        const bCh = b.profile?.sharingEnabled && b.profile.privacy.showBookProgress
          ? b.profile.stats.totalChaptersRead
          : -1;
        return bCh - aCh || a.displayName.localeCompare(b.displayName);
      }
      const aDate = a.profile?.sharingEnabled && a.profile.privacy.showRecentBook
        ? a.profile.stats.lastReadDate ?? ''
        : '';
      const bDate = b.profile?.sharingEnabled && b.profile.privacy.showRecentBook
        ? b.profile.stats.lastReadDate ?? ''
        : '';
      return bDate.localeCompare(aDate) || a.displayName.localeCompare(b.displayName);
    });
  }, [friends, searchQuery, sortBy]);

  const hasPendingRequests = incomingRequests.length > 0 || outgoingRequests.length > 0;
  const formattedOwnCode = ownFriendProfile ? formatFriendCode(ownFriendProfile.friendCode) : '';

  const handleCopyOwnCode = async () => {
    if (!formattedOwnCode) return;
    const copied = await copyTextToClipboard(formattedOwnCode);
    setCodeStatus(copied ? `Copied ${formattedOwnCode}` : 'Copy unavailable on this browser.');
    window.setTimeout(() => setCodeStatus(null), 2600);
  };

  const handleShareInvite = async () => {
    if (!ownFriendProfile) return;
    const inviteUrl = buildFriendInviteUrl(ownFriendProfile.friendCode);
    const shareTitle = 'Join my Reading Circle on Selah';
    const shareText = `Read Scripture alongside me on Selah. My friend code is ${formattedOwnCode}.`;

    if (isNativePlatform()) {
      try {
        const { Share } = await import('@capacitor/share');
        await Share.share({
          title: shareTitle,
          text: shareText,
          url: inviteUrl,
          dialogTitle: 'Share Reading Circle invite',
        });
        return;
      } catch (err) {
        if (err instanceof Error && /cancel/i.test(err.message)) return;
      }
    }

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: inviteUrl,
        });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }

    const copied = await copyTextToClipboard(inviteUrl);
    setCodeStatus(copied ? 'Invite link copied' : 'Copy unavailable on this browser.');
    window.setTimeout(() => setCodeStatus(null), 2600);
  };

  const handleRegenerateCode = async () => {
    setConfirmRegenerate(false);
    setCodeStatus(null);
    try {
      await regenerateFriendCode();
      setCodeStatus('New friend code ready');
      window.setTimeout(() => setCodeStatus(null), 2600);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not refresh friend code.');
    }
  };

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runCodeLookup(codeInput);
  };

  const handleSendRequest = async () => {
    if (!lookupResult) return;
    setActionError(null);
    setActionStatus(null);
    setRequestBusyId(`send:${lookupResult.uid}`);
    try {
      const outcome = await sendFriendRequest(lookupResult);
      setActionStatus(
        outcome === 'accepted'
          ? `Added ${lookupResult.displayName} to your circle.`
          : `Request sent to ${lookupResult.displayName}.`
      );
      setLookupResult(null);
      setCodeInput('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not send friend request.');
    } finally {
      setRequestBusyId(null);
    }
  };

  const handleAccept = async (pairId: string, requesterName: string) => {
    setActionError(null);
    setActionStatus(null);
    setRequestBusyId(pairId);
    try {
      await acceptFriendRequest(pairId);
      setActionStatus(`Added ${requesterName} to your circle.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not accept request.');
    } finally {
      setRequestBusyId(null);
    }
  };

  const handleDecline = async (pairId: string) => {
    setActionError(null);
    setRequestBusyId(pairId);
    try {
      await declineFriendRequest(pairId);
      setActionStatus('Request declined.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not decline request.');
    } finally {
      setRequestBusyId(null);
    }
  };

  const handleCancelOutgoing = async (pairId: string) => {
    setActionError(null);
    setRequestBusyId(pairId);
    try {
      await cancelFriendRequest(pairId);
      setActionStatus('Request cancelled.');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not cancel request.');
    } finally {
      setRequestBusyId(null);
    }
  };

  const handleBlockIncoming = async (uid: string, name: string, pairId: string) => {
    setActionError(null);
    setBlockConfirmPairId(null);
    setRequestBusyId(pairId);
    try {
      await blockFriend(uid, name, pairId);
      setActionStatus(`Blocked ${name}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not block reader.');
    } finally {
      setRequestBusyId(null);
    }
  };

  const renderFriendContextLine = (conn: FriendConnection): string => {
    const profile = conn.profile;
    if (!profile) return 'Syncing reading summary…';
    if (!profile.sharingEnabled) return 'Sharing paused';

    const { privacy, stats } = profile;
    const recentBook =
      privacy.showRecentBook && stats.lastReadBookId ? BOOKS_BY_ID[stats.lastReadBookId] : null;
    if (recentBook) {
      if (stats.lastReadDate) {
        return `Last read ${recentBook.name}, ${formatPlainDate(stats.lastReadDate, {
          month: 'short',
          day: 'numeric',
        })}`;
      }
      return `Last read ${recentBook.name}`;
    }
    if (privacy.showActivePlan && stats.activePlanTitle) {
      return `Following ${stats.activePlanTitle}`;
    }
    if (privacy.showBookProgress) {
      return `${stats.booksCompleted} of 66 books completed`;
    }
    return 'Connected in your circle';
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page Header */}
      <section className="border-b border-[var(--border-subtle)] pb-5 sm:pb-6">
        <button
          type="button"
          onClick={onBack}
          className="tactile-press mb-3 inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-[var(--color-accent)] underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Back to {backLabel}</span>
        </button>

        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div className="max-w-[60ch]">
            <h1 className="font-display text-2xl font-medium tracking-tight text-[var(--text-primary)] sm:text-[2.15rem]">
              Reading Circle
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
              Share your reading rhythm quietly with friends you trust. Study notes and reflections
              stay private on your own ledger.
            </p>
          </div>

          {firebaseAvailable && user && (
            <div className="flex flex-wrap items-center gap-2">
              {formattedOwnCode ? (
                <div className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5">
                  <span className="text-xs text-[var(--text-secondary)]">Your code</span>
                  <span className="font-mono text-sm font-semibold tracking-wider text-[var(--text-primary)] tabular-nums">
                    {formattedOwnCode}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyOwnCode()}
                    aria-label="Copy friend code"
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <span className="inline-flex min-h-10 items-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-xs text-[var(--text-secondary)]">
                  Preparing your friend code…
                </span>
              )}

              {ownFriendProfile && (
                <>
                  <motion.button
                    type="button"
                    whileTap={TACTILE_TAP}
                    transition={SPRING_TACTILE}
                    onClick={() => void handleShareInvite()}
                    className="btn-primary inline-flex min-h-10 items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-medium transition-opacity hover:opacity-90"
                  >
                    <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Share invite link</span>
                  </motion.button>

                  {confirmRegenerate ? (
                    <InlineDeleteConfirm
                      confirmLabel="Replace code"
                      onCancel={() => setConfirmRegenerate(false)}
                      onConfirm={() => void handleRegenerateCode()}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRegenerate(true)}
                      title="Generate a new friend code and retire the old one"
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>New code</span>
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                aria-expanded={privacyOpen}
                onClick={() => setPrivacyOpen((prev) => !prev)}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                  privacyOpen
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--border-strong)]'
                }`}
              >
                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Privacy</span>
              </button>
            </div>
          )}
        </div>

        {codeStatus && (
          <p
            role="status"
            className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-sage)]"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{codeStatus}</span>
          </p>
        )}
      </section>

      {!firebaseAvailable ? (
        <section className="folio-sheet p-5 sm:p-8">
          <div className="max-w-[60ch] space-y-2">
            <h2 className="font-display text-xl font-medium text-[var(--text-primary)]">
              Cloud accounts unavailable here
            </h2>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              Reading Circle uses Firebase authentication and cloud sync to connect friends. Configure
              your Firebase environment keys in <code className="font-mono">.env.local</code> to
              enable accounts and friend codes.
            </p>
          </div>
        </section>
      ) : !user ? (
        <section className="folio-sheet p-5 sm:p-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div className="max-w-[60ch] space-y-2.5">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <Users className="h-5 w-5 text-[var(--color-accent)]" aria-hidden="true" />
              </div>
              <h2 className="font-display text-2xl font-medium text-[var(--text-primary)]">
                {pendingInviteCode
                  ? `Sign in to open invite ${formatFriendCode(pendingInviteCode)}`
                  : 'Sign in to read alongside friends'}
              </h2>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {pendingInviteCode
                  ? 'Once you sign in or create a free Sanctuary account, your existing local chapters stay intact and this invite code will load automatically.'
                  : 'Create a free Sanctuary account to receive a shareable friend code, exchange invitations, and follow each other’s progress across the 66 books.'}
              </p>
            </div>

            <motion.button
              type="button"
              whileTap={TACTILE_TAP}
              transition={SPRING_TACTILE}
              onClick={onOpenAccount}
              className="btn-primary inline-flex min-h-11 shrink-0 items-center justify-center rounded-md px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
            >
              Sign in to connect
            </motion.button>
          </div>
        </section>
      ) : (
        <>
          {privacyOpen && <FriendPrivacyPanel />}

          {(friendsFromCache || syncStatus === 'offline') && (
            <div className="flex items-center gap-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--color-lamp-soft)] px-4 py-2.5 text-xs text-[var(--text-primary)]">
              <CloudOff className="h-4 w-4 shrink-0 text-[var(--color-lamp)]" aria-hidden="true" />
              <span>
                Offline — showing your last synced Reading Circle snapshot. Friend requests will
                resume once reconnected.
              </span>
            </div>
          )}

          {friendsError && (
            <div
              role="alert"
              className="rounded-md border border-[var(--color-crimson)] bg-[var(--bg-elevated)] px-4 py-3 text-xs font-medium text-[var(--color-crimson)]"
            >
              {friendsError}
            </div>
          )}

          {/* Add a Friend + Pending Requests */}
          <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
            <section
              aria-labelledby="add-friend-heading"
              className={`folio-sheet p-4 sm:p-6 ${
                hasPendingRequests ? 'lg:col-span-5' : 'lg:col-span-12'
              }`}
            >
              <div className="max-w-[60ch]">
                <h2
                  id="add-friend-heading"
                  className="font-display text-xl font-medium text-[var(--text-primary)]"
                >
                  Add a friend
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                  Enter an 8-character friend code or paste a friend’s invite link.
                </p>
              </div>

              <form onSubmit={handleLookupSubmit} className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                <input
                  type="text"
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value);
                    if (actionError) setActionError(null);
                  }}
                  aria-label="Friend code or invite link"
                  placeholder="K7M4-P9Q2 or invite link"
                  className="folio-input min-h-11 flex-1 px-3 py-2 text-base placeholder:text-[var(--text-secondary)] sm:min-h-10 sm:text-sm"
                />
                <motion.button
                  type="submit"
                  whileTap={TACTILE_TAP}
                  transition={SPRING_TACTILE}
                  disabled={lookupBusy || !codeInput.trim()}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)] disabled:opacity-55 sm:min-h-10"
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  <span>{lookupBusy ? 'Looking up…' : 'Look up'}</span>
                </motion.button>
              </form>

              {lookupResult && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border-strong)] bg-[var(--bg-canvas)] p-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <ProfileAvatar
                      user={{
                        displayName: lookupResult.displayName,
                        email: null,
                        photoURL: null,
                      }}
                      sizeClassName="h-9 w-9"
                      textClassName="text-xs"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {lookupResult.displayName}
                      </p>
                      <p className="font-mono text-xs text-[var(--text-secondary)]">
                        {formatFriendCode(lookupResult.code)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setLookupResult(null)}
                      aria-label="Dismiss lookup result"
                      className="inline-flex min-h-9 items-center rounded-md border border-[var(--border-subtle)] px-2.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={requestBusyId === `send:${lookupResult.uid}`}
                      onClick={() => void handleSendRequest()}
                      className="btn-primary inline-flex min-h-9 items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium disabled:opacity-60"
                    >
                      <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {requestBusyId === `send:${lookupResult.uid}`
                          ? 'Sending…'
                          : 'Send request'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {actionError && (
                <p role="alert" className="mt-3 text-xs font-medium text-[var(--color-crimson)]">
                  {actionError}
                </p>
              )}
              {actionStatus && (
                <p
                  role="status"
                  className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[var(--color-sage)]"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{actionStatus}</span>
                </p>
              )}
            </section>

            {hasPendingRequests && (
              <section
                aria-labelledby="friend-requests-heading"
                className="folio-sheet p-4 sm:p-6 lg:col-span-7"
              >
                <h2
                  id="friend-requests-heading"
                  className="font-display text-xl font-medium text-[var(--text-primary)]"
                >
                  Pending requests
                </h2>

                <div className="mt-3 space-y-4">
                  {incomingRequests.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
                        Incoming ({incomingRequests.length})
                      </p>
                      <ul className="divide-y divide-[var(--border-subtle)] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
                        {incomingRequests.map((req) => {
                          const busy = requestBusyId === req.id;
                          return (
                            <li
                              key={req.id}
                              className="flex flex-col justify-between gap-3 p-3.5 sm:flex-row sm:items-center"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <ProfileAvatar
                                  user={{
                                    displayName: req.requesterName,
                                    email: null,
                                    photoURL: req.requesterPhotoURL,
                                  }}
                                  sizeClassName="h-9 w-9"
                                  textClassName="text-xs"
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                                    {req.requesterName}
                                  </p>
                                  <p className="text-xs text-[var(--text-secondary)]">
                                    Wants to join your Reading Circle
                                  </p>
                                </div>
                              </div>

                              {blockConfirmPairId === req.id ? (
                                <InlineDeleteConfirm
                                  confirmLabel="Block"
                                  onCancel={() => setBlockConfirmPairId(null)}
                                  onConfirm={() =>
                                    void handleBlockIncoming(
                                      req.requesterUid,
                                      req.requesterName,
                                      req.id
                                    )
                                  }
                                />
                              ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void handleAccept(req.id, req.requesterName)}
                                    className="btn-primary min-h-9 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60"
                                  >
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void handleDecline(req.id)}
                                    className="min-h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] disabled:opacity-60"
                                  >
                                    Decline
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setBlockConfirmPairId(req.id)}
                                    className="min-h-9 rounded-md px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--color-crimson)] disabled:opacity-60"
                                  >
                                    Block
                                  </button>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {outgoingRequests.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">
                        Sent ({outgoingRequests.length})
                      </p>
                      <ul className="divide-y divide-[var(--border-subtle)] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
                        {outgoingRequests.map((req) => (
                          <li
                            key={req.id}
                            className="flex flex-wrap items-center justify-between gap-3 p-3.5"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <ProfileAvatar
                                user={{
                                  displayName: req.recipientName,
                                  email: null,
                                  photoURL: req.recipientPhotoURL,
                                }}
                                sizeClassName="h-9 w-9"
                                textClassName="text-xs"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                                  {req.recipientName}
                                </p>
                                <p className="text-xs text-[var(--text-secondary)]">
                                  Waiting for response
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={requestBusyId === req.id}
                              onClick={() => void handleCancelOutgoing(req.id)}
                              className="min-h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--color-crimson)] hover:text-[var(--color-crimson)] disabled:opacity-60"
                            >
                              Cancel request
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Your Reading Circle Ledger */}
          <section aria-labelledby="circle-roster-heading" className="folio-sheet p-4 sm:p-6">
            <div className="flex flex-col justify-between gap-3 border-b border-[var(--border-subtle)] pb-4 sm:flex-row sm:items-center">
              <div>
                <h2
                  id="circle-roster-heading"
                  className="font-display text-xl font-medium text-[var(--text-primary)]"
                >
                  Your circle
                </h2>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)] tabular-nums">
                  {friends.length === 0
                    ? 'No friends connected yet'
                    : `${friends.length} ${friends.length === 1 ? 'friend' : 'friends'} connected`}
                </p>
              </div>

              {friends.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {(friends.length > 3 || searchQuery) && (
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      aria-label="Filter friends"
                      placeholder="Filter by name or book…"
                      className="folio-input min-h-9 px-3 py-1.5 text-sm placeholder:text-[var(--text-secondary)]"
                    />
                  )}
                  <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span>Sort</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as CircleSort)}
                      className="folio-input min-h-9 px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]"
                    >
                      <option value="recent">Recently active</option>
                      <option value="name">Name</option>
                      <option value="progress">Chapters read</option>
                    </select>
                  </label>
                </div>
              )}
            </div>

            {friendsLoading && friends.length === 0 ? (
              <p className="py-8 text-sm text-[var(--text-secondary)]">
                Opening your Reading Circle…
              </p>
            ) : friends.length === 0 ? (
              <div className="py-8">
                <p className="max-w-[55ch] text-sm leading-relaxed text-[var(--text-secondary)]">
                  Share your friend code or paste someone else’s code above to begin reading
                  together. Select any friend once connected to inspect their 66-book progress.
                </p>
              </div>
            ) : visibleFriends.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 py-8">
                <p className="text-sm text-[var(--text-secondary)]">
                  No friends matched “{searchQuery}”.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs font-medium text-[var(--color-accent)] hover:underline"
                >
                  Clear filter
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {visibleFriends.map((conn) => {
                  const profile = conn.profile;
                  const sharing = Boolean(profile?.sharingEnabled);
                  const showProgress = Boolean(sharing && profile?.privacy.showBookProgress);
                  const showStreak = Boolean(sharing && profile?.privacy.showStreak);
                  const lampActive = Boolean(showStreak && (profile?.stats.currentStreak ?? 0) > 0);
                  const totalRead = profile?.stats.totalChaptersRead ?? 0;

                  return (
                    <li key={conn.friendUid}>
                      <button
                        type="button"
                        onClick={() => setSelectedFriendUid(conn.friendUid)}
                        className="group -mx-2 flex w-[calc(100%+1rem)] flex-col gap-3 rounded-md px-2 py-4 text-left transition-colors hover:bg-[var(--bg-surface)]/70"
                      >
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                          <div className="flex min-w-0 items-center gap-3">
                            <SanctuaryLamp active={lampActive} size={28} />
                            <ProfileAvatar
                              user={{
                                displayName: conn.displayName,
                                email: null,
                                photoURL: conn.photoURL,
                              }}
                              sizeClassName="h-10 w-10"
                              textClassName="text-sm"
                              interactive
                            />
                            <div className="min-w-0">
                              <p className="truncate font-display text-lg font-medium text-[var(--text-primary)] group-hover:text-[var(--color-accent)]">
                                {conn.displayName}
                              </p>
                              <p className="truncate text-xs text-[var(--text-secondary)]">
                                {renderFriendContextLine(conn)}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pl-10 tabular-nums sm:pl-0 sm:text-right">
                            {showProgress && (
                              <span className="text-sm font-medium text-[var(--text-primary)]">
                                {formatPercent(totalRead, TOTAL_CANON_CHAPTERS)}{' '}
                                <span className="text-xs font-normal text-[var(--text-secondary)]">
                                  ({totalRead.toLocaleString()} / {TOTAL_CANON_CHAPTERS.toLocaleString()} ch)
                                </span>
                              </span>
                            )}
                            {showStreak && profile && (
                              <span className="text-xs text-[var(--text-secondary)]">
                                {profile.stats.currentStreak}{' '}
                                {profile.stats.currentStreak === 1 ? 'day streak' : 'days streak'}
                              </span>
                            )}
                          </div>
                        </div>

                        {showProgress && profile && (
                          <div className="pl-10 sm:pl-[4.75rem]">
                            <MiniCanonicalSpine bookProgressSpec={profile.stats.bookProgressSpec} />
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      <FriendFolioDialog
        connection={selectedConnection}
        onClose={() => setSelectedFriendUid(null)}
      />
    </div>
  );
};
