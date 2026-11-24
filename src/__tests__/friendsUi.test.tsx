import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountUser } from '../lib/auth';
import type {
  BlockedFriendRecord,
  CustomPlanDefinition,
  FriendProfile,
  FriendshipRecord,
  ReaderDirectoryEntry,
  ReadingLogEntry,
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
  onFriendshipsErrCb: null as ((err: Error) => void) | null,
  profileCallbacks: new Map<string, (profile: FriendProfile | null) => void>(),
  loadFriendCacheImpl: null as ((uid: string) => Promise<unknown>) | null,
}));

const friendsMocks = vi.hoisted(() => ({
  ensureOwnFriendProfile: vi.fn(),
  publishOwnFriendStats: vi.fn().mockResolvedValue(undefined),
  checkUsernameAvailability: vi.fn(),
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
    friendsSyncState.onFriendshipsErrCb = handlers.onError;
    handlers.onFriendships([], false);
    return () => {
      friendsSyncState.onFriendshipsCb = null;
      friendsSyncState.onFriendshipsErrCb = null;
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

vi.mock('../db/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/repository')>();
  return {
    ...actual,
    loadFriendCache: (uid: string) =>
      friendsSyncState.loadFriendCacheImpl
        ? friendsSyncState.loadFriendCacheImpl(uid)
        : actual.loadFriendCache(uid),
  };
});

import App from '../App';
import { MiniCanonicalSpine } from '../components/friends/MiniCanonicalSpine';
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
    lastReadDate: '2026-03-03',
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
    totalChaptersRead: 54,
    otChaptersRead: 50,
    ntChaptersRead: 4,
    booksCompleted: 1,
    currentStreak: 7,
    longestStreak: 12,
    unlockedSealsCount: 5,
    lastReadBookId: 'genesis',
    lastReadDate: '2026-03-03',
    activePlanId: null,
    activePlanTitle: null,
    bookProgressSpec: 'genesis:50,john:4',
  },
};

const RUTH_ENTRY: ReaderDirectoryEntry = {
  uid: 'uid_ruth',
  displayName: 'Ruth Chen',
  username: 'ruth.chen',
  photoURL: null,
};

function emitAuth(user: AccountUser | null) {
  authState.currentUser = user;
  for (const listener of authState.listeners) {
    listener(user);
  }
}

async function openFriendsFromNav() {
  const nav = await screen.findByRole('navigation', { name: 'Primary' });
  fireEvent.click(within(nav).getByRole('button', { name: /^Friends$/i }));
  expect(await screen.findByRole('heading', { level: 1, name: /^Friends$/i })).toBeInTheDocument();
}

describe('Friends hub UI and social discovery workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    authState.currentUser = null;
    friendsSyncState.onFriendshipsCb = null;
    friendsSyncState.onFriendshipsErrCb = null;
    friendsSyncState.profileCallbacks.clear();
    friendsSyncState.loadFriendCacheImpl = null;

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
    friendsMocks.fetchSuggestedReaders.mockResolvedValue([]);
    friendsMocks.searchReaderDirectory.mockResolvedValue([]);
    friendsMocks.fetchBlockedUids.mockResolvedValue([]);
    friendsMocks.fetchBlockedUsers.mockResolvedValue([]);
    friendsMocks.checkUsernameAvailability.mockResolvedValue({
      available: true,
      normalized: 'hannah.reads',
    });
  });

  it('opens Friends directly from the primary navigation bar (5 tabs) and omits Friends from the account popover', async () => {
    render(<App />);

    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    const navButtons = nav.querySelectorAll('button');
    expect(navButtons).toHaveLength(5);
    expect(within(nav).getByRole('button', { name: /^Friends$/i })).toBeInTheDocument();

    // Account popover focuses on Account & Settings rather than Friends
    fireEvent.click(screen.getByRole('button', { name: /Sign in or open account menu/i }));
    const popover = await screen.findByTestId('account-popover');
    expect(within(popover).queryByRole('button', { name: /Friends/i })).not.toBeInTheDocument();
    fireEvent.click(within(popover).getByRole('button', { name: /Close account menu/i }));

    await openFriendsFromNav();

    expect(screen.getByRole('heading', { name: 'Sign in to read alongside friends' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in to connect' })).toBeInTheDocument();
    expect(screen.queryByText(/friend code/i)).not.toBeInTheDocument();
  });

  it('shows own @username with copy & inline edit in Friends, searches without random strangers, and manages username in Settings', async () => {
    friendsMocks.fetchSuggestedReaders.mockResolvedValue([RUTH_ENTRY]);
    friendsMocks.searchReaderDirectory.mockResolvedValue([RUTH_ENTRY]);
    friendsMocks.sendFriendRequest.mockResolvedValue({ outcome: 'sent' });
    friendsMocks.claimCustomUsername.mockResolvedValue({
      ...HANNAH_PROFILE,
      username: 'hannah.reads',
    });

    authState.currentUser = HANNAH;
    render(<App />);

    await waitFor(() => {
      expect(friendsMocks.subscribeFriendships).toHaveBeenCalled();
    });

    await openFriendsFromNav();

    // Own profile bar exposes @hannah, Copy button, Edit username, and Privacy right in Friends
    expect(await screen.findByText('@hannah')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy @hannah/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit username/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Privacy/i })).toBeInTheDocument();

    // Switch to Find & Requests sub-tab: NO random global strangers ("People you may know")
    fireEvent.click(screen.getByRole('tab', { name: /Find & Requests/i }));
    expect(screen.queryByText('People you may know')).not.toBeInTheDocument();
    expect(screen.queryByText('Ruth Chen')).not.toBeInTheDocument();

    // Live search by name or @username finds Ruth Chen
    const searchInput = screen.getByRole('searchbox', {
      name: /Search people by name or @username/i,
    });
    fireEvent.change(searchInput, { target: { value: 'Ruth' } });

    await waitFor(() => {
      expect(friendsMocks.searchReaderDirectory).toHaveBeenCalledWith(
        'Ruth',
        expect.objectContaining({ myUid: 'uid_hannah' })
      );
    });

    const addBtn = await screen.findByRole('button', { name: 'Add friend' });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(friendsMocks.sendFriendRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          currentUser: expect.objectContaining({ uid: 'uid_hannah' }),
          ownUsername: 'hannah',
          target: expect.objectContaining({
            uid: 'uid_ruth',
            displayName: 'Ruth Chen',
            username: 'ruth.chen',
          }),
        })
      );
    });

    expect(await screen.findByText('Friend request sent to Ruth Chen.')).toBeInTheDocument();

    // Simulate snapshot transitioning Ruth to outgoing pending -> search row updates to Requested + Cancel
    await act(async () => {
      friendsSyncState.onFriendshipsCb?.(
        [
          {
            id: 'uid_hannah_uid_ruth',
            users: ['uid_hannah', 'uid_ruth'],
            requesterUid: 'uid_hannah',
            recipientUid: 'uid_ruth',
            requesterName: 'Hannah',
            requesterUsername: 'hannah',
            requesterPhotoURL: null,
            recipientName: 'Ruth Chen',
            recipientUsername: 'ruth.chen',
            recipientPhotoURL: null,
            status: 'pending',
            createdAt: '2026-03-03T10:00:00.000Z',
            acceptedAt: null,
            updatedAt: '2026-03-03T10:00:00.000Z',
          },
        ],
        false
      );
    });

    const searchSection = screen.getByRole('heading', { name: 'Find friends' }).closest('section')!;
    expect(within(searchSection).getByText('Requested')).toBeInTheDocument();
    fireEvent.click(
      within(searchSection).getByRole('button', { name: 'Cancel friend request to Ruth Chen' })
    );
    await waitFor(() => {
      expect(friendsMocks.deleteFriendship).toHaveBeenCalledWith('uid_hannah_uid_ruth');
    });

    // Inline username edit directly inside Friends -> updates to @hannah.reads
    fireEvent.click(screen.getByRole('button', { name: /Edit username/i }));
    const handleInput = await screen.findByLabelText('Your @username');
    expect(handleInput).toHaveValue('hannah');
    fireEvent.change(handleInput, { target: { value: 'hannah.reads' } });

    await waitFor(() => {
      expect(friendsMocks.checkUsernameAvailability).toHaveBeenCalledWith(
        'hannah.reads',
        'uid_hannah'
      );
    });
    expect(await screen.findByText('@hannah.reads is available')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save username' }));
    await waitFor(() => {
      expect(friendsMocks.claimCustomUsername).toHaveBeenCalledWith(
        expect.objectContaining({
          nextUsername: 'hannah.reads',
          previousUsername: 'hannah',
        })
      );
    });
    expect(await screen.findByText('Username saved as @hannah.reads')).toBeInTheDocument();
    expect(screen.getByText('@hannah.reads')).toBeInTheDocument();
  });

  it('shows unified profile badge, handles requests, inspects Friend details, and toggles privacy in Friends & Settings', async () => {
    const incomingFromMiriam: FriendshipRecord = {
      id: 'uid_hannah_uid_miriam',
      users: ['uid_hannah', 'uid_miriam'],
      requesterUid: 'uid_miriam',
      recipientUid: 'uid_hannah',
      requesterName: 'Miriam',
      requesterUsername: 'miriam',
      requesterPhotoURL: null,
      recipientName: 'Hannah',
      recipientUsername: 'hannah',
      recipientPhotoURL: null,
      status: 'pending',
      createdAt: '2026-03-01T10:00:00.000Z',
      acceptedAt: null,
      updatedAt: '2026-03-01T10:00:00.000Z',
    };

    const outgoingToLuke: FriendshipRecord = {
      id: 'uid_hannah_uid_luke',
      users: ['uid_hannah', 'uid_luke'],
      requesterUid: 'uid_hannah',
      recipientUid: 'uid_luke',
      requesterName: 'Hannah',
      requesterUsername: 'hannah',
      requesterPhotoURL: null,
      recipientName: 'Luke',
      recipientUsername: 'luke',
      recipientPhotoURL: null,
      status: 'pending',
      createdAt: '2026-03-02T10:00:00.000Z',
      acceptedAt: null,
      updatedAt: '2026-03-02T10:00:00.000Z',
    };

    authState.currentUser = HANNAH;
    render(<App />);

    await waitFor(() => {
      expect(friendsMocks.subscribeFriendships).toHaveBeenCalled();
    });

    await act(async () => {
      friendsSyncState.onFriendshipsCb?.([incomingFromMiriam, outgoingToLuke], false);
    });

    // Friends tab attention badge reflects the incoming request (not the profile picture)
    expect(await screen.findByTestId('friends-attention-badge')).toHaveTextContent('1');
    expect(screen.queryByTestId('profile-attention-badge')).not.toBeInTheDocument();

    const dashboardStrip = await screen.findByRole('region', { name: 'Friends summary' });
    expect(dashboardStrip).toHaveTextContent('1 request');

    fireEvent.click(screen.getByRole('button', { name: 'Open Friends' }));
    expect(await screen.findByRole('heading', { level: 1, name: /^Friends$/i })).toBeInTheDocument();

    // Pending request callout banner lets user jump straight to Find & Requests
    fireEvent.click(screen.getByRole('button', { name: /1 pending friend request/i }));

    expect(await screen.findByText('Miriam')).toBeInTheDocument();
    expect(screen.getByText('@miriam')).toBeInTheDocument();
    expect(screen.getByText('Luke')).toBeInTheDocument();
    expect(screen.getByText('@luke')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    await waitFor(() => {
      expect(friendsMocks.deleteFriendship).toHaveBeenCalledWith('uid_hannah_uid_luke');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => {
      expect(friendsMocks.acceptFriendRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          pairId: 'uid_hannah_uid_miriam',
          ownUsername: 'hannah',
        })
      );
    });

    const acceptedMiriam: FriendshipRecord = {
      ...incomingFromMiriam,
      status: 'accepted',
      acceptedAt: '2026-03-03T10:00:00.000Z',
      updatedAt: '2026-03-03T10:00:00.000Z',
    };

    await act(async () => {
      friendsSyncState.onFriendshipsCb?.([acceptedMiriam], false);
    });

    await waitFor(() => {
      expect(friendsSyncState.profileCallbacks.has('uid_miriam')).toBe(true);
    });

    await act(async () => {
      friendsSyncState.profileCallbacks.get('uid_miriam')?.(MIRIAM_PROFILE);
    });

    // Switch back to Friends tab to view Miriam
    fireEvent.click(screen.getByRole('tab', { name: /^Friends/i }));

    expect(await screen.findByText('1 friend connected')).toBeInTheDocument();
    expect(screen.getByText(/7 days streak/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Miriam/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('@miriam');
    expect(dialog).toHaveTextContent('54 / 1,189 ch');
    expect(dialog).toHaveTextContent('1 of 66 books completed');
    expect(dialog).toHaveTextContent('5 unlocked');

    const genesisSpineBtn = screen.getByRole('button', { name: 'Genesis: 50 of 50 chapters' });
    fireEvent.focus(genesisSpineBtn);
    expect(dialog).toHaveTextContent('Genesis: 50 of 50 chapters');

    fireEvent.click(screen.getByRole('button', { name: 'Remove friend' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(friendsMocks.deleteFriendship).toHaveBeenCalledWith('uid_hannah_uid_miriam');
    });

    // Navigate to Settings -> Toggle Friend privacy (both search & reading metrics)
    fireEvent.click(screen.getByRole('button', { name: /Open profile menu/i }));
    const popover = await screen.findByTestId('account-popover');
    fireEvent.click(within(popover).getByRole('button', { name: /Settings/i }));
    const discoverableCheckbox = await screen.findByRole('checkbox', {
      name: /Appear in people search/i,
    });
    expect(discoverableCheckbox).toBeChecked();
    fireEvent.click(discoverableCheckbox);

    await waitFor(() => {
      expect(cloudMocks.saveCloudPreferences).toHaveBeenCalledWith(
        'uid_hannah',
        expect.objectContaining({
          friendPrivacy: expect.objectContaining({
            discoverable: false,
          }),
        })
      );
    });

    const progressCheckbox = screen.getByRole('checkbox', {
      name: /Bible progress & chapter counts/i,
    });
    fireEvent.click(progressCheckbox);

    await waitFor(() => {
      expect(cloudMocks.saveCloudPreferences).toHaveBeenCalledWith(
        'uid_hannah',
        expect.objectContaining({
          friendPrivacy: expect.objectContaining({
            showBookProgress: false,
          }),
        })
      );
    });
  });

  it('blocks an incoming requester and allows unblocking from Privacy panel', async () => {
    const incomingSpam: FriendshipRecord = {
      id: 'uid_hannah_uid_stranger',
      users: ['uid_hannah', 'uid_stranger'],
      requesterUid: 'uid_stranger',
      recipientUid: 'uid_hannah',
      requesterName: 'Stranger',
      requesterUsername: 'stranger',
      requesterPhotoURL: null,
      recipientName: 'Hannah',
      recipientUsername: 'hannah',
      recipientPhotoURL: null,
      status: 'pending',
      createdAt: '2026-03-01T10:00:00.000Z',
      acceptedAt: null,
      updatedAt: '2026-03-01T10:00:00.000Z',
    };

    authState.currentUser = HANNAH;
    render(<App />);

    await waitFor(() => {
      expect(friendsMocks.subscribeFriendships).toHaveBeenCalled();
    });

    await act(async () => {
      friendsSyncState.onFriendshipsCb?.([incomingSpam], false);
    });

    await openFriendsFromNav();
    fireEvent.click(screen.getByRole('tab', { name: /Find & Requests/i }));

    const requestBlockButton = await screen.findByRole(
      'button',
      { name: 'Block' },
      { timeout: 3000 }
    );
    fireEvent.click(requestBlockButton);
    fireEvent.click(await screen.findByRole('button', { name: 'Block' }, { timeout: 3000 }));

    await waitFor(() => {
      expect(friendsMocks.blockUserAndRemoveFriendship).toHaveBeenCalledWith({
        myUid: 'uid_hannah',
        targetUid: 'uid_stranger',
        targetDisplayName: 'Stranger',
        pairId: 'uid_hannah_uid_stranger',
      });
    });

    // Open inline Privacy panel inside Friends -> Blocked users shows Stranger with Unblock button
    const privacyBtn = await screen.findByRole('button', { name: /Privacy \(1 blocked\)/i });
    fireEvent.click(privacyBtn);

    expect(await screen.findByText('Blocked users (1)')).toBeInTheDocument();
    const unblockBtn = screen.getByRole('button', { name: 'Unblock' });
    fireEvent.click(unblockBtn);

    await waitFor(() => {
      expect(friendsMocks.unblockUser).toHaveBeenCalledWith('uid_hannah', 'uid_stranger');
    });
    expect(await screen.findByText(/No blocked users/i)).toBeInTheDocument();
  });

  it('renders interactive MiniCanonicalSpine for 66 books', () => {
    render(<MiniCanonicalSpine bookProgressSpec="genesis:50,john:10" interactive />);

    const genBtn = screen.getByRole('button', { name: 'Genesis: 50 of 50 chapters' });
    const johnBtn = screen.getByRole('button', { name: 'John: 10 of 21 chapters' });
    expect(genBtn).toBeInTheDocument();
    expect(johnBtn).toBeInTheDocument();

    fireEvent.mouseEnter(johnBtn);
    expect(screen.getByText('John: 10 of 21 chapters')).toBeInTheDocument();
  });

  it('clears the offline snapshot banner when friendships transition from cache to synced and ignores stale late friend cache loads', async () => {
    const cachedMiriam: FriendshipRecord = {
      id: 'uid_hannah_uid_miriam',
      users: ['uid_hannah', 'uid_miriam'],
      requesterUid: 'uid_miriam',
      recipientUid: 'uid_hannah',
      requesterName: 'Miriam',
      requesterUsername: 'miriam',
      requesterPhotoURL: null,
      recipientName: 'Hannah',
      recipientUsername: 'hannah',
      recipientPhotoURL: null,
      status: 'accepted',
      createdAt: '2026-03-01T10:00:00.000Z',
      acceptedAt: '2026-03-02T10:00:00.000Z',
      updatedAt: '2026-03-02T10:00:00.000Z',
    };

    let resolveLateCache!: (val: unknown) => void;
    friendsSyncState.loadFriendCacheImpl = () =>
      new Promise((resolve) => {
        resolveLateCache = resolve;
      });

    authState.currentUser = HANNAH;
    render(<App />);

    await waitFor(() => {
      expect(friendsMocks.subscribeFriendships).toHaveBeenCalled();
    });

    await openFriendsFromNav();

    await act(async () => {
      resolveLateCache({
        ownerUid: HANNAH.uid,
        ownProfile: HANNAH_PROFILE,
        friendships: [cachedMiriam],
        profilesByUid: { uid_miriam: MIRIAM_PROFILE },
        updatedAt: '2026-03-03T10:00:00.000Z',
      });
    });

    expect(
      screen.queryByText(/Offline — showing your last synced friends snapshot/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText('No friends added yet')).toBeInTheDocument();

    await act(async () => {
      friendsSyncState.onFriendshipsCb?.([cachedMiriam], true);
    });
    expect(
      await screen.findByText(/Offline — showing your last synced friends snapshot/i)
    ).toBeInTheDocument();

    await act(async () => {
      friendsSyncState.onFriendshipsCb?.([cachedMiriam], false);
    });
    await waitFor(() => {
      expect(
        screen.queryByText(/Offline — showing your last synced friends snapshot/i)
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText('1 friend connected')).toBeInTheDocument();
  });

  it('recovers errored friendships subscription when online event fires', async () => {
    authState.currentUser = HANNAH;
    render(<App />);

    await waitFor(() => {
      expect(friendsMocks.subscribeFriendships).toHaveBeenCalledTimes(1);
    });

    await openFriendsFromNav();

    await act(async () => {
      friendsSyncState.onFriendshipsErrCb?.(new Error('Transient connection lost'));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Transient connection lost');

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(friendsMocks.subscribeFriendships).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('Transient connection lost')).not.toBeInTheDocument();
    });
  });

  it('transitions signed-out to signed-in smoothly, shows @username in Account popover, and skips redundant directory writes on chapter log', async () => {
    render(<App />);

    await act(async () => {
      emitAuth(HANNAH);
    });

    await waitFor(() => {
      expect(friendsMocks.ensureOwnFriendProfile).toHaveBeenCalled();
    });

    fireEvent.click(await screen.findByRole('button', { name: /Open profile menu/i }));
    const popover = await screen.findByTestId('account-popover');
    expect(within(popover).getByText('@hannah')).toBeInTheDocument();
    expect(within(popover).queryByRole('button', { name: /Friends/i })).not.toBeInTheDocument();

    // Close menu and log a chapter -> publishOwnFriendStats should be called with syncDirectory: false
    fireEvent.click(within(popover).getByRole('button', { name: /Close account menu/i }));
    friendsMocks.publishOwnFriendStats.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Quick Log: John 1/i }));

    await waitFor(
      () => {
        expect(friendsMocks.publishOwnFriendStats).toHaveBeenCalledWith(
          expect.objectContaining({ syncDirectory: false })
        );
      },
      { timeout: 3000 }
    );
  });
});
