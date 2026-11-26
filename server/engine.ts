/**
 * Stanje aplikacije. Izvor istine je baza; ovdje je keš u memoriji koji se provjerava prema reviziji u bazi
 * (ensureFresh) — tako radi i sa više instanci servera (Vercel serverless funkcije).
 *
 * Sve izmjene idu kroz transact(): svježe stanje → pravila (src/lib/rules.ts) → upis razlika → realtime.
 * Izmjene se izvršavaju jedna po jedna (red čekanja u procesu + zaključavanje u bazi), pa nema trke
 * za zadnje mjesto u terminu, a keš se mijenja tek kad baza potvrdi upis.
 */
import type { AdminUser, DB, User } from '../src/lib/types.ts';
import { createSeed, DEMO_USER_ID, rebaseSeed, SEED_VERSION } from '../src/lib/seed.ts';
import { hasDemoData, purgeDemoData, roundCoord, runScheduledJobs } from '../src/lib/rules.ts';
import { config, requireVerification } from './config.ts';
import { createStorage, type StorageAdapter } from './storage/index.ts';
import { emptyState } from './storage/schema.ts';
import { hashPassword } from './passwords.ts';

let storage: StorageAdapter;
let state: DB = emptyState(SEED_VERSION, Date.now());
let initPromise: Promise<void> | null = null;
const listeners = new Set<(token: string) => void>();
let queue: Promise<unknown> = Promise.resolve();

/** Izvršava posao u redu čekanja (jedan po jedan unutar procesa). */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const p = queue.then(job, job);
  queue = p.catch(() => undefined);
  return p;
}

function setState(next: DB, changed: boolean) {
  state = next;
  if (changed) listeners.forEach((l) => l(storage.token));
}

async function buildSeed(): Promise<DB> {
  if (!config.demo) return emptyState(SEED_VERSION, Date.now());
  const seed = createSeed(Date.now());
  for (const u of seed.users) u.passwordHash = null;
  const demo = seed.users.find((u) => u.id === DEMO_USER_ID);
  if (demo) demo.passwordHash = await hashPassword('demo1234');
  return seed;
}

/** Učitava stanje iz baze; ako je baza prazna, kreira početne podatke (pod zaključavanjem — samo jedna instanca). */
async function reload() {
  const loaded = await storage.load();
  if (loaded) return setState(loaded, true);
  const seed = await buildSeed();
  const out = await storage.mutate(null, (base) => (base ? { next: base, result: false } : { next: seed, result: true }));
  setState(out.next, true);
  if (out.result && out.changed) console.log(config.demo ? '› Baza kreirana sa demo podacima (Bijeljina).' : '› Kreirana prazna baza.');
}

export function initEngine(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      storage = await createStorage();
      await enqueue(reload);
      console.log(`› Baza: ${storage.label}`);
      if (config.demo) await refreshDemoData();
      else if (hasDemoData(state)) {
        // Prava aplikacija (DEMO_MODE isključen): demo korisnici i njihovi podaci se uklanjaju
        const removed = await transact((d) => purgeDemoData(d));
        console.log(`› Demo podaci uklonjeni (${removed.users} demo korisnika, ${removed.sessions} termina).`);
      }
    })();
    // Serverless: ako start ne uspije (npr. baza nedostupna), sljedeći zahtjev pokušava ponovo
    initPromise.catch(() => {
      initPromise = null;
    });
  }
  return initPromise;
}

let freshInflight: Promise<void> | null = null;
/** Provjeri da li je druga instanca nešto promijenila (jedan brz upit) i po potrebi učitaj svježe stanje. */
export function ensureFresh(): Promise<void> {
  freshInflight ??= enqueue(async () => {
    if ((await storage.revision()) !== storage.token) await reload();
  }).finally(() => {
    freshInflight = null;
  });
  return freshInflight;
}

/** Izmjena pod zaključavanjem. Ako pravilo baci grešku ili upis ne uspije, ništa se ne mijenja. */
export function transact<T>(fn: (draft: DB) => T): Promise<T> {
  return enqueue(async () => {
    const out = await storage.mutate(state, (base) => {
      // Druga instanca je u međuvremenu nešto upisala → radimo nad svježim stanjem iz baze
      if (base && base !== state) setState(base, true);
      // base === null → baza je prazna (npr. upravo obrisana); nikad ne vraćamo stari keš u bazu
      const draft = structuredClone(base ?? emptyState(SEED_VERSION, Date.now()));
      return { next: draft, result: fn(draft) };
    });
    setState(out.next, out.changed);
    return out.result;
  });
}

/** Demo podaci se pomjeraju u sadašnjost da uvijek postoje svježi termini. */
export function refreshDemoData() {
  return enqueue(async () => {
    const out = await storage.mutate(state, (base) => {
      if (base && base !== state) setState(base, true);
      const b = base ?? emptyState(SEED_VERSION, Date.now());
      const next = rebaseSeed(b, Date.now());
      return { next: next === b ? b : structuredClone(next), result: null };
    });
    setState(out.next, out.changed);
  });
}

/** Podsjetnici (2 h prije termina) i pozivi na ocjenjivanje — idempotentno, smije se pozivati često. */
export const runJobs = () => transact((d) => runScheduledJobs(d, Date.now()));

export const read = (): DB => state;
export const onChange = (fn: (token: string) => void) => listeners.add(fn);
export const etagFor = (userId: string) => `W/"${storage.token}.${userId}"`;
export const findUser = (id: string): User | undefined => state.users.find((u) => u.id === id);
export const findUserByEmail = (email: string): User | undefined => state.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
export const db = () => storage;
export const shutdownStorage = () => storage?.close();

/**
 * Administrator: email je u ADMIN_EMAILS i nalog je potvrđen — inače bi neko mogao registrovati
 * admin email (dok ga vlasnik još nije zauzeo) i dobiti prava bez pristupa tom inboxu.
 */
export const isAdmin = (u: User | undefined): boolean => !!u?.email && config.adminEmails.has(u.email.toLowerCase()) && (u.verified || !requireVerification);

/** Svi aktivni korisnici sa emailom i brojem termina — samo za admin panel. */
export function adminUsers(s: DB = state): AdminUser[] {
  const organized = new Map<string, number>();
  const joined = new Map<string, number>();
  for (const x of s.sessions) organized.set(x.organizerId, (organized.get(x.organizerId) ?? 0) + 1);
  for (const p of s.sessionPlayers) if (p.role === 'player' && p.status === 'confirmed') joined.set(p.userId, (joined.get(p.userId) ?? 0) + 1);
  return s.users
    .filter((u) => !!u.email)
    .map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email!,
      avatar: u.avatar,
      city: u.city,
      bio: u.bio,
      createdAt: u.createdAt,
      verified: u.verified,
      onboarded: u.onboarded,
      hasPassword: !!u.passwordHash,
      admin: isAdmin(u),
      organized: organized.get(u.id) ?? 0,
      joined: joined.get(u.id) ?? 0,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const MESSAGES_PER_THREAD = 300;

/**
 * Podaci koje korisnik smije vidjeti:
 * - bez tuđih emailova, lozinki/heševa, poruka iz tuđih razgovora i tuđih obavještenja;
 * - tuđa lokacija samo približno (~1 km), nikad precizni GPS;
 * - ko je koga ocijenio vidi se samo za javne recenzije (ocjena sa komentarom) i za vlastite ocjene —
 *   numeričke ocjene i prijave izostanka su anonimne (bez osvete za lošu ocjenu).
 */
export function snapshotFor(userId: string): DB {
  const s = state;
  const threads = s.threads.filter((t) => t.memberIds.includes(userId));
  const tids = new Set(threads.map((t) => t.id));
  const perThread = new Map<string, number>();
  const messages = s.messages
    .filter((m) => tids.has(m.threadId))
    .reverse()
    .filter((m) => {
      const c = (perThread.get(m.threadId) ?? 0) + 1;
      perThread.set(m.threadId, c);
      return c <= MESSAGES_PER_THREAD;
    })
    .reverse();
  return {
    version: s.version,
    seededAt: s.seededAt,
    currentUserId: userId,
    users: s.users.map((u) => {
      const { passwordHash, email, ...rest } = u;
      const admin = isAdmin(u) || undefined;
      if (u.id === userId) return { ...rest, email, admin, hasPassword: !!passwordHash, needsVerification: requireVerification && !u.verified };
      const pub = { ...rest, admin, lat: roundCoord(rest.lat), lng: roundCoord(rest.lng) };
      return email ? pub : { ...pub, bio: undefined, deleted: true };
    }),
    playerSports: s.playerSports,
    sessions: s.sessions,
    sessionPlayers: s.sessionPlayers,
    ratings: s.ratings.map((r) => (r.fromUserId === userId || (r.comment && !r.noShow) ? r : { ...r, fromUserId: '' })),
    threads,
    messages,
    reads: Object.fromEntries(Object.entries(s.reads).filter(([k]) => k.endsWith(`:${userId}`) && tids.has(k.slice(0, k.lastIndexOf(':'))))),
    notifications: s.notifications.filter((n) => n.userId === userId).slice(0, 200),
  };
}
