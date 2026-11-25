/**
 * Realtime veza sa serverom (Server-Sent Events).
 * "sync" → povuci svježe podatke (slobodna mjesta, poruke, obavještenja uživo); "typing" → indikator kucanja.
 */
import { store, typingStore } from './store';

let source: EventSource | null = null;
let userId: string | null = null;
let syncTimer: number | undefined;
const typingTimers = new Map<string, number>();

function scheduleSync() {
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => void store.refresh(), 120);
}

export function connectRealtime(forUser: string | null) {
  if (forUser === userId && (source || !forUser)) return;
  source?.close();
  source = null;
  userId = forUser;
  if (!forUser || typeof EventSource === 'undefined') return;

  source = new EventSource('/api/events');
  source.addEventListener('sync', scheduleSync);
  source.addEventListener('typing', (e) => {
    try {
      const { threadId, userId: who, on } = JSON.parse((e as MessageEvent).data) as { threadId: string; userId: string; on: boolean };
      typingStore.set(threadId, on ? who : null);
      window.clearTimeout(typingTimers.get(threadId));
      if (on) typingTimers.set(threadId, window.setTimeout(() => typingStore.set(threadId, null), 6000));
    } catch {
      /* ignoriši neispravan događaj */
    }
  });
  // Nakon ponovnog spajanja dohvati sve što je propušteno
  source.addEventListener('open', scheduleSync);
}

// Osvježi kad se korisnik vrati u aplikaciju ili se vrati internet
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && store.get().currentUserId) scheduleSync();
  });
  window.addEventListener('online', () => store.get().currentUserId && scheduleSync());
}
