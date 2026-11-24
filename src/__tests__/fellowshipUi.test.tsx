import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountUser } from '../lib/auth';
import type {
  BlockedFriendRecord,
  CustomPlanDefinition,
  FriendProfile,
  FriendshipRecord,
  QuietEncouragement,
  ReadingLogEntry,
  SharedPlanCohort,
  SharedPlanMember,
  UserPreferences,
} from '../types/bible';

const authState = vi.hoisted(() => ({
  listeners: new Set<(user: AccountUser | null) => void>(),
  currentUser: null as AccountUser | null,
}));

const cloudMocks = vi.hoisted(() => ({
  ensureCloudUserDoc: vi.fn(),
  fetchCloudLogs: vi.fn(),
  fetchCloudCustomPlans: vi.fn(),
  subscribeCloudSanctuary: vi.fn(),
  saveCloudPreferences: vi.fn().mockResolvedValue(undefined),
  saveCloudColorScheme: vi.fn().mockResolvedValue(undefined),
  saveCloudDisplayName: vi.fn().mockResolvedValue(undefined),
  upsertCloudReadingLog: vi.fn().mockResolvedValue(undefined),
  deleteCloudReadingLog: vi.fn().mockResolvedValue(undefined),
  batchSyncReadingLogs: vi.fn().mockResolvedValue(undefined),
  replaceCloudLogs: vi.fn().mockResolvedValue(undefined),
  upsertCloudCustomPlan: vi.fn().mockResolvedValue(undefined),
  deleteCloudCustomPlan: vi.fn().mockResolvedValue(undefined),
  batchSyncCustomPlans: vi.fn().mockResolvedValue(undefined),
  replaceCloudCustomPlans: vi.fn().mockResolvedValue(undefined),
}));

const friendsSyncState = vi.hoisted(() => ({
  onFriendshipsCb: null as ((records: FriendshipRecord[], fromCache: boolean) => void) | null,
  profileCallbacks: new Map<string, (profile: FriendProfile | null) => void>(),
}));

const friendsMocks = vi.hoisted(() => ({
  ensureOwnFriendProfile: vi.fn(),
  publishOwnFriendStats: vi.fn().mockResolvedValue(undefined),
  checkUsernameAvailability: vi.fn().mockResolvedValue({ available: true, normalized: 'hannah' }),
  claimCustomUsername: vi.fn(),
  searchReaderDirectory: vi.fn().mockResolvedValue([]),
  fetchSuggestedReaders: vi.fn().mockResolvedValue([]),
  fetchBlockedUids: vi.fn().mockResolvedValue([]),
  fetchBlockedUsers: vi.fn().mockResolvedValue([] as BlockedFriendRecord[]),
  unblockUser: vi.fn().mockResolvedValue(undefined),
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn().mockResolvedValue(undefined),
  deleteFriendship: vi.fn().mockResolvedValue(undefined),
  blockUserAndRemoveFriendship: vi.fn().mockResolvedValue(undefined),
  subscribeFriendships: vi.fn(),
  subscribeFriendProfile: vi.fn(),
}));

const fellowshipSyncState = vi.hoisted(() => ({
  onCohortsCb: null as ((cohorts: SharedPlanCohort[], fromCache: boolean) => void) | null,
  memberCallbacks: new Map<string, (members: SharedPlanMember[]) => void>(),
  onEncouragementsCb: null as ((items: QuietEncouragement[]) => void) | null,
}));

const fellowshipMocks = vi.hoisted(() => ({
  createSharedPlanCohort: vi.fn(),
  inviteFriendToCohort: vi.fn().mockResolvedValue(undefined),
  joinSharedPlanCohort: vi.fn().mockResolvedValue(undefined),
  leaveOrDeclineSharedCohort: vi.fn().mockResolvedValue(undefined),
  deleteSharedPlanCohort: vi.fn().mockResolvedValue(undefined),
  publishSharedPlanMemberProgress: vi.fn().mockResolvedValue(undefined),
  sendQuietEncouragement: vi.fn(),
  acknowledgeQuietEncouragement: vi.fn().mockResolvedValue(undefined),
  fetchSentEncouragementSentAt: vi.fn().mockResolvedValue(null),
  subscribeSharedPlans: vi.fn(),
  subscribeSharedPlanMembers: vi.fn(),
  subscribeReceivedEncouragements: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  isAuthAvailable: () => true,
  subscribeToAuthState: (cb: (user: AccountUser | null) => void) => {
    authState.listeners.add(cb);
    cb(authState.currentUser);
    return () => {
      authState.listeners.delete(cb);
    };
  },
  formatAuthError: (err: unknown) => (err instanceof Error ? err.message : 'Auth error'),
  sendAccountPasswordReset: vi.fn().mockResolvedValue(undefined),
  signInWithEmailAccount: vi.fn(),
  signInWithGoogleAccount: vi.fn(),
  signOutAccount: vi.fn().mockResolvedValue(undefined),
  signUpWithEmailAccount: vi.fn(),
  updateAccountDisplayName: vi.fn().mockResolvedValue(undefined),
  updateAccountPhotoUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../db/cloudSync', () => ({
  ensureCloudUserDoc: (...args: unknown[]) => cloudMocks.ensureCloudUserDoc(...args),
  fetchCloudLogs: (...args: unknown[]) => cloudMocks.fetchCloudLogs(...args),
  fetchCloudCustomPlans: (...args: unknown[]) => cloudMocks.fetchCloudCustomPlans(...args),
  subscribeCloudSanctuary: (...args: unknown[]) => cloudMocks.subscribeCloudSanctuary(...args),
  saveCloudPreferences: (...args: unknown[]) => cloudMocks.saveCloudPreferences(...args),
  saveCloudColorScheme: (...args: unknown[]) => cloudMocks.saveCloudColorScheme(...args),
  saveCloudDisplayName: (...args: unknown[]) => cloudMocks.saveCloudDisplayName(...args),
  upsertCloudReadingLog: (...args: unknown[]) => cloudMocks.upsertCloudReadingLog(...args),
  deleteCloudReadingLog: (...args: unknown[]) => cloudMocks.deleteCloudReadingLog(...args),
  batchSyncReadingLogs: (...args: unknown[]) => cloudMocks.batchSyncReadingLogs(...args),
  replaceCloudLogs: (...args: unknown[]) => cloudMocks.replaceCloudLogs(...args),
  upsertCloudCustomPlan: (...args: unknown[]) => cloudMocks.upsertCloudCustomPlan(...args),
  deleteCloudCustomPlan: (...args: unknown[]) => cloudMocks.deleteCloudCustomPlan(...args),
  batchSyncCustomPlans: (...args: unknown[]) => cloudMocks.batchSyncCustomPlans(...args),
  replaceCloudCustomPlans: (...args: unknown[]) => cloudMocks.replaceCloudCustomPlans(...args),
}));

vi.mock('../db/friendsSync', () => ({
  ensureOwnFriendProfile: (...args: unknown[]) => friendsMocks.ensureOwnFriendProfile(...args),
  publishOwnFriendStats: (...args: unknown[]) => friendsMocks.publishOwnFriendStats(...args),
  checkUsernameAvailability: (...args: unknown[]) => friendsMocks.checkUsernameAvailability(...args),
  claimCustomUsername: (...args: unknown[]) => friendsMocks.claimCustomUsername(...args),
  searchReaderDirectory: (...args: unknown[]) => friendsMocks.searchReaderDirectory(...args),
  fetchSuggestedReaders: (...args: unknown[]) => friendsMocks.fetchSuggestedReaders(...args),
  fetchBlockedUids: (...args: unknown[]) => friendsMocks.fetchBlockedUids(...args),
  fetchBlockedUsers: (...args: unknown[]) => friendsMocks.fetchBlockedUsers(...args),
  unblockUser: (...args: unknown[]) => friendsMocks.unblockUser(...args),
  sendFriendRequest: (...args: unknown[]) => friendsMocks.sendFriendRequest(...args),
  acceptFriendRequest: (...args: unknown[]) => friendsMocks.acceptFriendRequest(...args),
  deleteFriendship: (...args: unknown[]) => friendsMocks.deleteFriendship(...args),
  blockUserAndRemoveFriendship: (...args: unknown[]) =>
    friendsMocks.blockUserAndRemoveFriendship(...args),
  subscribeFriendships: (
    uid: string,
    handlers: {
      onFriendships: (records: FriendshipRecord[], fromCache: boolean) => void;
      onError: (err: Error) => void;
    }
  ) => {
    friendsMocks.subscribeFriendships(uid, handlers);
    friendsSyncState.onFriendshipsCb = handlers.onFriendships;
    handlers.onFriendships([], false);
    return () => {
      friendsSyncState.onFriendshipsCb = null;
    };
  },
  subscribeFriendProfile: (
    uid: string,
    onProfile: (profile: FriendProfile | null) => void,
    onError: (err: Error) => void
  ) => {
    friendsMocks.subscribeFriendProfile(uid, onProfile, onError);
    friendsSyncState.profileCallbacks.set(uid, onProfile);
    return () => {
      friendsSyncState.profileCallbacks.delete(uid);
    };
  },
}));

vi.mock('../db/fellowshipSync', () => ({
  createSharedPlanCohort: (...args: unknown[]) => fellowshipMocks.createSharedPlanCohort(...args),
  inviteFriendToCohort: (...args: unknown[]) => fellowshipMocks.inviteFriendToCohort(...args),
  joinSharedPlanCohort: (...args: unknown[]) => fellowshipMocks.joinSharedPlanCohort(...args),
  leaveOrDeclineSharedCohort: (...args: unknown[]) =>
    fellowshipMocks.leaveOrDeclineSharedCohort(...args),
  deleteSharedPlanCohort: (...args: unknown[]) => fellowshipMocks.deleteSharedPlanCohort(...args),
  publishSharedPlanMemberProgress: (...args: unknown[]) =>
    fellowshipMocks.publishSharedPlanMemberProgress(...args),
  sendQuietEncouragement: (...args: unknown[]) => fellowshipMocks.sendQuietEncouragement(...args),
  acknowledgeQuietEncouragement: (...args: unknown[]) =>
    fellowshipMocks.acknowledgeQuietEncouragement(...args),
  fetchSentEncouragementSentAt: (...args: unknown[]) =>
    fellowshipMocks.fetchSentEncouragementSentAt(...args),
  subscribeSharedPlans: (
    uid: string,
    handlers: {
      onCohorts: (cohorts: SharedPlanCohort[], fromCache: boolean) => void;
      onError: (err: Error) => void;
    }
  ) => {
    fellowshipMocks.subscribeSharedPlans(uid, handlers);
    fellowshipSyncState.onCohortsCb = handlers.onCohorts;
    handlers.onCohorts([], false);
    return () => {
      fellowshipSyncState.onCohortsCb = null;
    };
  },
  subscribeSharedPlanMembers: (
    cohortId: string,
    onMembers: (members: SharedPlanMember[]) => void
  ) => {
    fellowshipMocks.subscribeSharedPlanMembers(cohortId, onMembers);
    fellowshipSyncState.memberCallbacks.set(cohortId, onMembers);
    return () => {
      fellowshipSyncState.memberCallbacks.delete(cohortId);
    };
  },
  subscribeReceivedEncouragements: (
    uid: string,
    onEncouragements: (items: QuietEncouragement[]) => void
  ) => {
    fellowshipMocks.subscribeReceivedEncouragements(uid, onEncouragements);
    fellowshipSyncState.onEncouragementsCb = onEncouragements;
    onEncouragements([]);
    return () => {
      fellowshipSyncState.onEncouragementsCb = null;
    };
  },
}));

import App from '../App';
import { DEFAULT_PREFERENCES } from '../db/repository';
import { DEFAULT_FRIEND_PRIVACY } from '../lib/friends';

const HANNAH: AccountUser = {
  uid: 'uid_hannah',
  displayName: 'Hannah',
  email: 'hannah@example.com',
  emailVerified: true,
  photoURL: null,
  providerIds: ['password'],
};

const HANNAH_PROFILE: FriendProfile = {
  uid: 'uid_hannah',
  displayName: 'Hannah',
  photoURL: null,
  username: 'hannah',
  discoverable: true,
  sharingEnabled: true,
  privacy: { ...DEFAULT_FRIEND_PRIVACY },
  stats: {
    totalChaptersRead: 10,
    otChaptersRead: 6,
    ntChaptersRead: 4,
    booksCompleted: 0,
    currentStreak: 3,
    longestStreak: 5,
    unlockedSealsCount: 2,
    lastReadBookId: 'john',
    lastReadDate: '2026-04-02',
    activePlanId: 'chronological-year',
    activePlanTitle: 'Chronological Bible',
    bookProgressSpec: 'genesis:6,john:4',
  },
};

const MIRIAM_PROFILE: FriendProfile = {
  uid: 'uid_miriam',
  displayName: 'Miriam',
  photoURL: null,
  username: 'miriam',
  discoverable: true,
  sharingEnabled: true,
  privacy: { ...DEFAULT_FRIEND_PRIVACY },
  stats: {
    totalChaptersRead: 22,
    otChaptersRead: 18,
    ntChaptersRead: 4,
    booksCompleted: 0,
    currentStreak: 5,
    longestStreak: 8,
    unlockedSealsCount: 4,
    lastReadBookId: 'psalms',
    lastReadDate: '2026-04-02',
    activePlanId: null,
    activePlanTitle: null,
    bookProgressSpec: 'genesis:18,john:4',
  },
};

const ACCEPTED_FRIENDSHIP: FriendshipRecord = {
  id: 'uid_hannah_uid_miriam',
  users: ['uid_hannah', 'uid_miriam'],
  requesterUid: 'uid_miriam',
  recipientUid: 'uid_hannah',
  requesterName: 'Miriam',
  requesterPhotoURL: null,
  recipientName: 'Hannah',
  recipientPhotoURL: null,
  status: 'accepted',
  createdAt: '2026-04-01T10:00:00.000Z',
  acceptedAt: '2026-04-01T12:00:00.000Z',
  updatedAt: '2026-04-01T12:00:00.000Z',
};

function emitAuth(user: AccountUser | null) {
  authState.currentUser = user;
  for (const listener of authState.listeners) {
    listener(user);
  }
}

describe('Shared Reading, Encouragements, and Friend Bonus Milestones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    authState.currentUser = null;
    friendsSyncState.onFriendshipsCb = null;
    friendsSyncState.profileCallbacks.clear();
    fellowshipSyncState.onCohortsCb = null;
    fellowshipSyncState.memberCallbacks.clear();
    fellowshipSyncState.onEncouragementsCb = null;

    cloudMocks.ensureCloudUserDoc.mockImplementation(
      async (user: AccountUser, defaults: { preferences: UserPreferences; colorScheme: string }) => ({
        existed: true,
        preferences: defaults.preferences ?? { ...DEFAULT_PREFERENCES },
        colorScheme: defaults.colorScheme ?? 'system',
        displayName: user.displayName ?? '',
      })
    );
    cloudMocks.fetchCloudLogs.mockResolvedValue([] as ReadingLogEntry[]);
    cloudMocks.fetchCloudCustomPlans.mockResolvedValue([] as CustomPlanDefinition[]);
    cloudMocks.subscribeCloudSanctuary.mockImplementation(() => () => {});
    friendsMocks.ensureOwnFriendProfile.mockResolvedValue(HANNAH_PROFILE);
    friendsMocks.fetchBlockedUsers.mockResolvedValue([]);
  });

  it('keeps the 28 solo milestones separate while offering Optional Friends (Bonus) milestones', async () => {
    render(<App />);

    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    fireEvent.click(within(nav).getByRole('button', { name: /^Milestones$/i }));

    expect(await screen.findByText(/0 of 28 unlocked/i)).toBeInTheDocument();

    const bonusPill = screen.getByRole('button', { name: 'Friends (Bonus)' });
    fireEvent.click(bonusPill);

    expect(
      await screen.findByText(/Optional bonus milestones celebrating shared reading/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Iron Sharpens Iron')).toBeInTheDocument();
    expect(screen.getByText('Two Are Better Than One')).toBeInTheDocument();
    expect(screen.getByText('Word in Season')).toBeInTheDocument();
    expect(screen.getByText('A Threefold Cord')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Iron Sharpens Iron/i }));
    expect(await screen.findByText('Optional Friend Milestone')).toBeInTheDocument();
  }, 15000);

  it('offers a working Sign in button in ReadTogetherModal when signed out', async () => {
    render(<App />);

    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    fireEvent.click(within(nav).getByRole('button', { name: /Journal & Plans/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reading Plans' }));

    fireEvent.click(await screen.findByRole('button', { name: /Read together/i }));
    const dialog = await screen.findByRole('dialog');
    const signInBtn = within(dialog).getByRole('button', { name: /^Sign in$/i });
    fireEvent.click(signInBtn);

    expect(await screen.findByTestId('account-popover')).toBeInTheDocument();
  }, 15000);

  it('supports starting a Read Together cohort, joining a custom shared plan invite, and displaying member progress in Plans and Friends', async () => {
    const createdCohort: SharedPlanCohort = {
      id: 'cohort-gospel-share',
      hostUid: 'uid_hannah',
      hostName: 'Hannah',
      planType: 'builtin',
      sourcePlanId: 'chronological-year',
      title: 'Chronological Bible',
      description: 'Daily chronological walkthrough',
      sections: [],
      durationDays: 365,
      accentColor: 'var(--color-accent)',
      participantUids: ['uid_hannah', 'uid_miriam'],
      createdAt: '2026-04-02T09:00:00.000Z',
      updatedAt: '2026-04-02T09:00:00.000Z',
    };
    fellowshipMocks.createSharedPlanCohort.mockResolvedValue(createdCohort);

    render(<App />);
    act(() => {
      emitAuth(HANNAH);
    });

    await waitFor(() => {
      expect(friendsSyncState.onFriendshipsCb).not.toBeNull();
      expect(fellowshipSyncState.onCohortsCb).not.toBeNull();
    });

    act(() => {
      friendsSyncState.onFriendshipsCb?.([ACCEPTED_FRIENDSHIP], false);
      friendsSyncState.profileCallbacks.get('uid_miriam')?.(MIRIAM_PROFILE);
    });

    // Navigate to Journal -> Reading Plans tab
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    fireEvent.click(within(nav).getByRole('button', { name: /Journal & Plans/i }));
    const plansTab = await screen.findByRole('button', { name: 'Reading Plans' });
    fireEvent.click(plansTab);

    const readTogetherBtn = await screen.findByRole('button', { name: /Read together/i });
    fireEvent.click(readTogetherBtn);

    expect(
      await screen.findByRole('heading', { name: 'Read together' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Only completed plan days and chapter totals are shared/i)
    ).toBeInTheDocument();

    const miriamOption = screen.getByRole('button', { name: /Miriam/i });
    fireEvent.click(miriamOption);

    fireEvent.click(screen.getByRole('button', { name: /Share with 1 friend/i }));

    await waitFor(() => {
      expect(fellowshipMocks.createSharedPlanCohort).toHaveBeenCalledTimes(1);
    });
    expect(fellowshipMocks.createSharedPlanCohort.mock.calls[0][0]).toMatchObject({
      inviteFriends: [{ uid: 'uid_miriam', displayName: 'Miriam', photoURL: null }],
    });

    // Now simulate receiving an invitation from Miriam for a custom snapshot plan
    const customInviteCohort: SharedPlanCohort = {
      id: 'cohort-psalms-30',
      hostUid: 'uid_miriam',
      hostName: 'Miriam',
      planType: 'custom',
      sourcePlanId: 'miriam-psalms',
      title: 'Thirty Days in Psalms',
      description: 'Read Psalms 1-30 together',
      sections: [{ bookId: 'psalms', startChapter: 1, endChapter: 30 }],
      durationDays: 10,
      accentColor: 'var(--div-wisdom)',
      participantUids: ['uid_miriam', 'uid_hannah'],
      createdAt: '2026-04-02T11:00:00.000Z',
      updatedAt: '2026-04-02T11:00:00.000Z',
    };

    act(() => {
      fellowshipSyncState.onCohortsCb?.([createdCohort, customInviteCohort], false);
    });

    await waitFor(() => {
      expect(fellowshipSyncState.memberCallbacks.has('cohort-psalms-30')).toBe(true);
    });

    act(() => {
      fellowshipSyncState.memberCallbacks.get('cohort-psalms-30')?.([
        {
          uid: 'uid_miriam',
          cohortId: 'cohort-psalms-30',
          displayName: 'Miriam',
          photoURL: null,
          status: 'joined',
          completedDays: 4,
          totalDays: 10,
          readChapters: 12,
          totalChapters: 30,
          lastReadDate: '2026-04-02',
          joinedAt: '2026-04-02T11:00:00.000Z',
          updatedAt: '2026-04-02T11:05:00.000Z',
        },
        {
          uid: 'uid_hannah',
          cohortId: 'cohort-psalms-30',
          displayName: 'Hannah',
          photoURL: null,
          status: 'invited',
          completedDays: 0,
          totalDays: 10,
          readChapters: 0,
          totalChapters: 30,
          lastReadDate: null,
          joinedAt: null,
          updatedAt: '2026-04-02T11:00:00.000Z',
        },
      ]);
    });

    // Friends nav attention badge highlights the pending shared plan invite
    expect(await screen.findByTestId('friends-attention-badge')).toHaveTextContent('1');

    expect(await screen.findByText('Thirty Days in Psalms')).toBeInTheDocument();
    expect(screen.getByText(/Invited by Miriam/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Join plan' }));

    await waitFor(() => {
      expect(fellowshipMocks.joinSharedPlanCohort).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Day 4 of 10')).toBeInTheDocument();
    expect(screen.getByText('12/30 ch')).toBeInTheDocument();
  }, 15000);

  it('displays and marks encouragements read inside Friends, supports custom messages, and enforces the 12-hour send cooldown', async () => {
    const sentIso = new Date().toISOString();
    fellowshipMocks.sendQuietEncouragement.mockResolvedValue({ sentAt: sentIso });

    render(<App />);
    act(() => {
      emitAuth(HANNAH);
    });

    await waitFor(() => {
      expect(friendsSyncState.onFriendshipsCb).not.toBeNull();
      expect(fellowshipSyncState.onEncouragementsCb).not.toBeNull();
    });

    act(() => {
      friendsSyncState.onFriendshipsCb?.([ACCEPTED_FRIENDSHIP], false);
      friendsSyncState.profileCallbacks.get('uid_miriam')?.(MIRIAM_PROFILE);
      fellowshipSyncState.onEncouragementsCb?.([
        {
          senderUid: 'uid_miriam',
          recipientUid: 'uid_hannah',
          senderName: 'Miriam',
          senderPhotoURL: null,
          presetId: 'custom',
          customMessage: 'Loved Psalm 23 today — praying for your week!',
          cohortTitle: 'Thirty Days in Psalms',
          sentCount: 1,
          sentAt: '2026-04-02T09:00:00.000Z',
          acknowledgedAt: null,
        },
      ]);
    });

    // Friends nav attention badge reflects unread encouragement
    expect(await screen.findByTestId('friends-attention-badge')).toHaveTextContent('1');

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    fireEvent.click(within(nav).getByRole('button', { name: /^Friends$/i }));

    expect(await screen.findByRole('heading', { name: 'Encouragements' })).toBeInTheDocument();
    expect(
      screen.getByText('“Loved Psalm 23 today — praying for your week!”')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mark read' }));
    await waitFor(() => {
      expect(fellowshipMocks.acknowledgeQuietEncouragement).toHaveBeenCalledWith({
        recipientUid: 'uid_hannah',
        senderUid: 'uid_miriam',
      });
    });

    // Open Miriam's friend dialog and send a custom encouragement message
    fireEvent.click(screen.getByRole('button', { name: /Miriam/i }));
    const customInput = await screen.findByLabelText(/Or write a personal note/i);
    fireEvent.change(customInput, {
      target: { value: 'So encouraged by your faithfulness in Psalms!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Send note$/i }));

    await waitFor(() => {
      expect(fellowshipMocks.sendQuietEncouragement).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUid: 'uid_miriam',
          presetId: 'custom',
          customMessage: 'So encouraged by your faithfulness in Psalms!',
        })
      );
    });

    // 12-hour cooldown immediately disables repeat sending (presets & custom input)
    expect(
      await screen.findByText(/You can send one every 12 hours/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Grace and peace as you read/i })).toBeDisabled();
    expect(screen.getByLabelText(/Or write a personal note/i)).toBeDisabled();
  }, 15000);
});
