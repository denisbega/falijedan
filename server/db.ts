/**
 * SQLite sloj (node:sqlite, bez dodatnih zavisnosti).
 * Relacione tabele odgovaraju modelu iz src/lib/types.ts. Nakon svake transakcije
 * upisuju se samo izmijenjeni redovi (diff), unutar jedne SQL transakcije.
 */
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../src/lib/types.ts';

type Kind = 'text' | 'int' | 'real' | 'bool' | 'json';
interface Col {
  f: string;
  c: string;
  k: Kind;
  /** null se čuva kao null u objektu (inače se polje izostavlja) */
  keepNull?: boolean;
}
interface Spec {
  table: string;
  key: Exclude<keyof DB, 'version' | 'seededAt' | 'currentUserId'>;
  pk: string[];
  cols: Col[];
  indexes?: string[];
}

const col = (f: string, c: string, k: Kind = 'text', keepNull = false): Col => ({ f, c, k, keepNull });

const SPECS: Spec[] = [
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
    indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users (lower(email))'],
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
    indexes: ['CREATE INDEX IF NOT EXISTS sessions_starts ON sessions (starts_at)'],
  },
  {
    table: 'session_players',
    key: 'sessionPlayers',
    pk: ['session_id', 'user_id'],
    cols: [col('sessionId', 'session_id'), col('userId', 'user_id'), col('role', 'role'), col('status', 'status'), col('joinedAt', 'joined_at'), col('position', 'position')],
    indexes: ['CREATE INDEX IF NOT EXISTS sp_user ON session_players (user_id)'],
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
    indexes: ['CREATE INDEX IF NOT EXISTS ratings_to ON ratings (to_user_id)', 'CREATE UNIQUE INDEX IF NOT EXISTS ratings_once ON ratings (session_id, from_user_id, to_user_id)'],
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
    indexes: ['CREATE INDEX IF NOT EXISTS messages_thread ON messages (thread_id, created_at)'],
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
    indexes: ['CREATE INDEX IF NOT EXISTS notifications_user ON notifications (user_id, created_at)'],
  },
];

const READS_SPEC: Spec = {
  table: 'thread_reads',
  key: 'reads',
  pk: ['thread_id', 'user_id'],
  cols: [col('threadId', 'thread_id'), col('userId', 'user_id'), col('lastReadAt', 'last_read_at')],
};

const sqlType: Record<Kind, string> = { text: 'TEXT', int: 'INTEGER', real: 'REAL', bool: 'INTEGER', json: 'TEXT' };
type Row = Record<string, unknown>;

function toValues(spec: Spec, row: Row): (string | number | null)[] {
  return spec.cols.map((c) => {
    const v = row[c.f];
    if (v === undefined || v === null) return c.k === 'bool' ? 0 : null;
    if (c.k === 'bool') return v ? 1 : 0;
    if (c.k === 'json') return JSON.stringify(v);
    return v as string | number;
  });
}
function fromRow(spec: Spec, r: Row): Row {
  const out: Row = {};
  for (const c of spec.cols) {
    const v = r[c.c];
    if (v === null || v === undefined) {
      if (c.keepNull) out[c.f] = null;
      continue;
    }
    out[c.f] = c.k === 'bool' ? !!v : c.k === 'json' ? JSON.parse(String(v)) : c.k === 'int' || c.k === 'real' ? Number(v) : String(v);
  }
  return out;
}

function rowsOf(state: DB, spec: Spec): Row[] {
  if (spec.key === 'reads')
    return Object.entries(state.reads).map(([k, lastReadAt]) => {
      const i = k.lastIndexOf(':');
      return { threadId: k.slice(0, i), userId: k.slice(i + 1), lastReadAt };
    });
  return state[spec.key] as unknown as Row[];
}

export class Storage {
  readonly sql: DatabaseSync;
  private prev = new Map<string, Map<string, string>>();
  private stmts = new Map<string, { upsert: StatementSync; del: StatementSync }>();
  private readonly all = [...SPECS, READS_SPEC];

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.sql = new DatabaseSync(path.join(dataDir, 'falijedan.db'));
    this.sql.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = OFF;');
    for (const s of this.all) {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS ${s.table} (${s.cols.map((c) => `${c.c} ${sqlType[c.k]}`).join(', ')}, PRIMARY KEY (${s.pk.join(', ')}))`);
      for (const idx of s.indexes ?? []) this.sql.exec(idx);
      const names = s.cols.map((c) => c.c);
      this.stmts.set(s.table, {
        upsert: this.sql.prepare(`INSERT OR REPLACE INTO ${s.table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`),
        del: this.sql.prepare(`DELETE FROM ${s.table} WHERE ${s.pk.map((p) => `${p} = ?`).join(' AND ')}`),
      });
    }
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, user_agent TEXT);
      CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions (user_id);
      CREATE TABLE IF NOT EXISTS identities (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (provider, subject));
    `);
  }

  private keyOf(spec: Spec, vals: (string | number | null)[]) {
    return spec.pk.map((p) => vals[spec.cols.findIndex((c) => c.c === p)]).join('\u0001');
  }

  /** Učitava cijelo stanje; null ako je baza prazna. */
  load(): DB | null {
    const count = this.sql.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    if (!count.n) return null;
    const meta = Object.fromEntries((this.sql.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
    const db: DB = {
      version: Number(meta.version ?? 0),
      seededAt: Number(meta.seeded_at ?? Date.now()),
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
    for (const spec of this.all) {
      const order = spec.table === 'messages' ? ' ORDER BY created_at' : spec.table === 'notifications' ? ' ORDER BY created_at DESC' : spec.table === 'sessions' ? ' ORDER BY starts_at' : '';
      const rows = (this.sql.prepare(`SELECT * FROM ${spec.table}${order}`).all() as Row[]).map((r) => fromRow(spec, r));
      const map = new Map<string, string>();
      for (const r of rows) {
        const vals = toValues(spec, r);
        map.set(this.keyOf(spec, vals), JSON.stringify(vals));
      }
      this.prev.set(spec.table, map);
      if (spec.key === 'reads') for (const r of rows) db.reads[`${r.threadId}:${r.userId}`] = String(r.lastReadAt);
      else (db[spec.key] as unknown as Row[]).push(...rows);
    }
    return db;
  }

  /** Upisuje samo razlike u odnosu na prethodno stanje. Vraća true ako se nešto promijenilo. */
  persist(state: DB): boolean {
    const nextMaps = new Map<string, Map<string, string>>();
    const ops: (() => void)[] = [];
    for (const spec of this.all) {
      const prev = this.prev.get(spec.table) ?? new Map<string, string>();
      const next = new Map<string, string>();
      const { upsert, del } = this.stmts.get(spec.table)!;
      for (const r of rowsOf(state, spec)) {
        const vals = toValues(spec, r);
        const key = this.keyOf(spec, vals);
        const ser = JSON.stringify(vals);
        next.set(key, ser);
        if (prev.get(key) !== ser) ops.push(() => upsert.run(...vals));
      }
      for (const key of prev.keys()) if (!next.has(key)) ops.push(() => del.run(...key.split('\u0001')));
      nextMaps.set(spec.table, next);
    }
    if (!ops.length) return false;
    this.sql.exec('BEGIN');
    try {
      for (const op of ops) op();
      const meta = this.sql.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
      meta.run('version', String(state.version));
      meta.run('seeded_at', String(state.seededAt));
      this.sql.exec('COMMIT');
    } catch (e) {
      this.sql.exec('ROLLBACK');
      throw e;
    }
    this.prev = nextMaps;
    return true;
  }
}
