import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { AchievementModal } from './components/achievements/AchievementModal';
import { AchievementsView } from './components/achievements/AchievementsView';
import { AccountDialog } from './components/auth/AccountDialog';
import { MergeBanner } from './components/auth/MergeBanner';
import { ProfilePhotoDialog } from './components/auth/ProfilePhotoDialog';
import { DashboardView } from './components/dashboard/DashboardView';
import { FriendsView } from './components/friends/FriendsView';
import { JournalView } from './components/journal/JournalView';
import { BookDetailDialog } from './components/library/BookDetailDialog';
import { LibraryView } from './components/library/LibraryView';
import { SettingsView } from './components/settings/SettingsView';
import { AppHeader, type AppTab, type PrimaryTab } from './components/ui/AppHeader';
import { CelebrationToast } from './components/ui/CelebrationToast';
import { UpdateBanner } from './components/ui/UpdateBanner';
import { hideNativeSplashScreen, subscribeNativeBackButton } from './lib/nativeShell';
import { AppUpdaterProvider } from './lib/useAppUpdater';
import {
  BibleStoreProvider,
  useAccountSync,
  useReadingData,
  useUiFeedback,
} from './store/useBibleStore';
import type { AchievementStatus } from './types/bible';

const PRIMARY_TAB_LABELS: Record<PrimaryTab, string> = {
  dashboard: 'Home',
  library: 'Books',
  achievements: 'Milestones',
  journal: 'Journal & Plans',
};

const TAB_TITLES: Record<AppTab, string> = {
  dashboard: 'Home | Selah',
  library: 'Books | Selah',
  achievements: 'Milestones | Selah',
  journal: 'Journal & Plans | Selah',
  settings: 'Settings | Selah',
  friends: 'Friends | Selah',
};

function parseHashRoute(hash: string): { tab: AppTab; journalSubTab?: 'journal' | 'plans' } | null {
  const cleaned = hash.replace(/^#\/?/, '').trim().toLowerCase();
  switch (cleaned) {
    case 'home':
    case 'dashboard':
      return { tab: 'dashboard' };
    case 'books':
    case 'library':
      return { tab: 'library' };
    case 'milestones':
    case 'achievements':
      return { tab: 'achievements' };
    case 'journal':
      return { tab: 'journal', journalSubTab: 'journal' };
    case 'plans':
      return { tab: 'journal', journalSubTab: 'plans' };
    case 'friends':
      return { tab: 'friends' };
    case 'settings':
      return { tab: 'settings' };
    default:
      return null;
  }
}

function routeToHash(tab: AppTab, journalSubTab: 'journal' | 'plans'): string {
  switch (tab) {
    case 'dashboard':
      return '#home';
    case 'library':
      return '#books';
    case 'achievements':
      return '#milestones';
    case 'journal':
      return journalSubTab === 'plans' ? '#plans' : '#journal';
    case 'friends':
      return '#friends';
    case 'settings':
      return '#settings';
  }
}

const FooterTagline: React.FC = () => {
  const { user } = useAccountSync();
  return (
    <span>
      {user
        ? 'Synced Bible reading tracker across 66 books and 1,189 chapters.'
        : 'Track your Bible reading across 66 books and 1,189 chapters, with optional cloud sync.'}
    </span>
  );
};

const ProfilePhotoDialogBridge: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const { user } = useAccountSync();

  useEffect(() => {
    if (!user && open) {
      onClose();
    }
  }, [onClose, open, user]);

  if (!open || !user) return null;
  return <ProfilePhotoDialog open={true} onClose={onClose} />;
};

const LiveAnnouncer: React.FC = () => {
  const { announcement } = useUiFeedback();
  return (
    <div aria-live="polite" aria-atomic="true" className="visually-hidden">
      {announcement}
    </div>
  );
};

const CelebrationToastBridge: React.FC<{
  onInspect: (status: AchievementStatus) => void;
}> = ({ onInspect }) => {
  const { unlockedQueue, dismissUnlockedAchievement } = useUiFeedback();
  return (
    <CelebrationToast
      queue={unlockedQueue}
      onInspect={onInspect}
      onDismiss={dismissUnlockedAchievement}
    />
  );
};

const SanctuaryAppContent: React.FC<{ ready: boolean }> = React.memo(({ ready }) => {
  const initialRoute =
    typeof window !== 'undefined' ? parseHashRoute(window.location.hash) : null;

  const [activeTab, setActiveTab] = useState<AppTab>(initialRoute?.tab ?? 'dashboard');
  const [returnTab, setReturnTab] = useState<PrimaryTab>(
    initialRoute && initialRoute.tab !== 'settings' && initialRoute.tab !== 'friends'
      ? initialRoute.tab
      : 'dashboard'
  );
  const returnTabRef = useRef<PrimaryTab>(returnTab);
  returnTabRef.current = returnTab;

  const [journalInitialTab, setJournalInitialTab] = useState<'journal' | 'plans'>(
    initialRoute?.journalSubTab ?? 'journal'
  );
  const [openBookId, setOpenBookId] = useState<string | null>(null);
  const [inspectedAchievement, setInspectedAchievement] = useState<{
    status: AchievementStatus;
    isNew: boolean;
  } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [photoEditorOpen, setPhotoEditorOpen] = useState(false);
  const accountAnchorRef = useRef<HTMLButtonElement | null>(null);

  const navigateToTab = useCallback(
    (
      nextTab: AppTab,
      options?: { journalSubTab?: 'journal' | 'plans'; skipHashPush?: boolean }
    ) => {
      const nextJournalSubTab = options?.journalSubTab ?? 'journal';
      if (nextTab === 'settings' || nextTab === 'friends') {
        setOpenBookId(null);
      } else {
        setReturnTab(nextTab);
        setJournalInitialTab(nextJournalSubTab);
      }
      setActiveTab(nextTab);
      if (typeof window !== 'undefined' && !options?.skipHashPush) {
        const targetHash = routeToHash(nextTab, nextJournalSubTab);
        if (window.location.hash !== targetHash) {
          window.history.pushState(null, '', targetHash);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleHashChange = () => {
      const parsed = parseHashRoute(window.location.hash);
      if (!parsed) {
        navigateToTab('dashboard', { skipHashPush: true });
        return;
      }
      navigateToTab(parsed.tab, {
        journalSubTab: parsed.journalSubTab,
        skipHashPush: true,
      });
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [navigateToTab]);

  const backStateRef = useRef({
    inspectedAchievement,
    photoEditorOpen,
    accountOpen,
    openBookId,
    activeTab,
  });
  backStateRef.current = {
    inspectedAchievement,
    photoEditorOpen,
    accountOpen,
    openBookId,
    activeTab,
  };

  useEffect(() => {
    if (ready) {
      void hideNativeSplashScreen();
    }
  }, [ready]);

  useEffect(() => {
    return subscribeNativeBackButton(() => {
      const state = backStateRef.current;
      if (state.photoEditorOpen) {
        setPhotoEditorOpen(false);
        return true;
      }
      if (state.inspectedAchievement !== null) {
        setInspectedAchievement(null);
        return true;
      }
      if (state.accountOpen) {
        setAccountOpen(false);
        return true;
      }
      if (state.openBookId !== null) {
        setOpenBookId(null);
        return true;
      }
      if (state.activeTab === 'settings' || state.activeTab === 'friends') {
        navigateToTab(returnTabRef.current);
        return true;
      }
      if (state.activeTab !== 'dashboard') {
        navigateToTab('dashboard');
        return true;
      }
      return false;
    });
  }, [navigateToTab]);

  useEffect(() => {
    document.title = TAB_TITLES[activeTab];
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [activeTab]);

  const handleToggleAccount = useCallback(() => setAccountOpen((prev) => !prev), []);
  const handleOpenAccount = useCallback(() => setAccountOpen(true), []);
  const handleCloseAccount = useCallback(() => setAccountOpen(false), []);
  const handleOpenPhotoEditor = useCallback(() => setPhotoEditorOpen(true), []);
  const handleClosePhotoEditor = useCallback(() => setPhotoEditorOpen(false), []);
  const handleCloseBook = useCallback(() => setOpenBookId(null), []);
  const handleCloseAchievement = useCallback(() => setInspectedAchievement(null), []);
  const handleInspectAchievement = useCallback((status: AchievementStatus) => {
    setInspectedAchievement({ status, isNew: false });
  }, []);
  const handleInspectNewAchievement = useCallback((status: AchievementStatus) => {
    setInspectedAchievement({ status, isNew: true });
  }, []);
  const handleOpenFriends = useCallback(() => navigateToTab('friends'), [navigateToTab]);
  const handleOpenSettings = useCallback(() => navigateToTab('settings'), [navigateToTab]);
  const handleOpenPlans = useCallback(
    () => navigateToTab('journal', { journalSubTab: 'plans' }),
    [navigateToTab]
  );
  const handleBackToReturnTab = useCallback(
    () => navigateToTab(returnTabRef.current),
    [navigateToTab]
  );

  return (
    <div className="min-h-dvh flex flex-col overflow-x-clip">
      <a href="#main-content" className="skip-link visually-hidden">
        Skip to main content
      </a>

      <AppHeader
        activeTab={activeTab}
        onSelectTab={navigateToTab}
        onOpenAccount={handleToggleAccount}
        accountOpen={accountOpen}
        accountButtonRef={accountAnchorRef}
      />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-3.5 py-5 sm:px-6 sm:py-9 lg:py-10"
      >
        <UpdateBanner />
        <MergeBanner />
        {!ready ? (
          <div className="folio-sheet p-8 text-center text-sm text-[var(--text-secondary)]">
            Loading your reading history…
          </div>
        ) : (
          <div key={activeTab}>
            {activeTab === 'dashboard' && (
              <DashboardView
                onOpenBook={setOpenBookId}
                onInspectAchievement={handleInspectAchievement}
                onNavigateTab={navigateToTab}
                onOpenFriends={handleOpenFriends}
              />
            )}
            {activeTab === 'library' && <LibraryView onOpenBook={setOpenBookId} />}
            {activeTab === 'achievements' && (
              <AchievementsView onInspectAchievement={handleInspectAchievement} />
            )}
            {activeTab === 'journal' && (
              <JournalView
                onOpenBook={setOpenBookId}
                initialSubTab={journalInitialTab}
                onOpenAccount={handleOpenAccount}
                onOpenFriends={handleOpenFriends}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsView
                onBack={handleBackToReturnTab}
                backLabel={PRIMARY_TAB_LABELS[returnTab]}
                onOpenAccount={handleOpenAccount}
                onEditPhoto={handleOpenPhotoEditor}
                onOpenFriends={handleOpenFriends}
              />
            )}
            {activeTab === 'friends' && (
              <FriendsView
                onBack={handleBackToReturnTab}
                backLabel={PRIMARY_TAB_LABELS[returnTab]}
                onOpenAccount={handleOpenAccount}
                onNavigateToPlan={handleOpenPlans}
              />
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-[var(--border-subtle)] pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-[var(--text-secondary)] sm:px-6">
          <span className="font-display text-sm font-medium text-[var(--text-primary)]">
            Selah
          </span>
          <FooterTagline />
        </div>
      </footer>

      {openBookId !== null && (
        <BookDetailDialog bookId={openBookId} onClose={handleCloseBook} />
      )}

      {inspectedAchievement !== null && (
        <AchievementModal
          achievement={inspectedAchievement.status}
          isNewUnlock={inspectedAchievement.isNew}
          onClose={handleCloseAchievement}
        />
      )}

      <AccountDialog
        open={accountOpen}
        onClose={handleCloseAccount}
        onOpenFriends={handleOpenFriends}
        onOpenSettings={handleOpenSettings}
        onEditPhoto={handleOpenPhotoEditor}
        anchorRef={accountAnchorRef}
      />

      <ProfilePhotoDialogBridge open={photoEditorOpen} onClose={handleClosePhotoEditor} />

      <CelebrationToastBridge onInspect={handleInspectNewAchievement} />
      <LiveAnnouncer />
    </div>
  );
});
SanctuaryAppContent.displayName = 'SanctuaryAppContent';

const SanctuaryShell: React.FC = () => {
  const { ready } = useReadingData();
  return (
    <AppUpdaterProvider ready={ready}>
      <SanctuaryAppContent ready={ready} />
    </AppUpdaterProvider>
  );
};

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BibleStoreProvider>
        <SanctuaryShell />
      </BibleStoreProvider>
    </MotionConfig>
  );
}

export default App;
