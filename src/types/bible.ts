export type Testament = 'OT' | 'NT';

export type BibleDivision =
  | 'pentateuch'
  | 'history'
  | 'wisdom'
  | 'major-prophets'
  | 'minor-prophets'
  | 'gospels-acts'
  | 'pauline'
  | 'general-revelation';

export interface CanonBook {
  id: string;
  order: number;
  name: string;
  shortName: string;
  testament: Testament;
  division: BibleDivision;
  chapterCount: number;
  theme: string;
}

export interface ReadingLogEntry {
  id: string;
  bookId: string;
  chapters: number[];
  /** Calendar date in YYYY-MM-DD (Temporal.PlainDate) */
  readDate: string;
  /** ISO 8601 instant when the user logged the entry */
  loggedAt: string;
  note?: string;
  planId?: string;
}

export interface ChapterReadState {
  readCount: number;
  firstReadDate: string;
  lastReadDate: string;
}

export interface BookProgress {
  book: CanonBook;
  readChapters: number;
  totalChapters: number;
  percentage: number;
  completed: boolean;
  /** Minimum readCount across all chapters in the book (0 = not completed, 1 = 1st pass, 2+ = re-read) */
  completedCycles: number;
  chapterMap: Record<number, ChapterReadState>;
  nextUnreadChapter: number | null;
}

export interface BibleProgressSummary {
  totalChaptersRead: number;
  totalChapters: number;
  totalPercentage: number;
  otChaptersRead: number;
  otTotalChapters: number;
  otPercentage: number;
  ntChaptersRead: number;
  ntTotalChapters: number;
  ntPercentage: number;
  booksCompleted: number;
  booksInProgress: number;
  totalSessions: number;
  totalChapterReadsAllCycles: number;
  notesCount: number;
  currentStreak: number;
  longestStreak: number;
  graceUsedThisWeek: boolean;
  activeDaysCount: number;
  chaptersPerWeekAvg: number;
  projectedFinishDate: string | null;
  lastReadBookId: string | null;
  bookProgressById: Record<string, BookProgress>;
}

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'luminous';

export type AchievementCategory =
  | 'milestones'
  | 'divisions'
  | 'consistency'
  | 'habits'
  | 'special'
  | 'fellowship';

export type AchievementMotif =
  | 'scroll'
  | 'lamp'
  | 'crown'
  | 'tablets'
  | 'harp'
  | 'flame'
  | 'dove'
  | 'compass'
  | 'quill'
  | 'sunrise'
  | 'moon'
  | 'star'
  | 'shield'
  | 'chalice'
  | 'alpha-omega'
  | 'fellowship';

export interface AchievementDefinition {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  scriptureEcho: string;
  tier: AchievementTier;
  category: AchievementCategory;
  motif: AchievementMotif;
  secret?: boolean;
  bonus?: boolean;
  target: number;
  evaluate: (ctx: AchievementEvalContext) => {
    current: number;
    unlockedAt: string | null;
  };
}

export interface AchievementEvalContext {
  logs: ReadingLogEntry[];
  summary: BibleProgressSummary;
  booksById: Record<string, CanonBook>;
}

export interface AchievementStatus {
  definition: AchievementDefinition;
  unlocked: boolean;
  unlockedAt: string | null;
  current: number;
  target: number;
  percentage: number;
}

export type ReadingPlanCategory =
  | 'whole-bible'
  | 'old-testament'
  | 'new-testament'
  | 'gospels'
  | 'wisdom'
  | 'prophets'
  | 'epistles'
  | 'custom';

export type ReadingPlanOrder =
  | 'canonical'
  | 'chronological'
  | 'paired'
  | 'thematic'
  | 'custom';

export interface CustomPlanSection {
  bookId: string;
  startChapter?: number;
  endChapter?: number;
}

export interface CustomPlanDefinition {
  id: string;
  title: string;
  description: string;
  sections: CustomPlanSection[];
  durationDays: number;
  accentColor: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingPlan {
  id: string;
  title: string;
  subtitle: string;
  durationDays: number;
  accentColor: string;
  description: string;
  days: ReadingPlanDay[];
  category?: ReadingPlanCategory;
  order?: ReadingPlanOrder;
  isCustom?: boolean;
  customDefinition?: CustomPlanDefinition;
}

export interface ReadingPlanDay {
  day: number;
  title: string;
  assignments: { bookId: string; chapters: number[] }[];
}

export type ColorSchemePreference = 'system' | 'light' | 'dark';

export interface FriendPrivacySettings {
  sharingEnabled: boolean;
  showPhoto: boolean;
  showStreak: boolean;
  showRecentBook: boolean;
  showBookProgress: boolean;
  showSealsCount: boolean;
  showActivePlan: boolean;
}

export interface FriendStatsSnapshot {
  totalChaptersRead: number;
  otChaptersRead: number;
  ntChaptersRead: number;
  booksCompleted: number;
  currentStreak: number;
  longestStreak: number;
  unlockedSealsCount: number;
  lastReadBookId: string | null;
  lastReadDate: string | null;
  activePlanId: string | null;
  activePlanTitle: string | null;
  bookProgressSpec: string;
}

export interface FriendProfile {
  uid: string;
  displayName: string;
  photoURL: string | null;
  friendCode: string;
  sharingEnabled: boolean;
  privacy: FriendPrivacySettings;
  stats: FriendStatsSnapshot;
  updatedAt?: string;
}

export type FriendshipStatus = 'pending' | 'accepted';

export interface FriendshipRecord {
  id: string;
  users: [string, string];
  requesterUid: string;
  recipientUid: string;
  requesterName: string;
  requesterPhotoURL: string | null;
  recipientName: string;
  recipientPhotoURL: string | null;
  status: FriendshipStatus;
  createdAt: string;
  acceptedAt: string | null;
  updatedAt: string;
}

export interface FriendCodeLookup {
  code: string;
  uid: string;
  displayName: string;
}

export interface FriendConnection {
  friendship: FriendshipRecord;
  friendUid: string;
  displayName: string;
  photoURL: string | null;
  profile: FriendProfile | null;
}

export interface BlockedFriendRecord {
  blockedUid: string;
  displayName: string;
  createdAt: string;
}

export interface FellowshipStatsCounters {
  friendsPeak: number;
  cohortsPeak: number;
  encouragementsSent: number;
}

export type EncouragementPresetId =
  | 'praying'
  | 'alongside'
  | 'keep-going'
  | 'grace-peace';

export interface QuietEncouragement {
  senderUid: string;
  recipientUid: string;
  senderName: string;
  senderPhotoURL: string | null;
  presetId: EncouragementPresetId;
  cohortTitle: string | null;
  sentCount: number;
  sentAt: string;
  acknowledgedAt: string | null;
}

export type SharedPlanType = 'builtin' | 'custom';
export type SharedPlanMemberStatus = 'invited' | 'joined';

export interface SharedPlanCohort {
  id: string;
  hostUid: string;
  hostName: string;
  planType: SharedPlanType;
  sourcePlanId: string;
  title: string;
  description: string;
  sections: CustomPlanSection[];
  durationDays: number;
  accentColor: string;
  participantUids: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SharedPlanMember {
  uid: string;
  cohortId: string;
  displayName: string;
  photoURL: string | null;
  status: SharedPlanMemberStatus;
  completedDays: number;
  totalDays: number;
  readChapters: number;
  totalChapters: number;
  lastReadDate: string | null;
  joinedAt: string | null;
  updatedAt: string;
}

export interface SharedPlanWithMembers {
  cohort: SharedPlanCohort;
  members: SharedPlanMember[];
  myMembership: SharedPlanMember | null;
}

export interface UserPreferences {
  streakGraceEnabled: boolean;
  celebrationsEnabled: boolean;
  activePlanId: string | null;
  seenAchievementIds: string[];
  shelfPlanIds?: string[];
  friendPrivacy?: FriendPrivacySettings;
  fellowshipStats?: FellowshipStatsCounters;
}

export interface SanctuaryBackup {
  version: 1;
  exportedAt: string;
  logs: ReadingLogEntry[];
  preferences: UserPreferences;
  customPlans?: CustomPlanDefinition[];
}
