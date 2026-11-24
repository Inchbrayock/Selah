import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  AtSign,
  BookOpen,
  Check,
  CloudOff,
  Copy,
  Plus,
  Search,
  Shield,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { BOOKS_BY_ID, TOTAL_CANON_CHAPTERS } from '../../data/bibleCanon';
import { formatPlainDate } from '../../lib/dates';
import {
  formatUsernameHandle,
  matchesDirectoryQuery,
  rankDirectoryMatch,
  sanitizeFriendPrivacy,
} from '../../lib/friends';
import { FOLIO_EASE, SPRING_TACTILE, TACTILE_TAP } from '../../lib/motion';
import { formatPercent } from '../../lib/progress';
import {
  useAccountSync,
  useFriendsStore,
  useReadingData,
} from '../../store/useBibleStore';
import type {
  FriendConnection,
  FriendRequestTarget,
  FriendshipRecord,
  ReaderDirectoryEntry,
  SharedPlanCohort,
} from '../../types/bible';
import { ReadTogetherBand } from '../journal/ReadTogetherBand';
import { ReadTogetherModal } from '../journal/ReadTogetherModal';
import { InlineDeleteConfirm } from '../ui/InlineDeleteConfirm';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { SanctuaryLamp } from '../ui/SanctuaryLamp';
import { EncouragementSlipsPanel } from './EncouragementSlipsPanel';
import { FriendFolioDialog } from './FriendFolioDialog';
import { FriendPrivacyPanel } from './FriendPrivacyPanel';
import { MiniCanonicalSpine } from './MiniCanonicalSpine';
import { UsernameEditor } from './UsernameEditor';

interface FriendsViewProps {
  onBack?: () => void;
  backLabel?: string;
  onOpenAccount: () => void;
  onNavigateToPlan?: (localPlanId: string) => void;
}

type FriendsSubTab = 'friends' | 'shared' | 'find';
type CircleSort = 'recent' | 'name' | 'progress';

interface DiscoveryPerson extends ReaderDirectoryEntry {
  contextNote?: string | null;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  onBack,
  backLabel,
  onOpenAccount,
  onNavigateToPlan,
}) => {
  const { firebaseAvailable, user, syncStatus } = useAccountSync();
  const { preferences, allPlans, activateReadingPlan } = useReadingData();
  const {
    ownFriendProfile,
    friends,
    incomingRequests,
    outgoingRequests,
    blockedUids,
    blockedUsers,
    sharedPlans,
    unreadEncouragementsCount,
    friendsLoading,
    friendsError,
    friendsFromCache,
    ensureFriendProfileReady,
    searchReaders,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    blockFriend,
  } = useFriendsStore();

  const [subTab, setSubTab] = useState<FriendsSubTab>('friends');
  const [editingUsername, setEditingUsername] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [copiedHandle, setCopiedHandle] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);

  const [peopleQuery, setPeopleQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ReaderDirectoryEntry[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchCompletedQuery, setSearchCompletedQuery] = useState('');

  const [requestBusyId, setRequestBusyId] = useState<string | null>(null);
  const [blockConfirmPairId, setBlockConfirmPairId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  const [circleFilter, setCircleFilter] = useState('');
  const [sortBy, setSortBy] = useState<CircleSort>('recent');
  const [selectedFriendUid, setSelectedFriendUid] = useState<string | null>(null);

  // Read Together modal state launched directly from Friends
  const [readTogetherOpen, setReadTogetherOpen] = useState(false);
  const [inviteCohort, setInviteCohort] = useState<SharedPlanCohort | null>(null);
  const [preselectedFriendUid, setPreselectedFriendUid] = useState<string | null>(null);

  const searchTokenRef = useRef(0);
  const copiedTimerRef = useRef<number | null>(null);
  const profileNoticeTimerRef = useRef<number | null>(null);

  const ownPrivacy = sanitizeFriendPrivacy(preferences.friendPrivacy);
  const ownHandle = formatUsernameHandle(ownFriendProfile?.username);

  const pendingInvitesCount = useMemo(
    () => sharedPlans.filter((sp) => sp.myMembership?.status === 'invited').length,
    [sharedPlans]
  );

  useEffect(() => {
    if (user && !ownFriendProfile) {
      void ensureFriendProfileReady();
    }
  }, [ensureFriendProfileReady, ownFriendProfile, user]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      if (profileNoticeTimerRef.current !== null) window.clearTimeout(profileNoticeTimerRef.current);
    };
  }, []);

  // Live debounced search for people by name or @username
  const executeSearch = useCallback(
    async (rawQuery: string) => {
      const trimmed = rawQuery.trim();
      const token = ++searchTokenRef.current;
      if (!trimmed || !user) {
        setSearchResults([]);
        setSearchCompletedQuery('');
        setSearchBusy(false);
        return;
      }
      setSearchBusy(true);
      setActionError(null);
      try {
        const matches = await searchReaders(trimmed);
        if (searchTokenRef.current !== token) return;
        setSearchResults(matches);
        setSearchCompletedQuery(trimmed);
      } catch (err) {
        if (searchTokenRef.current !== token) return;
        setActionError(
          err instanceof Error ? err.message : 'Could not search readers right now.'
        );
      } finally {
        if (searchTokenRef.current === token) {
          setSearchBusy(false);
        }
      }
    },
    [searchReaders, user]
  );

  useEffect(() => {
    const trimmed = peopleQuery.trim();
    if (!trimmed) {
      searchTokenRef.current += 1;
      setSearchResults([]);
      setSearchCompletedQuery('');
      setSearchBusy(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void executeSearch(trimmed);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [executeSearch, peopleQuery]);

  const friendsByUid = useMemo(() => {
    const map = new Map<string, FriendConnection>();
    for (const conn of friends) {
      map.set(conn.friendUid, conn);
    }
    return map;
  }, [friends]);

  const incomingByRequesterUid = useMemo(() => {
    const map = new Map<string, FriendshipRecord>();
    for (const req of incomingRequests) {
      map.set(req.requesterUid, req);
    }
    return map;
  }, [incomingRequests]);

  const outgoingByRecipientUid = useMemo(() => {
    const map = new Map<string, FriendshipRecord>();
    for (const req of outgoingRequests) {
      map.set(req.recipientUid, req);
    }
    return map;
  }, [outgoingRequests]);

  const cohortNoteByUid = useMemo(() => {
    const map = new Map<string, string>();
    for (const sp of sharedPlans) {
      for (const member of sp.members) {
        if (user && member.uid !== user.uid && !map.has(member.uid)) {
          map.set(member.uid, `Reading ${sp.cohort.title}`);
        }
      }
    }
    return map;
  }, [sharedPlans, user]);

  // Only suggest co-readers from shared reading plans (never random strangers)
  const sharedPlanCoReaders = useMemo<DiscoveryPerson[]>(() => {
    if (!user) return [];
    const blockedSet = new Set(blockedUids);
    const seen = new Set<string>([user.uid]);
    const list: DiscoveryPerson[] = [];

    for (const sp of sharedPlans) {
      for (const member of sp.members) {
        if (
          seen.has(member.uid) ||
          blockedSet.has(member.uid) ||
          friendsByUid.has(member.uid) ||
          incomingByRequesterUid.has(member.uid) ||
          outgoingByRecipientUid.has(member.uid)
        ) {
          continue;
        }
        seen.add(member.uid);
        list.push({
          uid: member.uid,
          displayName: member.displayName,
          username: null,
          photoURL: member.photoURL,
          contextNote: `Reading ${sp.cohort.title}`,
        });
      }
    }

    return list.slice(0, 8);
  }, [
    blockedUids,
    friendsByUid,
    incomingByRequesterUid,
    outgoingByRecipientUid,
    sharedPlans,
    user,
  ]);

  const selectedConnection = useMemo(
    () => friends.find((f) => f.friendUid === selectedFriendUid) ?? null,
    [friends, selectedFriendUid]
  );

  const visibleFriends = useMemo(() => {
    const q = circleFilter.trim().toLowerCase().replace(/^@+/, '');
    const filtered = q
      ? friends.filter((conn) => {
          const planTitle = conn.profile?.stats.activePlanTitle?.toLowerCase() ?? '';
          const bookName = conn.profile?.stats.lastReadBookId
            ? BOOKS_BY_ID[conn.profile.stats.lastReadBookId]?.name.toLowerCase() ?? ''
            : '';
          const username = conn.username?.toLowerCase() ?? '';
          return (
            conn.displayName.toLowerCase().includes(q) ||
            username.includes(q) ||
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
        const aCh =
          a.profile?.sharingEnabled && a.profile.privacy.showBookProgress
            ? a.profile.stats.totalChaptersRead
            : -1;
        const bCh =
          b.profile?.sharingEnabled && b.profile.privacy.showBookProgress
            ? b.profile.stats.totalChaptersRead
            : -1;
        return bCh - aCh || a.displayName.localeCompare(b.displayName);
      }
      const aDate =
        a.profile?.sharingEnabled && a.profile.privacy.showRecentBook
          ? a.profile.stats.lastReadDate ?? ''
          : '';
      const bDate =
        b.profile?.sharingEnabled && b.profile.privacy.showRecentBook
          ? b.profile.stats.lastReadDate ?? ''
          : '';
      return bDate.localeCompare(aDate) || a.displayName.localeCompare(b.displayName);
    });
  }, [circleFilter, friends, sortBy]);

  const hasPendingRequests = incomingRequests.length > 0 || outgoingRequests.length > 0;
  const trimmedPeopleQuery = peopleQuery.trim();
  const isSearching = trimmedPeopleQuery.length > 0;

  const displayedSearchResults = useMemo<DiscoveryPerson[]>(() => {
    if (!trimmedPeopleQuery || !user) return [];
    const blockedSet = new Set(blockedUids);
    const byUid = new Map<string, DiscoveryPerson>();

    for (const entry of searchResults) {
      if (entry.uid === user.uid || blockedSet.has(entry.uid)) continue;
      byUid.set(entry.uid, {
        ...entry,
        contextNote: cohortNoteByUid.get(entry.uid) ?? null,
      });
    }

    const addLocalCandidate = (candidate: ReaderDirectoryEntry) => {
      if (candidate.uid === user.uid || blockedSet.has(candidate.uid)) return;
      if (!matchesDirectoryQuery(candidate, trimmedPeopleQuery)) return;
      const existing = byUid.get(candidate.uid);
      if (existing) {
        if (!existing.username && candidate.username) {
          byUid.set(candidate.uid, { ...existing, username: candidate.username });
        }
        return;
      }
      byUid.set(candidate.uid, {
        ...candidate,
        contextNote: cohortNoteByUid.get(candidate.uid) ?? null,
      });
    };

    for (const conn of friends) {
      addLocalCandidate({
        uid: conn.friendUid,
        displayName: conn.displayName,
        username: conn.username,
        photoURL: conn.photoURL,
      });
    }
    for (const req of incomingRequests) {
      addLocalCandidate({
        uid: req.requesterUid,
        displayName: req.requesterName,
        username: req.requesterUsername ?? null,
        photoURL: req.requesterPhotoURL,
      });
    }
    for (const req of outgoingRequests) {
      addLocalCandidate({
        uid: req.recipientUid,
        displayName: req.recipientName,
        username: req.recipientUsername ?? null,
        photoURL: req.recipientPhotoURL,
      });
    }

    return [...byUid.values()].sort((a, b) => {
      const rankDiff =
        rankDirectoryMatch(a, trimmedPeopleQuery) - rankDirectoryMatch(b, trimmedPeopleQuery);
      if (rankDiff !== 0) return rankDiff;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [
    blockedUids,
    cohortNoteByUid,
    friends,
    incomingRequests,
    outgoingRequests,
    searchResults,
    trimmedPeopleQuery,
    user,
  ]);

  const handleCopyUsername = async () => {
    if (!ownHandle) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(ownHandle);
      }
      setCopiedHandle(true);
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = window.setTimeout(() => setCopiedHandle(false), 2500);
    } catch {
      setProfileNotice(`Your username is ${ownHandle}`);
      if (profileNoticeTimerRef.current !== null) window.clearTimeout(profileNoticeTimerRef.current);
      profileNoticeTimerRef.current = window.setTimeout(() => setProfileNotice(null), 3500);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void executeSearch(peopleQuery);
  };

  const handleAddFriend = async (target: FriendRequestTarget) => {
    setActionError(null);
    setActionStatus(null);
    setRequestBusyId(`send:${target.uid}`);
    try {
      const outcome = await sendFriendRequest(target);
      setActionStatus(
        outcome === 'accepted'
          ? `Added ${target.displayName} as a friend.`
          : `Friend request sent to ${target.displayName}.`
      );
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
      setActionStatus(`Added ${requesterName} as a friend.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not accept request.');
    } finally {
      setRequestBusyId(null);
    }
  };

  const handleDecline = async (pairId: string) => {
    setActionError(null);
    setActionStatus(null);
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

  const handleCancelOutgoing = async (pairId: string, recipientName?: string) => {
    setActionError(null);
    setActionStatus(null);
    setRequestBusyId(pairId);
    try {
      await cancelFriendRequest(pairId);
      setActionStatus(
        recipientName ? `Cancelled request to ${recipientName}.` : 'Request cancelled.'
      );
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
      setActionError(err instanceof Error ? err.message : 'Could not block user.');
    } finally {
      setRequestBusyId(null);
    }
  };

  const handleOpenStartSharedPlan = (friendUid?: string | null) => {
    setInviteCohort(null);
    setPreselectedFriendUid(friendUid ?? null);
    setReadTogetherOpen(true);
  };

  const handleInviteToExistingCohort = (cohort: SharedPlanCohort) => {
    setInviteCohort(cohort);
    setPreselectedFriendUid(null);
    setReadTogetherOpen(true);
  };

  const handleSelectPlanFromShared = (localPlanId: string) => {
    void activateReadingPlan(localPlanId);
    onNavigateToPlan?.(localPlanId);
  };

  const modalPlan = useMemo(() => {
    if (inviteCohort) {
      return (
        allPlans.find((p) => p.id === inviteCohort.sourcePlanId) ??
        allPlans.find((p) => p.id === `shared-${inviteCohort.id}`) ??
        allPlans[0] ??
        null
      );
    }
    return (
      allPlans.find((p) => p.id === preferences.activePlanId) ??
      allPlans[0] ??
      null
    );
  }, [allPlans, inviteCohort, preferences.activePlanId]);

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
    return 'Friend on Selah';
  };

  const renderDirectoryRow = (person: DiscoveryPerson) => {
    const existingFriend = friendsByUid.get(person.uid);
    const incomingReq = incomingByRequesterUid.get(person.uid);
    const outgoingReq = outgoingByRecipientUid.get(person.uid);
    const handle = formatUsernameHandle(person.username);
    const isSendBusy = requestBusyId === `send:${person.uid}`;
    const isIncomingBusy = incomingReq ? requestBusyId === incomingReq.id : false;
    const isOutgoingBusy = outgoingReq ? requestBusyId === outgoingReq.id : false;

    const subLine = incomingReq
      ? 'Sent you a friend request'
      : person.contextNote || (existingFriend ? 'Already friends' : null);

    return (
      <li
        key={person.uid}
        className="flex flex-col justify-between gap-3 p-3.5 sm:flex-row sm:items-center"
      >
        <div className="flex min-w-0 items-center gap-3">
          <ProfileAvatar
            user={{
              displayName: person.displayName,
              email: null,
              photoURL: person.photoURL,
            }}
            sizeClassName="h-10 w-10"
            textClassName="text-sm"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                {person.displayName}
              </p>
              {handle && (
                <span className="truncate text-xs text-[var(--text-secondary)]">{handle}</span>
              )}
            </div>
            {subLine && (
              <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{subLine}</p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 pl-[3.25rem] sm:pl-0">
          {existingFriend ? (
            <button
              type="button"
              onClick={() => setSelectedFriendUid(person.uid)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)]"
            >
              <UserCheck className="h-3.5 w-3.5 text-[var(--color-sage)]" aria-hidden="true" />
              <span>Friends</span>
            </button>
          ) : incomingReq ? (
            <>
              <button
                type="button"
                disabled={isIncomingBusy}
                onClick={() => void handleAccept(incomingReq.id, incomingReq.requesterName)}
                className="btn-primary min-h-9 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-60"
              >
                Accept
              </button>
              <button
                type="button"
                disabled={isIncomingBusy}
                onClick={() => void handleDecline(incomingReq.id)}
                className="min-h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-60"
              >
                Decline
              </button>
            </>
          ) : outgoingReq ? (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
                <Check className="h-3.5 w-3.5 text-[var(--color-sage)]" aria-hidden="true" />
                <span>Requested</span>
              </span>
              <button
                type="button"
                disabled={isOutgoingBusy}
                onClick={() => void handleCancelOutgoing(outgoingReq.id, person.displayName)}
                aria-label={`Cancel friend request to ${person.displayName}`}
                className="min-h-9 rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--color-crimson)] disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          ) : (
            <motion.button
              type="button"
              whileTap={TACTILE_TAP}
              transition={SPRING_TACTILE}
              disabled={isSendBusy}
              onClick={() =>
                void handleAddFriend({
                  uid: person.uid,
                  displayName: person.displayName,
                  username: person.username,
                  photoURL: person.photoURL,
                })
              }
              className="btn-primary inline-flex min-h-9 items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium disabled:opacity-60"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isSendBusy ? 'Sending…' : 'Add friend'}</span>
            </motion.button>
          )}
        </div>
      </li>
    );
  };

  const subTabs: {
    id: FriendsSubTab;
    label: string;
    count?: number;
    attentionCount?: number;
  }[] = [
    {
      id: 'friends',
      label: 'Friends',
      count: friends.length > 0 ? friends.length : undefined,
      attentionCount: unreadEncouragementsCount,
    },
    {
      id: 'shared',
      label: 'Read Together',
      count: sharedPlans.length > 0 ? sharedPlans.length : undefined,
      attentionCount: pendingInvitesCount,
    },
    {
      id: 'find',
      label: 'Find & Requests',
      attentionCount: incomingRequests.length,
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-7">
      {/* Page Header */}
      <section className="border-b border-[var(--border-subtle)] pb-5 sm:pb-6">
        {onBack && backLabel && (
          <button
            type="button"
            onClick={onBack}
            className="tactile-press mb-3 inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to {backLabel}</span>
          </button>
        )}

        <div className="max-w-[60ch]">
          <h1 className="font-display text-2xl font-medium tracking-tight text-[var(--text-primary)] sm:text-[2.15rem]">
            Friends
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
            Share your Bible progress, encourage each other, and read plans together. Journal notes
            always stay private.
          </p>
        </div>
      </section>

      {!firebaseAvailable ? (
        <section className="folio-sheet p-5 sm:p-8">
          <div className="max-w-[60ch] space-y-2">
            <h2 className="font-display text-xl font-medium text-[var(--text-primary)]">
              Cloud accounts unavailable here
            </h2>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              Friends uses Firebase authentication and cloud sync to connect readers. Configure
              your Firebase environment keys in <code className="font-mono">.env.local</code> to
              enable accounts and friend search.
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
                Sign in to read alongside friends
              </h2>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                Create a free account to pick your @username, connect with friends, follow reading
                plans together, and see each other’s progress across all 66 books.
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
          {(friendsFromCache || syncStatus === 'offline') && (
            <div className="flex items-center gap-2.5 rounded-md border border-[var(--border-subtle)] bg-[var(--color-lamp-soft)] px-4 py-2.5 text-xs text-[var(--text-primary)]">
              <CloudOff className="h-4 w-4 shrink-0 text-[var(--color-lamp)]" aria-hidden="true" />
              <span>
                Offline — showing your last synced friends snapshot. Searches and requests will
                resume when you’re back online.
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

          {/* Your Profile & Sharing Controls Bar */}
          <section
            aria-label="Your friends profile"
            className="folio-sheet p-4 sm:p-5"
          >
            <div className="flex flex-col justify-between gap-3.5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <ProfileAvatar user={user} sizeClassName="h-11 w-11" textClassName="text-sm" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <p className="truncate font-display text-lg font-medium text-[var(--text-primary)]">
                      {user.displayName || 'Selah Reader'}
                    </p>
                    <span className="truncate text-xs font-medium text-[var(--color-accent)]">
                      {ownHandle || 'Preparing @username…'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {!ownPrivacy.sharingEnabled
                      ? 'Progress sharing is paused'
                      : !ownPrivacy.discoverable
                        ? 'Hidden from search · sharing with current friends'
                        : 'Share your @username so friends can find you'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {ownHandle && (
                  <button
                    type="button"
                    onClick={() => void handleCopyUsername()}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface)]"
                  >
                    {copiedHandle ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[var(--color-sage)]" aria-hidden="true" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" />
                        <span>Copy {ownHandle}</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  aria-expanded={editingUsername}
                  onClick={() => {
                    setEditingUsername((v) => !v);
                    if (!editingUsername) setPrivacyOpen(false);
                  }}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    editingUsername
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <AtSign className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Edit username</span>
                </button>

                <button
                  type="button"
                  aria-expanded={privacyOpen}
                  onClick={() => {
                    setPrivacyOpen((v) => !v);
                    if (!privacyOpen) setEditingUsername(false);
                  }}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    privacyOpen
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    Privacy{blockedUsers.length > 0 ? ` (${blockedUsers.length} blocked)` : ''}
                  </span>
                </button>
              </div>
            </div>

            {profileNotice && (
              <p
                role="status"
                className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[var(--color-sage)]"
              >
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{profileNotice}</span>
              </p>
            )}

            <AnimatePresence initial={false}>
              {editingUsername && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18, ease: FOLIO_EASE }}
                  className="overflow-hidden"
                >
                  <UsernameEditor
                    className="mt-4"
                    onCancel={() => setEditingUsername(false)}
                    onSaved={(savedUsername) => {
                      setEditingUsername(false);
                      setProfileNotice(`Username saved as @${savedUsername}`);
                      if (profileNoticeTimerRef.current !== null) {
                        window.clearTimeout(profileNoticeTimerRef.current);
                      }
                      profileNoticeTimerRef.current = window.setTimeout(
                        () => setProfileNotice(null),
                        3500
                      );
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {privacyOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: FOLIO_EASE }}
                  className="mt-4 overflow-hidden"
                >
                  <FriendPrivacyPanel />
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Segmented Sub-tabs */}
          <div
            role="tablist"
            aria-label="Friends sections"
            className="grid grid-cols-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1 text-xs font-medium sm:inline-grid sm:w-auto sm:min-w-[26rem]"
          >
            {subTabs.map((tab) => {
              const active = subTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSubTab(tab.id)}
                  className={`relative flex min-h-10 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 transition-colors sm:min-h-9 ${
                    active
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="friends-subtab-pill"
                      transition={SPRING_TACTILE}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-md bg-[var(--bg-elevated)] shadow-2xs"
                    />
                  )}
                  <span className="relative z-10 truncate">{tab.label}</span>
                  {tab.attentionCount && tab.attentionCount > 0 ? (
                    <span className="relative z-10 rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 text-[0.65rem] font-semibold leading-none text-white tabular-nums">
                      {tab.attentionCount}
                    </span>
                  ) : tab.count !== undefined ? (
                    <span className="relative z-10 text-[0.7rem] text-[var(--text-secondary)] tabular-nums">
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Actionable Banners when items await on another sub-tab */}
          {subTab === 'friends' && (incomingRequests.length > 0 || pendingInvitesCount > 0) && (
            <div className="flex flex-wrap items-center gap-2.5">
              {incomingRequests.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSubTab('find')}
                  className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-opacity hover:opacity-90"
                >
                  <UserPlus className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" />
                  <span>
                    {incomingRequests.length}{' '}
                    {incomingRequests.length === 1
                      ? 'pending friend request'
                      : 'pending friend requests'}
                  </span>
                  <span className="text-[var(--color-accent)] underline underline-offset-2">
                    Review
                  </span>
                </button>
              )}
              {pendingInvitesCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSubTab('shared')}
                  className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--color-lamp)] bg-[var(--color-lamp-soft)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-opacity hover:opacity-90"
                >
                  <BookOpen className="h-3.5 w-3.5 text-[var(--color-lamp)]" aria-hidden="true" />
                  <span>
                    {pendingInvitesCount}{' '}
                    {pendingInvitesCount === 1
                      ? 'shared plan invite'
                      : 'shared plan invites'}
                  </span>
                  <span className="text-[var(--color-accent)] underline underline-offset-2">
                    View
                  </span>
                </button>
              )}
            </div>
          )}

          {/* SUB-TAB 1: FRIENDS */}
          {subTab === 'friends' && (
            <div className="space-y-6">
              <EncouragementSlipsPanel />

              <section aria-labelledby="friends-list-heading" className="folio-sheet p-4 sm:p-6">
                <div className="flex flex-col justify-between gap-3 border-b border-[var(--border-subtle)] pb-4 sm:flex-row sm:items-center">
                  <div>
                    <h2
                      id="friends-list-heading"
                      className="font-display text-xl font-medium text-[var(--text-primary)]"
                    >
                      Your friends
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)] tabular-nums">
                      {friends.length === 0
                        ? 'No friends added yet'
                        : `${friends.length} ${friends.length === 1 ? 'friend' : 'friends'} connected`}
                    </p>
                  </div>

                  {friends.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {(friends.length > 3 || circleFilter) && (
                        <input
                          type="search"
                          value={circleFilter}
                          onChange={(e) => setCircleFilter(e.target.value)}
                          aria-label="Filter friends"
                          placeholder="Filter by name, @username, or book…"
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
                    Loading your friends…
                  </p>
                ) : friends.length === 0 ? (
                  <div className="space-y-3 py-8">
                    <p className="max-w-[55ch] text-sm leading-relaxed text-[var(--text-secondary)]">
                      Search by name or @username to add friends. Once connected, tap any friend
                      to see their Bible progress, send an encouragement, or start a reading plan
                      together.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSubTab('find')}
                      className="btn-primary inline-flex min-h-9 items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium"
                    >
                      <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Find friends</span>
                    </button>
                  </div>
                ) : visibleFriends.length === 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 py-8">
                    <p className="text-sm text-[var(--text-secondary)]">
                      No friends matched “{circleFilter}”.
                    </p>
                    <button
                      type="button"
                      onClick={() => setCircleFilter('')}
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
                      const connHandle = formatUsernameHandle(conn.username);

                      return (
                        <li key={conn.friendUid}>
                          <button
                            type="button"
                            onClick={() => setSelectedFriendUid(conn.friendUid)}
                            className="group -mx-2 flex w-[calc(100%+1rem)] flex-col gap-3 rounded-md px-2 py-4 text-left transition-colors hover:bg-[var(--bg-surface)]/70"
                          >
                            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                              <div className="flex min-w-0 items-center gap-3">
                                <SanctuaryLamp active={lampActive} size={28} animated={false} />
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
                                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                    <p className="truncate font-display text-lg font-medium text-[var(--text-primary)] group-hover:text-[var(--color-accent)]">
                                      {conn.displayName}
                                    </p>
                                    {connHandle && (
                                      <span className="truncate text-xs text-[var(--text-secondary)]">
                                        {connHandle}
                                      </span>
                                    )}
                                  </div>
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
                                      ({totalRead.toLocaleString()} /{' '}
                                      {TOTAL_CANON_CHAPTERS.toLocaleString()} ch)
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
            </div>
          )}

          {/* SUB-TAB 2: READ TOGETHER */}
          {subTab === 'shared' && (
            <section aria-labelledby="friends-shared-heading" className="space-y-4">
              <div className="folio-sheet flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
                <div className="max-w-[58ch]">
                  <h2
                    id="friends-shared-heading"
                    className="font-display text-xl font-medium text-[var(--text-primary)]"
                  >
                    Read Together
                  </h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                    Follow a Bible reading plan alongside friends. Only completed plan days and
                    chapter totals are shared — journal notes stay private.
                  </p>
                </div>
                <motion.button
                  type="button"
                  whileTap={TACTILE_TAP}
                  transition={SPRING_TACTILE}
                  onClick={() => handleOpenStartSharedPlan()}
                  className="btn-primary inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium sm:min-h-9"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Start a shared plan</span>
                </motion.button>
              </div>

              {sharedPlans.length === 0 ? (
                <div className="folio-sheet p-6 sm:p-8">
                  <p className="max-w-[55ch] text-sm leading-relaxed text-[var(--text-secondary)]">
                    No shared reading plans yet. Start a plan together to see each other’s progress
                    day by day and encourage one another along the way.
                  </p>
                </div>
              ) : (
                <ReadTogetherBand
                  hideHeader
                  activePlanId={preferences.activePlanId}
                  onSelectLocalPlan={handleSelectPlanFromShared}
                  onInviteToCohort={handleInviteToExistingCohort}
                />
              )}
            </section>
          )}

          {/* SUB-TAB 3: FIND & REQUESTS */}
          {subTab === 'find' && (
            <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
              {hasPendingRequests && (
                <section
                  aria-labelledby="friend-requests-heading"
                  className="folio-sheet p-4 sm:p-6 lg:order-2 lg:col-span-5"
                >
                  <h2
                    id="friend-requests-heading"
                    className="font-display text-xl font-medium text-[var(--text-primary)]"
                  >
                    Friend requests
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
                            const reqHandle = formatUsernameHandle(req.requesterUsername);
                            return (
                              <li
                                key={req.id}
                                className="flex flex-col justify-between gap-3 p-3.5"
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
                                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                                        {req.requesterName}
                                      </p>
                                      {reqHandle && (
                                        <span className="truncate text-xs text-[var(--text-secondary)]">
                                          {reqHandle}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-[var(--text-secondary)]">
                                      Wants to connect as friends
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
                          {outgoingRequests.map((req) => {
                            const recHandle = formatUsernameHandle(req.recipientUsername);
                            return (
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
                                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                                        {req.recipientName}
                                      </p>
                                      {recHandle && (
                                        <span className="truncate text-xs text-[var(--text-secondary)]">
                                          {recHandle}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-[var(--text-secondary)]">
                                      Waiting for response
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={requestBusyId === req.id}
                                  onClick={() => void handleCancelOutgoing(req.id, req.recipientName)}
                                  className="min-h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--color-crimson)] hover:text-[var(--color-crimson)] disabled:opacity-60"
                                >
                                  Cancel request
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </section>
              )}

              <section
                aria-labelledby="add-friend-heading"
                className={`folio-sheet p-4 sm:p-6 lg:order-1 ${
                  hasPendingRequests ? 'lg:col-span-7' : 'lg:col-span-12'
                }`}
              >
                <div className="max-w-[60ch]">
                  <h2
                    id="add-friend-heading"
                    className="font-display text-xl font-medium text-[var(--text-primary)]"
                  >
                    Find friends
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                    Search by name or @username to send a friend request.
                  </p>
                </div>

                <form onSubmit={handleSearchSubmit} className="mt-4">
                  <div className="relative flex items-center">
                    <Search
                      className="pointer-events-none absolute left-3.5 h-4 w-4 text-[var(--text-secondary)]"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={peopleQuery}
                      onChange={(e) => {
                        setPeopleQuery(e.target.value);
                        if (actionError) setActionError(null);
                      }}
                      aria-label="Search people by name or @username"
                      placeholder="Search by name or @username…"
                      className="folio-input min-h-11 w-full py-2 pl-10 pr-10 text-base placeholder:text-[var(--text-secondary)] sm:min-h-10 sm:text-sm [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
                    />
                    {peopleQuery && (
                      <button
                        type="button"
                        onClick={() => setPeopleQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2 inline-flex h-8 w-8 items-center justify-center rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </form>

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

                {isSearching ? (
                  <div className="mt-4">
                    {searchBusy && displayedSearchResults.length === 0 ? (
                      <p className="py-3 text-xs text-[var(--text-secondary)]">
                        Searching…
                      </p>
                    ) : displayedSearchResults.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                          <span>
                            Results for “{searchCompletedQuery || trimmedPeopleQuery}”
                          </span>
                          {searchBusy && <span>Updating…</span>}
                        </div>
                        <ul className="divide-y divide-[var(--border-subtle)] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
                          {displayedSearchResults.map(renderDirectoryRow)}
                        </ul>
                      </div>
                    ) : !searchBusy && searchCompletedQuery === trimmedPeopleQuery ? (
                      <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4 text-xs leading-relaxed text-[var(--text-secondary)]">
                        No readers matched “{trimmedPeopleQuery}”. Check the spelling or try their
                        full name or @username.
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-4 space-y-2.5">
                    {!ownPrivacy.discoverable && (
                      <p className="text-xs text-[var(--text-secondary)]">
                        Your profile is currently hidden from people search. You can change this
                        under Privacy above.
                      </p>
                    )}

                    {sharedPlanCoReaders.length > 0 ? (
                      <>
                        <p className="text-xs font-medium text-[var(--text-secondary)]">
                          People from your shared plans
                        </p>
                        <ul className="divide-y divide-[var(--border-subtle)] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
                          {sharedPlanCoReaders.map(renderDirectoryRow)}
                        </ul>
                      </>
                    ) : (
                      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                        Enter a friend’s name or @username above to connect
                        {ownHandle ? `, or copy your handle (${ownHandle}) above to share with them.` : '.'}
                      </p>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {selectedConnection && (
        <FriendFolioDialog
          connection={selectedConnection}
          onClose={() => setSelectedFriendUid(null)}
          onInviteToPlan={(friendUid) => handleOpenStartSharedPlan(friendUid)}
        />
      )}

      {readTogetherOpen && (
        <ReadTogetherModal
          open={true}
          plan={modalPlan}
          availablePlans={inviteCohort ? undefined : allPlans}
          existingCohort={inviteCohort}
          initialFriendUid={preselectedFriendUid}
          onClose={() => {
            setReadTogetherOpen(false);
            setInviteCohort(null);
            setPreselectedFriendUid(null);
          }}
          onCreated={() => setSubTab('shared')}
          onOpenAccount={onOpenAccount}
          onOpenFriends={() => setSubTab('find')}
        />
      )}
    </div>
  );
};
