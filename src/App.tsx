import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { LazyMotion, MotionConfig, domAnimation, m } from 'motion/react';
import { AccountDialog } from './components/auth/AccountDialog';
import { MergeBanner } from './components/auth/MergeBanner';
import { DashboardView } from './components/dashboard/DashboardView';
import { AppHeader, type AppTab, type PrimaryTab } from './components/ui/AppHeader';
import { CelebrationToast } from './components/ui/CelebrationToast';
import { UpdateBanner } from './components/ui/UpdateBanner';
import { FOLIO_EASE } from './lib/motion';
import { hideNativeSplashScreen, subscribeNativeBackButton } from './lib/nativeShell';
import { AppUpdaterProvider } from './lib/useAppUpdater';
import {
  BibleStoreProvider,
  useAccountSync,
  useFriendsStore,
  useReadingData,
  useUiFeedback,
} from './store/useBibleStore';
import type { AchievementStatus } from './types/bible';

const LibraryView = lazy(() =>
  import('./components/library/LibraryView').then((mod) => ({ default: mod.LibraryView }))
);
const AchievementsView = lazy(() =>
  import('./components/achievements/AchievementsView').then((mod) => ({
    default: mod.AchievementsView,
  }))
);
const JournalView = lazy(() =>
  import('./components/journal/JournalView').then((mod) => ({ default: mod.JournalView }))
);
const FriendsView = lazy(() =>
  import('./components/friends/FriendsView').then((mod) => ({ default: mod.FriendsView }))
);
const SettingsView = lazy(() =>
  import('./components/settings/SettingsView').then((mod) => ({ default: mod.SettingsView }))
);
const BookDetailDialog = lazy(() =>
  import('./components/library/BookDetailDialog').then((mod) => ({
    default: mod.BookDetailDialog,
  }))
);
const AchievementModal = lazy(() =>
  import('./components/achievements/AchievementModal').then((mod) => ({
    default: mod.AchievementModal,
  }))
);
const ProfilePhotoDialog = lazy(() =>
  import('./components/auth/ProfilePhotoDialog').then((mod) => ({
    default: mod.ProfilePhotoDialog,
  }))
);

const PRIMARY_TAB_LABELS: Record<PrimaryTab, string> = {
  dashboard: 'Home',
  library: 'Books',
  achievements: 'Milestones',
  journal: 'Journal & Plans',
  friends: 'Friends',
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

const ViewLoadingFallback: React.FC = () => (
  <div className="folio-sheet p-8 text-center text-sm text-[var(--text-secondary)]">
    Loading…
  </div>
);

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

const SanctuaryAppContent: React.FC = () => {
  const { ready } = useReadingData();
  const { user } = useAccountSync();
  const { setFriendsDetailActive } = useFriendsStore();

  const initialRoute =
    typeof window !== 'undefined' ? parseHashRoute(window.location.hash) : null;

  const [activeTab, setActiveTab] = useState<AppTab>(initialRoute?.tab ?? 'dashboard');
  const [returnTab, setReturnTab] = useState<PrimaryTab>(
    initialRoute && initialRoute.tab !== 'settings'
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
      if (nextTab === 'settings') {
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

  // Only keep per-friend live Firestore profile listeners attached on screens that show them
  useEffect(() => {
    const needsFriendProfiles =
      activeTab === 'dashboard' || activeTab === 'friends' || activeTab === 'journal';
    setFriendsDetailActive(needsFriendProfiles);
  }, [activeTab, setFriendsDetailActive]);

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
    if (!user) {
      setPhotoEditorOpen(false);
    }
  }, [user]);

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
      if (state.activeTab === 'settings') {
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

  const handleInspectNewAchievement = useCallback((status: AchievementStatus) => {
    setInspectedAchievement({ status, isNew: true });
  }, []);

  return (
    <div className="min-h-dvh flex flex-col overflow-x-clip">
      <a href="#main-content" className="skip-link visually-hidden">
        Skip to main content
      </a>

      <AppHeader
        activeTab={activeTab}
        onSelectTab={(tab) => navigateToTab(tab)}
        onOpenAccount={() => setAccountOpen((prev) => !prev)}
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
          <m.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14, ease: FOLIO_EASE }}
          >
            <Suspense fallback={<ViewLoadingFallback />}>
              {activeTab === 'dashboard' && (
                <DashboardView
                  onOpenBook={setOpenBookId}
                  onInspectAchievement={(status) =>
                    setInspectedAchievement({ status, isNew: false })
                  }
                  onNavigateTab={(tab, options) => navigateToTab(tab, options)}
                  onOpenFriends={() => navigateToTab('friends')}
                />
              )}
              {activeTab === 'library' && <LibraryView onOpenBook={setOpenBookId} />}
              {activeTab === 'achievements' && (
                <AchievementsView
                  onInspectAchievement={(status) =>
                    setInspectedAchievement({ status, isNew: false })
                  }
                />
              )}
              {activeTab === 'journal' && (
                <JournalView
                  onOpenBook={setOpenBookId}
                  initialSubTab={journalInitialTab}
                  onOpenAccount={() => setAccountOpen(true)}
                  onOpenFriends={() => navigateToTab('friends')}
                />
              )}
              {activeTab === 'settings' && (
                <SettingsView
                  onBack={() => navigateToTab(returnTab)}
                  backLabel={PRIMARY_TAB_LABELS[returnTab]}
                  onOpenAccount={() => setAccountOpen(true)}
                  onEditPhoto={() => setPhotoEditorOpen(true)}
                  onOpenFriends={() => navigateToTab('friends')}
                />
              )}
              {activeTab === 'friends' && (
                <FriendsView
                  onOpenAccount={() => setAccountOpen(true)}
                  onNavigateToPlan={() => navigateToTab('journal', { journalSubTab: 'plans' })}
                />
              )}
            </Suspense>
          </m.div>
        )}
      </main>

      <footer className="border-t border-[var(--border-subtle)] pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-[var(--text-secondary)] sm:px-6">
          <span className="font-display text-sm font-medium text-[var(--text-primary)]">
            Selah
          </span>
          <span>
            {user
              ? 'Synced Bible reading tracker across 66 books and 1,189 chapters.'
              : 'Track your Bible reading across 66 books and 1,189 chapters, with optional cloud sync.'}
          </span>
        </div>
      </footer>

      {openBookId !== null && (
        <Suspense fallback={null}>
          <BookDetailDialog bookId={openBookId} onClose={() => setOpenBookId(null)} />
        </Suspense>
      )}

      {inspectedAchievement !== null && (
        <Suspense fallback={null}>
          <AchievementModal
            achievement={inspectedAchievement.status}
            isNewUnlock={inspectedAchievement.isNew}
            onClose={() => setInspectedAchievement(null)}
          />
        </Suspense>
      )}

      <AccountDialog
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        onOpenSettings={() => navigateToTab('settings')}
        onEditPhoto={() => setPhotoEditorOpen(true)}
        anchorRef={accountAnchorRef}
      />

      {photoEditorOpen && Boolean(user) && (
        <Suspense fallback={null}>
          <ProfilePhotoDialog open={true} onClose={() => setPhotoEditorOpen(false)} />
        </Suspense>
      )}

      <CelebrationToastBridge onInspect={handleInspectNewAchievement} />
      <LiveAnnouncer />
    </div>
  );
};

const SanctuaryShell: React.FC = () => {
  const { ready } = useReadingData();
  return (
    <AppUpdaterProvider ready={ready}>
      <SanctuaryAppContent />
    </AppUpdaterProvider>
  );
};

export function App() {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">
        <BibleStoreProvider>
          <SanctuaryShell />
        </BibleStoreProvider>
      </MotionConfig>
    </LazyMotion>
  );
}

export default App;
