import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FOLIO_EASE } from '../../lib/motion';
import { useAccountSync } from '../../store/useBibleStore';
import { GuestMergeCard } from './GuestMergeCard';

export const MergeBanner: React.FC = () => {
  const { pendingMerge, syncStatus, resolveGuestMerge } = useAccountSync();
  const busy = syncStatus === 'syncing';

  return (
    <AnimatePresence>
      {pendingMerge && (
        <motion.section
          key="merge-banner"
          aria-label="Local reading data merge prompt"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: FOLIO_EASE }}
          className="mb-6 rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-4 sm:px-6"
        >
          <GuestMergeCard
            pendingMerge={pendingMerge}
            busy={busy}
            variant="banner"
            onResolve={(strategy) => void resolveGuestMerge(strategy)}
          />
        </motion.section>
      )}
    </AnimatePresence>
  );
};
