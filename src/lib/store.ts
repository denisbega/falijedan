/**
 * Klijentski keš podataka sa servera.
 * Izvor istine je server (server/engine.ts); ovdje držimo zadnji snimak koji korisnik smije vidjeti,
 * osvježavamo ga preko /api/sync (ETag) i realtime događaja, a čuvamo ga i lokalno za offline prikaz.
 */
import type { DB } from './types';

const CACHE_KEY = 'falijedan:cache:v1';
type Listener = () => void;
export type LoadStatus = 'loading' | 'ready' | 'offline';

const EMPTY: DB = {
  version: 0,
  seededAt: 0,
  currentUserId: null,
  users: [],
  playerSports: [],
  sessions: [],
  sessionPlayers: [],
  ratings: [],
  threads: [],
  messages: [],
  reads: {},
  notifications: [],
};

function readCache(): { db: DB; etag: string | null } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as { db: DB; etag: string | null }) : null;
  } catch {
    return null;
  }
}

const cached = readCache();
let db: DB = cached?.db ?? EMPTY;
let etag: string | null = cached?.etag ?? null;
let status: LoadStatus = cached?.db.currentUserId ? 'ready' : 'loading';
let statusVersion = 0;
const listeners = new Set<Listener>();
const statusListeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}
function setStatus(s: LoadStatus) {
  if (status === s) return;
  status = s;
  statusVersion++;
  statusListeners.forEach((l) => l());
}
function saveCache() {
  try {
    if (db.currentUserId) localStorage.setItem(CACHE_KEY, JSON.stringify({ db, etag }));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* npr. pun storage — keš nije obavezan */
  }
}

let inflight: Promise<void> | null = null;

export const store = {
  get: (): DB => db,
  status: (): LoadStatus => status,
  statusVersion: () => statusVersion,
  subscribe(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  subscribeStatus(l: Listener) {
    statusListeners.add(l);
    return () => {
      statusListeners.delete(l);
    };
  },
  /** Postavlja svjež snimak sa servera (odgovor na mutaciju ili sync). */
  set(next: DB, nextEtag: string | null = null) {
    db = next;
    etag = nextEtag;
    saveCache();
    setStatus('ready');
    emit();
  },
  setLoggedOut() {
    db = EMPTY;
    etag = null;
    saveCache();
    setStatus('ready');
    emit();
  },
  /** Povlači podatke sa servera; 304 ako se ništa nije promijenilo za ovog korisnika. */
  refresh(): Promise<void> {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const res = await fetch('/api/sync', { credentials: 'same-origin', headers: etag && db.currentUserId ? { 'If-None-Match': etag } : {} });
        if (res.status === 304) return setStatus('ready');
        if (res.status === 401) return store.setLoggedOut();
        if (!res.ok) throw new Error(`sync ${res.status}`);
        const data = (await res.json()) as { db: DB };
        store.set(data.db, res.headers.get('ETag'));
      } catch {
        // Server nedostupan: radimo sa zadnjim sačuvanim podacima
        setStatus(db.currentUserId ? 'ready' : 'offline');
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
};

/* ---------- Efemerno stanje: "kuca..." u chatu (stiže preko realtime-a) ---------- */
const typing = new Map<string, string>();
const typingListeners = new Set<Listener>();
let typingVersion = 0;
export const typingStore = {
  get: () => typingVersion,
  who: (threadId: string) => typing.get(threadId) ?? null,
  set(threadId: string, userId: string | null) {
    if (userId) typing.set(threadId, userId);
    else typing.delete(threadId);
    typingVersion++;
    typingListeners.forEach((l) => l());
  },
  subscribe(l: Listener) {
    typingListeners.add(l);
    return () => {
      typingListeners.delete(l);
    };
  },
};
