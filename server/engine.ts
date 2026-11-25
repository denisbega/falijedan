/**
 * Autoritativno stanje servera. Sve izmjene idu kroz transact():
 * nacrt → pravila (src/lib/rules.ts) → upis razlika u SQLite → realtime obavještenje klijentima.
 * Node je jednonitni, pa su transakcije serijalizovane (nema trke za zadnje mjesto u terminu).
 */
import type { DB, User } from '../src/lib/types.ts';
import { createSeed, DEMO_USER_ID, rebaseSeed, SEED_VERSION } from '../src/lib/seed.ts';
import { config } from './config.ts';
import { Storage } from './db.ts';
import { hashPassword } from './passwords.ts';

let storage: Storage;
let state: DB;
let rev = 0;
const bootId = Date.now().toString(36);
const listeners = new Set<(rev: number) => void>();

const emptyDB = (): DB => ({
  version: SEED_VERSION,
  seededAt: Date.now(),
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
});

export async function initEngine() {
  storage = new Storage(config.dataDir);
  const loaded = storage.load();
  if (loaded) {
    state = loaded;
  } else {
    state = config.demo ? createSeed(Date.now()) : emptyDB();
    if (config.demo) {
      const demo = state.users.find((u) => u.id === DEMO_USER_ID);
      if (demo) demo.passwordHash = await hashPassword('demo1234');
      for (const u of state.users) if (u.id !== DEMO_USER_ID) u.passwordHash = null;
    }
    storage.persist(state);
    console.log(config.demo ? '› Baza kreirana sa demo podacima (Bijeljina).' : '› Kreirana prazna baza.');
  }
  if (config.demo) refreshDemoData();
}

function commit(next: DB) {
  const changed = storage.persist(next);
  state = next;
  if (changed) {
    rev++;
    listeners.forEach((l) => l(rev));
  }
  return changed;
}

/** Transakcija nad nacrtom stanja. Ako fn baci grešku, ništa se ne upisuje. */
export function transact<T>(fn: (draft: DB) => T): T {
  const draft = structuredClone(state);
  const result = fn(draft);
  commit(draft);
  return result;
}

/** Demo podaci se pomjeraju u sadašnjost da uvijek postoje svježi termini. */
export function refreshDemoData() {
  const next = rebaseSeed(state, Date.now());
  if (next !== state) commit(structuredClone(next));
}

export const read = (): DB => state;
export const onChange = (fn: (rev: number) => void) => listeners.add(fn);
export const etagFor = (userId: string) => `W/"${bootId}.${rev}.${userId}"`;
export const findUser = (id: string): User | undefined => state.users.find((u) => u.id === id);
export const findUserByEmail = (email: string): User | undefined => state.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
export const sql = () => storage.sql;

/** Podaci koje korisnik smije vidjeti (bez tuđih emailova, lozinki, poruka i obavještenja). */
export function snapshotFor(userId: string): DB {
  const s = state;
  const threads = s.threads.filter((t) => t.memberIds.includes(userId));
  const tids = new Set(threads.map((t) => t.id));
  return {
    version: s.version,
    seededAt: s.seededAt,
    currentUserId: userId,
    users: s.users.map((u) => {
      const { passwordHash: _ph, email, ...rest } = u;
      return u.id === userId ? { ...rest, email } : rest;
    }),
    playerSports: s.playerSports,
    sessions: s.sessions,
    sessionPlayers: s.sessionPlayers,
    ratings: s.ratings,
    threads,
    messages: s.messages.filter((m) => tids.has(m.threadId)),
    reads: Object.fromEntries(Object.entries(s.reads).filter(([k]) => k.endsWith(`:${userId}`) && tids.has(k.slice(0, k.lastIndexOf(':'))))),
    notifications: s.notifications.filter((n) => n.userId === userId).slice(0, 200),
  };
}
