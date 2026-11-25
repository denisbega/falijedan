/**
 * Ažuriranje podataka uživo.
 * - Stalni server (lokalno, VPS): Server-Sent Events — "sync" → povuci svježe podatke; "typing" → indikator kucanja.
 * - Serverless (Vercel): kratko periodično provjeravanje /api/sync uz ETag (304 kad nema promjena — jeftino).
 * Server javlja koji režim koristi (/api/auth/providers → realtime).
 */
import { store, typingStore } from './store';

type Mode = 'sse' | 'poll';

let userId: string | null = null;
let generation = 0;
let source: EventSource | null = null;
let pollTimer: number | undefined;
let syncTimer: number | undefined;
let lastActivity = Date.now();
const typingTimers = new Map<string, number>();

function scheduleSync() {
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => void store.refresh(), 120);
}

let modePromise: Promise<Mode> | null = null;
function realtimeMode(): Promise<Mode> {
  modePromise ??= fetch('/api/auth/providers')
    .then((r) => (r.ok ? (r.json() as Promise<{ realtime?: Mode }>) : Promise.reject(new Error(String(r.status)))))
    .then((p) => (p.realtime === 'sse' ? 'sse' : 'poll'))
    .catch(() => {
      modePromise = null; // pokušaj ponovo kasnije; polling radi sa svakim serverom
      return 'poll' as const;
    });
  return modePromise;
}

/* ---------- SSE ---------- */

function startSse() {
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

/* ---------- Polling ---------- */

/** Brže u otvorenom chatu, sporije kad korisnik ništa ne radi (štedi pozive funkcija na Vercelu). */
function pollInterval() {
  if (location.pathname.startsWith('/poruke/')) return 2000;
  return Date.now() - lastActivity > 2 * 60000 ? 15000 : 4000;
}

function startPolling(gen: number) {
  const tick = async () => {
    if (gen !== generation) return;
    if (document.visibilityState === 'visible' && navigator.onLine !== false) await store.refresh();
    if (gen === generation) pollTimer = window.setTimeout(tick, pollInterval());
  };
  pollTimer = window.setTimeout(tick, pollInterval());
}

/* ---------- Javni API ---------- */

export function connectRealtime(forUser: string | null) {
  if (forUser === userId) return;
  const gen = ++generation;
  source?.close();
  source = null;
  window.clearTimeout(pollTimer);
  userId = forUser;
  if (!forUser) return;
  void realtimeMode().then((mode) => {
    if (gen !== generation) return;
    if (mode === 'sse' && typeof EventSource !== 'undefined') startSse();
    else startPolling(gen);
  });
}

// Osvježi kad se korisnik vrati u aplikaciju ili se vrati internet
if (typeof window !== 'undefined') {
  const touch = () => {
    lastActivity = Date.now();
  };
  window.addEventListener('pointerdown', touch, { passive: true });
  window.addEventListener('keydown', touch);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    touch();
    if (store.get().currentUserId) scheduleSync();
  });
  window.addEventListener('online', () => store.get().currentUserId && scheduleSync());
}
