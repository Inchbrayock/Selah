type AuthModule = typeof import('../lib/auth');
type CloudSyncModule = typeof import('./cloudSync');
type FriendsSyncModule = typeof import('./friendsSync');
type FellowshipSyncModule = typeof import('./fellowshipSync');

let authPromise: Promise<AuthModule> | null = null;
let cloudSyncPromise: Promise<CloudSyncModule> | null = null;
let friendsSyncPromise: Promise<FriendsSyncModule> | null = null;
let fellowshipSyncPromise: Promise<FellowshipSyncModule> | null = null;

export function loadAuthModule(): Promise<AuthModule> {
  if (!authPromise) {
    authPromise = import('../lib/auth');
  }
  return authPromise;
}

export function loadCloudSyncModule(): Promise<CloudSyncModule> {
  if (!cloudSyncPromise) {
    cloudSyncPromise = import('./cloudSync');
  }
  return cloudSyncPromise;
}

export function loadFriendsSyncModule(): Promise<FriendsSyncModule> {
  if (!friendsSyncPromise) {
    friendsSyncPromise = import('./friendsSync');
  }
  return friendsSyncPromise;
}

export function loadFellowshipSyncModule(): Promise<FellowshipSyncModule> {
  if (!fellowshipSyncPromise) {
    fellowshipSyncPromise = import('./fellowshipSync');
  }
  return fellowshipSyncPromise;
}
