/**
 * Autoritativno stanje servera. Sve izmjene idu kroz transact():
 * nacrt → pravila (src/lib/rules.ts) → upis razlika u bazu (SQLite ili Postgres/Supabase) → realtime.
 * Transakcije se izvršavaju jedna po jedna (red čekanja), pa nema trke za zadnje mjesto u terminu,
 * a stanje u memoriji se mijenja tek kad baza potvrdi upis.
 */
import type { DB, User } from '../src/lib/types.ts';
import { createSeed, DEMO_USER_ID, rebaseSeed, SEED_VERSION } from '../src/lib/seed.ts';
import { config } from './config.ts';
import { createStorage, type StorageAdapter } from './storage/index.ts';
import { emptyState } from './storage/schema.ts';
import { hashPassword } from './passwords.ts';

let storage: StorageAdapter;
let state: DB;
let rev = 0;
const bootId = Date.now().toString(36);
const listeners = new Set<(rev: number) => void>();
let queue: Promise<unknown> = Promise.resolve();

export async function initEngine() {
  storage = await createStorage();
  const loaded = await storage.load();
  if (loaded) {
    state = loaded;
  } else {
    state = config.demo ? createSeed(Date.now()) : emptyState(SEED_VERSION, Date.now());
    if (config.demo) {
      for (const u of state.users) u.passwordHash = null;
      const demo = state.users.find((u) => u.id === DEMO_USER_ID);
      if (demo) demo.passwordHash = await hashPassword('demo1234');
    }
    await storage.persist(state);
    console.log(config.demo ? '› Baza kreirana sa demo podacima (Bijeljina).' : '› Kreirana prazna baza.');
  }
  console.log(`› Baza: ${storage.label}`);
  if (config.demo) await refreshDemoData();
}

/** Izvršava posao u redu čekanja (jedan po jedan). */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const p = queue.then(job, job);
  queue = p.catch(() => undefined);
  return p;
}

async function commit(next: DB) {
  const changed = await storage.persist(next);
  state = next;
  if (changed) {
    rev++;
    listeners.forEach((l) => l(rev));
  }
  return changed;
}

/** Transakcija nad nacrtom stanja. Ako pravilo baci grešku ili upis ne uspije, stanje ostaje netaknuto. */
export function transact<T>(fn: (draft: DB) => T): Promise<T> {
  return enqueue(async () => {
    const draft = structuredClone(state);
    const result = fn(draft);
    await commit(draft);
    return result;
  });
}

/** Demo podaci se pomjeraju u sadašnjost da uvijek postoje svježi termini. */
export function refreshDemoData() {
  return enqueue(async () => {
    const next = rebaseSeed(state, Date.now());
    if (next !== state) await commit(structuredClone(next));
  });
}

export const read = (): DB => state;
export const onChange = (fn: (rev: number) => void) => listeners.add(fn);
export const etagFor = (userId: string) => `W/"${bootId}.${rev}.${userId}"`;
export const findUser = (id: string): User | undefined => state.users.find((u) => u.id === id);
export const findUserByEmail = (email: string): User | undefined => state.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
export const db = () => storage;
export const shutdownStorage = () => storage?.close();

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
