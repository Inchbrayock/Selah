import Dexie, { type Table } from 'dexie';
import type {
  CustomPlanDefinition,
  FriendProfile,
  FriendshipRecord,
  QuietEncouragement,
  ReadingLogEntry,
  SharedPlanWithMembers,
  UserPreferences,
} from '../types/bible';

export interface StoredPreferencesRow {
  key: 'user';
  value: UserPreferences;
}

export interface StoredFriendCacheRow {
  ownerUid: string;
  ownProfile: FriendProfile | null;
  friendships: FriendshipRecord[];
  profilesByUid: Record<string, FriendProfile>;
  sharedPlans?: SharedPlanWithMembers[];
  encouragements?: QuietEncouragement[];
  sentCooldowns?: Record<string, string>;
  updatedAt: string;
}

class SelahDatabase extends Dexie {
  readingLogs!: Table<ReadingLogEntry, string>;
  preferences!: Table<StoredPreferencesRow, string>;
  customPlans!: Table<CustomPlanDefinition, string>;
  friendCache!: Table<StoredFriendCacheRow, string>;

  constructor() {
    super('selah-scripture-sanctuary-db');
    this.version(1).stores({
      readingLogs: 'id, bookId, readDate, loggedAt',
      preferences: 'key',
    });
    this.version(2).stores({
      readingLogs: 'id, bookId, readDate, loggedAt',
      preferences: 'key',
      customPlans: 'id, updatedAt',
    });
    this.version(3).stores({
      readingLogs: 'id, bookId, readDate, loggedAt',
      preferences: 'key',
      customPlans: 'id, updatedAt',
      friendCache: 'ownerUid',
    });
    this.version(4).stores({
      readingLogs: 'id, bookId, readDate, loggedAt',
      preferences: 'key',
      customPlans: 'id, updatedAt',
      friendCache: 'ownerUid',
    });
  }
}

export const db = new SelahDatabase();
