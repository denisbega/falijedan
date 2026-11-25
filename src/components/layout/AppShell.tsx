import { Suspense, useEffect, useState } from 'react';
import { Navigate, useLocation, useOutlet } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLoadStatus, useMe, useMediaQuery, useOnline } from '../../lib/hooks';
import { store } from '../../lib/store';
import { GlassBottomNav, GlassSidebar } from './Navigation';
import { EmptyState, GlassButton, SessionCardSkeleton } from '../ui';
import { FullLogo } from './Logo';
import { RefreshCw, ServerCrash } from 'lucide-react';

/** Prvo učitavanje sa servera (bez keša). */
export function BootScreen() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true" aria-label="Učitavanje">
      <FullLogo className="w-40 animate-pulse" />
    </div>
  );
}

/** Server nedostupan, a nema sačuvanih podataka. */
export function ServerDown() {
  return (
    <div className="mx-auto grid min-h-dvh max-w-md place-items-center px-5">
      <EmptyState
        icon={ServerCrash}
        title="Server trenutno nije dostupan"
        text="Provjeri internet vezu. Pokušavamo ponovo čim se veza vrati."
        action={
          <GlassButton icon={RefreshCw} onClick={() => void store.refresh()}>
            Pokušaj ponovo
          </GlassButton>
        }
      />
    </div>
  );
}

/** Rute na kojima se na mobilnom krije donja navigacija (imaju svoj donji bar ili su fullscreen). */
const HIDE_BOTTOM_NAV = [/^\/termin\//, /^\/organizuj/, /^\/poruke\/.+/];

function FrozenOutlet() {
  const o = useOutlet();
  const [outlet] = useState(o);
  return outlet;
}

export function AppShell() {
  const me = useMe();
  const location = useLocation();
  const online = useOnline();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [pref, setPref] = useState<'auto' | 'collapsed' | 'expanded'>(() => {
    try {
      return (localStorage.getItem('falijedan:sidebar') as 'collapsed' | 'expanded') || 'auto';
    } catch {
      return 'auto';
    }
  });
  const collapsed = pref === 'auto' ? !isDesktop : pref === 'collapsed';

  const status = useLoadStatus();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  if (!me) {
    if (status === 'loading') return <BootScreen />;
    if (status === 'offline') return <ServerDown />;
    return <Navigate to="/prijava" replace state={{ from: location.pathname }} />;
  }
  if (!me.onboarded) return <Navigate to="/dobrodosli" replace />;

  const hideBottom = HIDE_BOTTOM_NAV.some((r) => r.test(location.pathname));

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-fj-green focus:px-4 focus:py-3 focus:font-extrabold focus:text-fj-on-green">
        Preskoči na sadržaj
      </a>
      {/* Pozadinsko ambijentalno svjetlo */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <span className="absolute -left-40 -top-48 size-[620px] rounded-full bg-[radial-gradient(circle,rgba(32,196,90,0.16),transparent_66%)]" />
        <span className="absolute -bottom-64 -right-40 size-[680px] rounded-full bg-[radial-gradient(circle,rgba(32,196,90,0.09),transparent_66%)]" />
      </div>

      <GlassSidebar
        collapsed={collapsed}
        onToggle={() => {
          const next = collapsed ? 'expanded' : 'collapsed';
          setPref(next);
          try {
            localStorage.setItem('falijedan:sidebar', next);
          } catch {
            /* ignoriši */
          }
        }}
      />

      <main id="main" className={cn('relative min-h-dvh transition-[padding] duration-300', collapsed ? 'md:pl-[104px]' : 'md:pl-[264px]')}>
        <AnimatePresence>
          {!online && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              role="status"
              className="sticky top-[calc(8px+var(--safe-top))] z-30 mx-auto mt-2 flex w-fit items-center gap-2 rounded-full border border-[rgba(232,176,74,0.4)] bg-[rgba(30,26,16,0.85)] px-4 py-2 text-[13px] font-bold text-fj-warning backdrop-blur-xl"
            >
              <WifiOff className="size-4" aria-hidden /> Offline si — prikazujemo sačuvane podatke
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <Suspense
              fallback={
                <div className="mx-auto grid grid-cols-1 max-w-[1100px] gap-4 px-5 pt-[calc(24px+var(--safe-top))] md:grid-cols-2 md:px-8 md:pt-8" aria-busy="true">
                  <SessionCardSkeleton />
                  <SessionCardSkeleton className="hidden md:block" />
                </div>
              }
            >
              <FrozenOutlet />
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {!hideBottom && <GlassBottomNav />}
    </div>
  );
}
