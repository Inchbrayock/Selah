import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestoreMocks = vi.hoisted(() => {
  const onSnapshot = vi.fn((..._args: unknown[]) => vi.fn());
  return {
    collection: vi.fn((_db: unknown, ...segments: string[]) => ({
      kind: 'collection',
      path: segments.join('/'),
    })),
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
      kind: 'doc',
      path: segments.join('/'),
    })),
    query: vi.fn((target: unknown, ...constraints: unknown[]) => ({
      kind: 'query',
      target,
      constraints,
    })),
    where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
    onSnapshot,
  };
});

vi.mock('firebase/firestore', () => ({
  collection: firestoreMocks.collection,
  deleteDoc: vi.fn(),
  doc: firestoreMocks.doc,
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: firestoreMocks.onSnapshot,
  query: firestoreMocks.query,
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: firestoreMocks.where,
  writeBatch: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  getFirebaseServices: () => ({
    db: { name: 'mock-db' },
  }),
}));

import { subscribeCloudSanctuary } from '../db/cloudSync';
import { subscribeSharedPlans } from '../db/fellowshipSync';
import { subscribeFriendships } from '../db/friendsSync';

describe('Firestore snapshot metadata subscriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribes to friendships with includeMetadataChanges so cached snapshots update when synced', () => {
    const onFriendships = vi.fn();
    const onError = vi.fn();

    subscribeFriendships('uid_1', { onFriendships, onError });

    expect(firestoreMocks.onSnapshot).toHaveBeenCalledTimes(1);
    const [, options, nextCb] = firestoreMocks.onSnapshot.mock.calls[0] as unknown as [
      unknown,
      { includeMetadataChanges?: boolean },
      (snap: {
        metadata: { fromCache: boolean };
        forEach: (cb: (docSnap: { id: string; data: () => Record<string, unknown> }) => void) => void;
      }) => void,
    ];
    expect(options).toEqual({ includeMetadataChanges: true });

    const docSnap = {
      id: 'uid_1_uid_2',
      data: () => ({
        id: 'uid_1_uid_2',
        users: ['uid_1', 'uid_2'],
        requesterUid: 'uid_1',
        recipientUid: 'uid_2',
        requesterName: 'Hannah',
        requesterPhotoURL: null,
        recipientName: 'Miriam',
        recipientPhotoURL: null,
        status: 'accepted',
        createdAt: '2026-03-01T10:00:00.000Z',
        acceptedAt: '2026-03-02T10:00:00.000Z',
        updatedAt: '2026-03-02T10:00:00.000Z',
      }),
    };

    nextCb({
      metadata: { fromCache: true },
      forEach: (cb) => cb(docSnap),
    });
    expect(onFriendships).toHaveBeenLastCalledWith(
      [expect.objectContaining({ id: 'uid_1_uid_2', status: 'accepted' })],
      true
    );

    nextCb({
      metadata: { fromCache: false },
      forEach: (cb) => cb(docSnap),
    });
    expect(onFriendships).toHaveBeenLastCalledWith(
      [expect.objectContaining({ id: 'uid_1_uid_2', status: 'accepted' })],
      false
    );
  });

  it('subscribes to cloud sanctuary streams with includeMetadataChanges', () => {
    subscribeCloudSanctuary('uid_1', {
      onUserDoc: vi.fn(),
      onLogs: vi.fn(),
      onCustomPlans: vi.fn(),
      onError: vi.fn(),
    });

    expect(firestoreMocks.onSnapshot).toHaveBeenCalledTimes(3);
    for (const call of firestoreMocks.onSnapshot.mock.calls) {
      expect(call[1]).toEqual({ includeMetadataChanges: true });
    }
  });

  it('subscribes to shared plans with includeMetadataChanges', () => {
    subscribeSharedPlans('uid_1', {
      onCohorts: vi.fn(),
      onError: vi.fn(),
    });

    expect(firestoreMocks.onSnapshot).toHaveBeenCalledTimes(1);
    expect(firestoreMocks.onSnapshot.mock.calls[0]?.[1]).toEqual({
      includeMetadataChanges: true,
    });
  });
});
