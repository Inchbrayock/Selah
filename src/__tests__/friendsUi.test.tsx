import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountUser } from '../lib/auth';
import type {
  CustomPlanDefinition,
  FriendCodeLookup,
  FriendProfile,
  FriendshipRecord,
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
  profileCallbacks: new Map<string, (profile: FriendProfile | null) => void>(),
}));

const friendsMocks = vi.hoisted(() => ({
  ensureOwnFriendProfile: vi.fn(),
  publishOwnFriendStats: vi.fn().mockResolvedValue(undefined),
  regenerateOwnFriendCode: vi.fn(),
  lookupFriendByCode: vi.fn(),
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
  regenerateOwnFriendCode: (...args: unknown[]) => friendsMocks.regenerateOwnFriendCode(...args),
  lookupFriendByCode: (...args: unknown[]) => friendsMocks.lookupFriendByCode(...args),
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
  friendCode: 'H7M4P9Q2',
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
  friendCode: 'M9N2K4V7',
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

function emitAuth(user: AccountUser | null) {
  authState.currentUser = user;
  for (const listener of authState.listeners) {
    listener(user);
  }
}

describe('Reading Circle UI and workflows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    authState.currentUser = null;
    friendsSyncState.onFriendshipsCb = null;
    friendsSyncState.profileCallbacks.clear();

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
  });

  it('opens Reading Circle from the header while signed out and preserves the 4 primary tabs', async () => {
    render(<App />);

    const friendsButton = await screen.findByRole('button', { name: 'Open Reading Circle' });
    fireEvent.click(friendsButton);

    expect(await screen.findByRole('heading', { name: 'Reading Circle' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sign in to read alongside friends' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in to connect' })).toBeInTheDocument();

    // Primary nav tabs remain the 4 core views
    const navButtons = screen.getByRole('navigation', { name: 'Primary' }).querySelectorAll('button');
    expect(navButtons).toHaveLength(4);
  });

  it('consumes ?addFriend invite links across sign-in and looks up & sends a request', async () => {
    window.history.replaceState(null, '', '/?addFriend=R7M4-P9Q2');

    const ruthLookup: FriendCodeLookup = {
      code: 'R7M4P9Q2',
      uid: 'uid_ruth',
      displayName: 'Ruth',
    };
    friendsMocks.lookupFriendByCode.mockResolvedValue(ruthLookup);
    friendsMocks.sendFriendRequest.mockResolvedValue({ outcome: 'sent' });

    render(<App />);

    // ?addFriend lands automatically on Reading Circle with invite banner while signed out
    expect(
      await screen.findByRole('heading', { name: 'Sign in to open invite R7M4-P9Q2' })
    ).toBeInTheDocument();
    expect(window.location.search).toBe('');

    // Simulate signing in
    await act(async () => {
      emitAuth(HANNAH);
    });

    await waitFor(() => {
      expect(friendsMocks.lookupFriendByCode).toHaveBeenCalledWith('R7M4-P9Q2');
    });

    expect(await screen.findByText('Ruth')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));

    await waitFor(() => {
      expect(friendsMocks.sendFriendRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          currentUser: expect.objectContaining({ uid: 'uid_hannah' }),
          target: ruthLookup,
        })
      );
    });

    expect(await screen.findByText('Request sent to Ruth.')).toBeInTheDocument();
  });

  it('handles incoming/outgoing requests, inspects Friend Folio & MiniCanonicalSpine, toggles privacy, and regenerates code', async () => {
    const incomingFromMiriam: FriendshipRecord = {
      id: 'uid_hannah_uid_miriam',
      users: ['uid_hannah', 'uid_miriam'],
      requesterUid: 'uid_miriam',
      recipientUid: 'uid_hannah',
      requesterName: 'Miriam',
      requesterPhotoURL: null,
      recipientName: 'Hannah',
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
      requesterPhotoURL: null,
      recipientName: 'Luke',
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

    // Dashboard quiet Reading Circle strip reflects incoming request
    const dashboardStrip = await screen.findByRole('region', { name: 'Reading Circle summary' });
    expect(dashboardStrip).toHaveTextContent('1 incoming request');
    expect(
      screen.getByRole('button', { name: 'Open Reading Circle (1 pending request)' })
    ).toBeInTheDocument();

    // Open Reading Circle from Dashboard strip
    fireEvent.click(screen.getByRole('button', { name: 'Open Reading Circle' }));

    expect(await screen.findByText('H7M4-P9Q2', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText('Miriam')).toBeInTheDocument();
    expect(screen.getByText('Luke')).toBeInTheDocument();

    // Cancel outgoing request
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    await waitFor(() => {
      expect(friendsMocks.deleteFriendship).toHaveBeenCalledWith('uid_hannah_uid_luke');
    });

    // Accept Miriam's request
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => {
      expect(friendsMocks.acceptFriendRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          pairId: 'uid_hannah_uid_miriam',
        })
      );
    });

    // Simulate snapshot transitioning Miriam to accepted and pushing Miriam's FriendProfile
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

    expect(await screen.findByText('1 friend connected')).toBeInTheDocument();
    expect(screen.getByText(/7 days streak/i)).toBeInTheDocument();

    // Click friend row to inspect FriendFolioDialog
    fireEvent.click(screen.getByRole('button', { name: /Miriam/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('54 / 1,189 ch');
    expect(dialog).toHaveTextContent('1 of 66 books completed');
    expect(dialog).toHaveTextContent('5 earned');

    // Interactive MiniCanonicalSpine segment focuses cleanly
    const genesisSpineBtn = screen.getByRole('button', { name: 'Genesis: 50 of 50 chapters' });
    fireEvent.focus(genesisSpineBtn);
    expect(dialog).toHaveTextContent('Genesis: 50 of 50 chapters');

    // Remove friend confirmation inside FriendFolioDialog
    fireEvent.click(screen.getByRole('button', { name: 'Remove friend' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => {
      expect(friendsMocks.deleteFriendship).toHaveBeenCalledWith('uid_hannah_uid_miriam');
    });

    // Toggle Circle privacy and verify preference sync
    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
    const progressCheckbox = screen.getByRole('checkbox', {
      name: /66-book progress and chapter totals/i,
    });
    expect(progressCheckbox).toBeChecked();
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

    // Regenerate friend code via InlineDeleteConfirm
    friendsMocks.regenerateOwnFriendCode.mockResolvedValue({
      ...HANNAH_PROFILE,
      friendCode: 'Z8W3Q5Y9',
    });
    fireEvent.click(screen.getByRole('button', { name: 'New code' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace code' }));

    await waitFor(() => {
      expect(friendsMocks.regenerateOwnFriendCode).toHaveBeenCalled();
    });
    expect(await screen.findByText('Z8W3-Q5Y9')).toBeInTheDocument();
    expect(await screen.findByText('New friend code ready')).toBeInTheDocument();
  });

  it('blocks an incoming requester via inline confirmation and navigates from Settings', async () => {
    const incomingSpam: FriendshipRecord = {
      id: 'uid_hannah_uid_stranger',
      users: ['uid_hannah', 'uid_stranger'],
      requesterUid: 'uid_stranger',
      recipientUid: 'uid_hannah',
      requesterName: 'Stranger',
      requesterPhotoURL: null,
      recipientName: 'Hannah',
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

    // Open Reading Circle from header badge button
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open Reading Circle (1 pending request)' })
    );
    expect(
      await screen.findByRole('heading', { name: 'Reading Circle' }, { timeout: 3000 })
    ).toBeInTheDocument();

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

    // Navigate to Settings via Account popover and verify Reading Circle & privacy link returns here
    fireEvent.click(screen.getByRole('button', { name: /Open account and cloud sync/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Settings/i }, { timeout: 3000 }));
    const circleLink = await screen.findByRole(
      'button',
      { name: /Reading Circle & privacy/i },
      { timeout: 3000 }
    );
    fireEvent.click(circleLink);
    expect(
      await screen.findByRole('heading', { name: 'Reading Circle' }, { timeout: 3000 })
    ).toBeInTheDocument();
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
});
