import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { store, typingStore } from './store';
import { allSessionViews, getMe, threadViews, unreadMessages, unreadNotifications, userStats } from './selectors';
import type { DB, SessionView } from './types';

export function useDB(): DB {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function useLoadStatus() {
  useSyncExternalStore(store.subscribeStatus, store.statusVersion, store.statusVersion);
  return store.status();
}

export function useMe() {
  const db = useDB();
  return getMe(db);
}

/** Tik svakih `ms` — da se statusi (počinje uskoro, završeno) osvježavaju sami. */
export function useNow(ms = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

export function useSessionViews(): SessionView[] {
  const db = useDB();
  const now = useNow();
  return useMemo(() => allSessionViews(db, now), [db, now]);
}

export function useSessionView(id: string | undefined): SessionView | null {
  const views = useSessionViews();
  return useMemo(() => views.find((v) => v.id === id) ?? null, [views, id]);
}

export function useUserStats(userId: string | undefined) {
  const db = useDB();
  return useMemo(() => (userId ? userStats(db, userId) : null), [db, userId]);
}

export function useThreads() {
  const db = useDB();
  const now = useNow(60000);
  return useMemo(() => threadViews(db, now), [db, now]);
}

export function useUnread() {
  const db = useDB();
  return useMemo(() => ({ messages: unreadMessages(db), notifications: unreadNotifications(db) }), [db]);
}

export function useTyping(threadId: string | undefined) {
  useSyncExternalStore(typingStore.subscribe, typingStore.get, typingStore.get);
  return threadId ? typingStore.who(threadId) : null;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** Kratko "učitavanje" pri prvom ulasku, da se prikažu skeleton kartice umjesto praznog ekrana. */
let firstLoadDone = false;
export function useFirstLoad(ms = 550): boolean {
  const [loading, setLoading] = useState(!firstLoadDone);
  useEffect(() => {
    if (!loading) return;
    const t = window.setTimeout(() => {
      firstLoadDone = true;
      setLoading(false);
    }, ms);
    return () => window.clearTimeout(t);
  }, [loading, ms]);
  return loading;
}

/* ---------- PWA instalacija ---------- */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    installListeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installListeners.forEach((l) => l());
  });
}
export function useInstallPrompt() {
  const available = useSyncExternalStore(
    (cb) => {
      installListeners.add(cb);
      return () => installListeners.delete(cb);
    },
    () => !!deferredPrompt,
    () => false,
  );
  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    installListeners.forEach((l) => l());
    return outcome === 'accepted';
  }, []);
  return { available, install };
}
