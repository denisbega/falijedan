/**
 * Zajednička definicija tabela za SQLite i Postgres (Supabase) + računanje razlika (diff).
 * Nakon svake transakcije upisuju se samo izmijenjeni redovi.
 */
import type { DB } from '../../src/lib/types.ts';

export type Kind = 'text' | 'int' | 'real' | 'bool' | 'json';
export interface Col {
  f: string;
  c: string;
  k: Kind;
  /** null se čuva kao null u objektu (inače se polje izostavlja) */
  keepNull?: boolean;
}
export interface Index {
  name: string;
  on: string;
  unique?: boolean;
}
export interface Spec {
  table: string;
  key: Exclude<keyof DB, 'version' | 'seededAt' | 'currentUserId'>;
  pk: string[];
  cols: Col[];
  indexes?: Index[];
}
export type Value = string | number | null;
export type Row = Record<string, unknown>;

const col = (f: string, c: string, k: Kind = 'text', keepNull = false): Col => ({ f, c, k, keepNull });

export const SPECS: Spec[] = [
  {
    table: 'users',
    key: 'users',
    pk: ['id'],
    cols: [
      col('id', 'id'),
      col('firstName', 'first_name'),
      col('lastName', 'last_name'),
      col('email', 'email'),
      col('passwordHash', 'password_hash', 'text', true),
      col('avatar', 'avatar_url', 'text', true),
      col('city', 'city'),
      col('lat', 'lat', 'real'),
      col('lng', 'lng', 'real'),
      col('radiusKm', 'radius_km', 'int'),
      col('createdAt', 'created_at'),
      col('verified', 'verified', 'bool'),
      col('onboarded', 'onboarded', 'bool'),
      col('bio', 'bio'),
    ],
    indexes: [{ name: 'users_email', on: 'lower(email)', unique: true }],
  },
  {
    table: 'player_sports',
    key: 'playerSports',
    pk: ['user_id', 'sport'],
    cols: [col('userId', 'user_id'), col('sport', 'sport'), col('level', 'level'), col('positions', 'positions', 'json')],
  },
  {
    table: 'sessions',
    key: 'sessions',
    pk: ['id'],
    cols: [
      col('id', 'id'),
      col('organizerId', 'organizer_id'),
      col('sport', 'sport'),
      col('venueName', 'venue_name'),
      col('address', 'address'),
      col('city', 'city'),
      col('lat', 'lat', 'real'),
      col('lng', 'lng', 'real'),
      col('startsAt', 'starts_at'),
      col('durationMin', 'duration_min', 'int'),
      col('totalPlayers', 'total_players', 'int'),
      col('baseCount', 'base_count', 'int'),
      col('priceKM', 'price_km', 'real', true),
      col('level', 'level'),
      col('neededPositions', 'needed_positions', 'json'),
      col('status', 'status'),
      col('createdAt', 'created_at'),
      col('note', 'note'),
      col('seed', 'seed', 'bool'),
    ],
    indexes: [{ name: 'sessions_starts', on: 'starts_at' }],
  },
  {
    table: 'session_players',
    key: 'sessionPlayers',
    pk: ['session_id', 'user_id'],
    cols: [col('sessionId', 'session_id'), col('userId', 'user_id'), col('role', 'role'), col('status', 'status'), col('joinedAt', 'joined_at'), col('position', 'position')],
    indexes: [{ name: 'sp_user', on: 'user_id' }],
  },
  {
    table: 'ratings',
    key: 'ratings',
    pk: ['id'],
    cols: [
      col('id', 'id'),
      col('sessionId', 'session_id'),
      col('fromUserId', 'from_user_id'),
      col('toUserId', 'to_user_id'),
      col('fairPlay', 'fair_play', 'int'),
      col('teamwork', 'teamwork', 'int'),
      col('punctuality', 'punctuality', 'int'),
      col('skill', 'skill', 'int'),
      col('fitness', 'fitness', 'int'),
      col('comment', 'comment'),
      col('noShow', 'no_show', 'bool'),
      col('createdAt', 'created_at'),
      col('seed', 'seed', 'bool'),
    ],
    indexes: [
      { name: 'ratings_to', on: 'to_user_id' },
      { name: 'ratings_once', on: 'session_id, from_user_id, to_user_id', unique: true },
    ],
  },
  {
    table: 'threads',
    key: 'threads',
    pk: ['id'],
    cols: [col('id', 'id'), col('kind', 'kind'), col('sessionId', 'session_id'), col('memberIds', 'member_ids', 'json'), col('createdAt', 'created_at'), col('seed', 'seed', 'bool')],
  },
  {
    table: 'messages',
    key: 'messages',
    pk: ['id'],
    cols: [col('id', 'id'), col('threadId', 'thread_id'), col('fromUserId', 'from_user_id'), col('text', 'text'), col('createdAt', 'created_at'), col('sessionId', 'session_id'), col('seed', 'seed', 'bool')],
    indexes: [{ name: 'messages_thread', on: 'thread_id, created_at' }],
  },
  {
    table: 'notifications',
    key: 'notifications',
    pk: ['id'],
    cols: [
      col('id', 'id'),
      col('userId', 'user_id'),
      col('type', 'type'),
      col('title', 'title'),
      col('body', 'body'),
      col('link', 'link'),
      col('createdAt', 'created_at'),
      col('read', 'read', 'bool'),
      col('dedupeKey', 'dedupe_key'),
      col('seed', 'seed', 'bool'),
    ],
    indexes: [{ name: 'notifications_user', on: 'user_id, created_at' }],
  },
  {
    table: 'thread_reads',
    key: 'reads',
    pk: ['thread_id', 'user_id'],
    cols: [col('threadId', 'thread_id'), col('userId', 'user_id'), col('lastReadAt', 'last_read_at')],
  },
];

export const ORDER_BY: Record<string, string> = {
  messages: ' ORDER BY created_at',
  notifications: ' ORDER BY created_at DESC',
  sessions: ' ORDER BY starts_at',
};

export function emptyState(version: number, seededAt: number): DB {
  return { version, seededAt, currentUserId: null, users: [], playerSports: [], sessions: [], sessionPlayers: [], ratings: [], threads: [], messages: [], reads: {}, notifications: [] };
}

/** Vrijednosti reda u redoslijedu kolona (bool kao 0/1, json kao tekst). */
export function toValues(spec: Spec, row: Row): Value[] {
  return spec.cols.map((c) => {
    const v = row[c.f];
    if (v === undefined || v === null) return c.k === 'bool' ? 0 : null;
    if (c.k === 'bool') return v ? 1 : 0;
    if (c.k === 'json') return JSON.stringify(v);
    return v as string | number;
  });
}

export function fromRow(spec: Spec, r: Row): Row {
  const out: Row = {};
  for (const c of spec.cols) {
    const v = r[c.c];
    if (v === null || v === undefined) {
      if (c.keepNull) out[c.f] = null;
      continue;
    }
    if (c.k === 'bool') out[c.f] = v === true || v === 1 || v === '1' || v === 't';
    else if (c.k === 'json') out[c.f] = typeof v === 'string' ? JSON.parse(v) : v;
    else if (c.k === 'int' || c.k === 'real') out[c.f] = Number(v);
    else out[c.f] = String(v);
  }
  return out;
}

export function rowsOf(state: DB, spec: Spec): Row[] {
  if (spec.key === 'reads')
    return Object.entries(state.reads).map(([k, lastReadAt]) => {
      const i = k.lastIndexOf(':');
      return { threadId: k.slice(0, i), userId: k.slice(i + 1), lastReadAt };
    });
  return state[spec.key] as unknown as Row[];
}

/** Ugrađuje učitane redove u stanje. */
export function assignRows(db: DB, spec: Spec, rows: Row[]) {
  if (spec.key === 'reads') for (const r of rows) db.reads[`${r.threadId}:${r.userId}`] = String(r.lastReadAt);
  else (db[spec.key] as unknown as Row[]).push(...rows);
}

const SEP = '\u0001';
export const keyOf = (spec: Spec, vals: Value[]) => spec.pk.map((p) => vals[spec.cols.findIndex((c) => c.c === p)]).join(SEP);
export const splitKey = (key: string) => key.split(SEP);

export type Snapshot = Map<string, Map<string, string>>;
export interface Diff {
  upserts: Map<Spec, Value[][]>;
  deletes: Map<Spec, string[][]>;
  next: Snapshot;
  empty: boolean;
}

/** Poredi stanje sa zadnjim upisanim i vraća šta treba upisati/obrisati. */
export function computeDiff(prev: Snapshot, state: DB): Diff {
  const upserts = new Map<Spec, Value[][]>();
  const deletes = new Map<Spec, string[][]>();
  const next: Snapshot = new Map();
  let empty = true;
  for (const spec of SPECS) {
    const before = prev.get(spec.table) ?? new Map<string, string>();
    const after = new Map<string, string>();
    const ups: Value[][] = [];
    for (const r of rowsOf(state, spec)) {
      const vals = toValues(spec, r);
      const key = keyOf(spec, vals);
      const ser = JSON.stringify(vals);
      after.set(key, ser);
      if (before.get(key) !== ser) ups.push(vals);
    }
    const dels: string[][] = [];
    for (const key of before.keys()) if (!after.has(key)) dels.push(splitKey(key));
    if (ups.length) upserts.set(spec, ups);
    if (dels.length) deletes.set(spec, dels);
    if (ups.length || dels.length) empty = false;
    next.set(spec.table, after);
  }
  return { upserts, deletes, next, empty };
}

/** Snimak (za diff) iz učitanih redova. */
export function snapshotOf(state: DB): Snapshot {
  return computeDiff(new Map(), state).next;
}

/* ---------- Server-only podaci (sesije, OAuth identiteti) ---------- */
export interface AuthSessionRow {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  userAgent: string;
}

/**
 * Izmjena stanja: dobije svježe stanje iz baze (base; null ako je baza prazna) i vrati novo stanje.
 * Smije baciti grešku (npr. ApiError) — tada se ništa ne upisuje.
 */
export type Mutator<T> = (base: DB | null) => { next: DB; result: T };

export interface StorageAdapter {
  readonly kind: 'sqlite' | 'postgres';
  readonly label: string;
  /**
   * Verzija stanja koje je adapter zadnje učitao/upisao: "<epoch>.<rev>" — rev raste sa svakom izmjenom,
   * epoch je nasumični ID baze (mijenja se kad se baza napravi iznova). Koristi se i za ETag.
   */
  readonly token: string;
  /** Trenutna verzija u bazi (jedan brz upit) — ako se razlikuje od `token`, druga instanca je nešto promijenila. */
  revision(): Promise<string>;
  /** Cijelo stanje; null ako je baza prazna. */
  load(): Promise<DB | null>;
  /**
   * Izmjena pod globalnim zaključavanjem baze (više instanci servera / serverless funkcija):
   * provjeri reviziju, po potrebi učita svježe stanje, primijeni mutator, upiše razlike i poveća reviziju.
   * `current` je stanje koje pozivalac već ima u memoriji (koristi se ako je i dalje aktuelno).
   */
  mutate<T>(current: DB | null, fn: Mutator<T>): Promise<{ next: DB; result: T; changed: boolean }>;
  sessions: {
    create(row: AuthSessionRow): Promise<void>;
    find(tokenHash: string): Promise<{ userId: string; expiresAt: string } | null>;
    delete(tokenHash: string): Promise<void>;
    /** Odjava sa svih uređaja (brisanje naloga, preuzimanje naloga preko Google/Apple prijave). */
    deleteForUser(userId: string): Promise<void>;
    purgeExpired(nowIso: string): Promise<void>;
  };
  identities: {
    find(provider: string, subject: string): Promise<string | null>;
    upsert(provider: string, subject: string, userId: string): Promise<void>;
    deleteForUser(userId: string): Promise<void>;
  };
  /**
   * Brojač pokušaja u prozoru (atomski, u bazi — važi za sve instance servera).
   * Vraća broj pokušaja u trenutnom prozoru, uključujući ovaj.
   */
  rateLimit: {
    hit(key: string, windowMs: number): Promise<number>;
  };
  /**
   * Tokeni korisnika (u bazi samo SHA-256 heš): potvrda emaila, reset lozinke, povjerljivi uređaj.
   * take() je jednokratan (briše token); find() ne briše (uređaj).
   */
  tokens: {
    create(tokenHash: string, userId: string, purpose: TokenPurpose, expiresAt: number): Promise<void>;
    find(tokenHash: string, purpose: TokenPurpose): Promise<string | null>;
    take(tokenHash: string, purpose: TokenPurpose): Promise<string | null>;
    deleteForUser(userId: string, purpose?: TokenPurpose): Promise<void>;
  };
  /** Jednokratni OAuth "state" (u bazi, jer callback može stići na drugu instancu). */
  oauthStates: {
    create(state: string, provider: string, expiresAt: number): Promise<void>;
    /** Vraća provider i briše state; null ako ne postoji ili je istekao. */
    take(state: string): Promise<string | null>;
  };
  close(): Promise<void>;
}

export const newEpoch = () => Math.random().toString(36).slice(2, 10);

export type TokenPurpose = 'verify' | 'reset' | 'device';
