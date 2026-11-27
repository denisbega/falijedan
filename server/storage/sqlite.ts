/** Lokalna baza (node:sqlite) — podrazumijevano kad DATABASE_URL nije postavljen. Jedan proces = jedini pisac. */
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../../src/lib/types.ts';
import { ORDER_BY, SPECS, assignRows, computeDiff, emptyState, fromRow, newEpoch, snapshotOf, type Kind, type Mutator, type Row, type Snapshot, type StorageAdapter, type TokenPurpose } from './schema.ts';

const sqlType: Record<Kind, string> = { text: 'TEXT', int: 'INTEGER', real: 'REAL', bool: 'INTEGER', json: 'TEXT' };

export class SqliteStorage implements StorageAdapter {
  readonly kind = 'sqlite' as const;
  readonly label: string;
  private rev = 0;
  private epoch = '';
  private db: DatabaseSync;
  private prev: Snapshot = new Map();
  private stmts = new Map<string, { upsert: StatementSync; del: StatementSync }>();

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, 'falijedan.db');
    this.label = `SQLite (${file})`;
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    for (const s of SPECS) {
      this.db.exec(`CREATE TABLE IF NOT EXISTS ${s.table} (${s.cols.map((c) => `${c.c} ${sqlType[c.k]}`).join(', ')}, PRIMARY KEY (${s.pk.join(', ')}))`);
      // Kolone dodate nakon što je tabela napravljena (CREATE TABLE IF NOT EXISTS ih ne dodaje)
      const existing = new Set((this.db.prepare(`PRAGMA table_info(${s.table})`).all() as { name: string }[]).map((r) => r.name));
      for (const c of s.cols) if (!existing.has(c.c)) this.db.exec(`ALTER TABLE ${s.table} ADD COLUMN ${c.c} ${sqlType[c.k]}`);
      for (const i of s.indexes ?? []) this.db.exec(`CREATE ${i.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${i.name} ON ${s.table} (${i.on})`);
      const names = s.cols.map((c) => c.c);
      this.stmts.set(s.table, {
        upsert: this.db.prepare(`INSERT OR REPLACE INTO ${s.table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`),
        del: this.db.prepare(`DELETE FROM ${s.table} WHERE ${s.pk.map((p) => `${p} = ?`).join(' AND ')}`),
      });
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, user_agent TEXT);
      CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions (user_id);
      CREATE TABLE IF NOT EXISTS identities (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (provider, subject));
      CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, provider TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS user_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, purpose TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS user_tokens_user ON user_tokens (user_id, purpose);
    `);
  }

  private meta(): Record<string, string> {
    return Object.fromEntries((this.db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
  }

  get token() {
    return `${this.epoch}.${this.rev}`;
  }

  async revision() {
    return this.token;
  }

  async load(): Promise<DB | null> {
    const { n } = this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    const meta = this.meta();
    this.rev = Number(meta.rev ?? 0);
    this.epoch = meta.epoch ?? '';
    if (!n) {
      this.prev = new Map();
      return null;
    }
    const db = emptyState(Number(meta.version ?? 0), Number(meta.seeded_at ?? Date.now()));
    for (const spec of SPECS) {
      const rows = (this.db.prepare(`SELECT * FROM ${spec.table}${ORDER_BY[spec.table] ?? ''}`).all() as Row[]).map((r) => fromRow(spec, r));
      assignRows(db, spec, rows);
    }
    this.prev = snapshotOf(db);
    return db;
  }

  async mutate<T>(current: DB | null, fn: Mutator<T>) {
    // Jedan proces je jedini pisac, pa je stanje iz memorije uvijek aktuelno.
    const base = current ?? (await this.load());
    const { next, result } = fn(base);
    const diff = computeDiff(this.prev, next);
    if (diff.empty) return { next, result, changed: false };
    const rev = this.rev + 1;
    const epoch = this.epoch || newEpoch();
    this.db.exec('BEGIN');
    try {
      for (const [spec, rows] of diff.upserts) for (const vals of rows) this.stmts.get(spec.table)!.upsert.run(...vals);
      for (const [spec, keys] of diff.deletes) for (const key of keys) this.stmts.get(spec.table)!.del.run(...key);
      const meta = this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
      meta.run('version', String(next.version));
      meta.run('seeded_at', String(next.seededAt));
      meta.run('rev', String(rev));
      meta.run('epoch', epoch);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    this.prev = diff.next;
    this.rev = rev;
    this.epoch = epoch;
    return { next, result, changed: true };
  }

  sessions = {
    create: async (r: { tokenHash: string; userId: string; createdAt: string; expiresAt: string; userAgent: string }) => {
      this.db.prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)').run(r.tokenHash, r.userId, r.createdAt, r.expiresAt, r.userAgent);
    },
    find: async (tokenHash: string) => {
      const row = this.db.prepare('SELECT user_id, expires_at FROM auth_sessions WHERE token_hash = ?').get(tokenHash) as { user_id: string; expires_at: string } | undefined;
      return row ? { userId: row.user_id, expiresAt: row.expires_at } : null;
    },
    delete: async (tokenHash: string) => {
      this.db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash);
    },
    deleteForUser: async (userId: string) => {
      this.db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
    },
    purgeExpired: async (nowIso: string) => {
      this.db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(nowIso);
      this.db.prepare('DELETE FROM oauth_states WHERE expires_at < ?').run(Date.now());
      this.db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').run(Date.now());
      this.db.prepare('DELETE FROM user_tokens WHERE expires_at < ?').run(Date.now());
    },
  };

  identities = {
    find: async (provider: string, subject: string) => {
      const row = this.db.prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?').get(provider, subject) as { user_id: string } | undefined;
      return row?.user_id ?? null;
    },
    upsert: async (provider: string, subject: string, userId: string) => {
      this.db.prepare('INSERT OR REPLACE INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)').run(provider, subject, userId, new Date().toISOString());
    },
    deleteForUser: async (userId: string) => {
      this.db.prepare('DELETE FROM identities WHERE user_id = ?').run(userId);
    },
  };

  rateLimit = {
    hit: async (key: string, windowMs: number) => {
      const now = Date.now();
      const row = this.db
        .prepare(
          `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
           ON CONFLICT (key) DO UPDATE SET
             count = CASE WHEN rate_limits.reset_at < ? THEN 1 ELSE rate_limits.count + 1 END,
             reset_at = CASE WHEN rate_limits.reset_at < ? THEN excluded.reset_at ELSE rate_limits.reset_at END
           RETURNING count`,
        )
        .get(key, now + windowMs, now, now) as { count: number };
      return row.count;
    },
  };

  oauthStates = {
    create: async (state: string, provider: string, expiresAt: number) => {
      this.db.prepare('INSERT OR REPLACE INTO oauth_states (state, provider, expires_at) VALUES (?, ?, ?)').run(state, provider, expiresAt);
    },
    take: async (state: string) => {
      const row = this.db.prepare('DELETE FROM oauth_states WHERE state = ? RETURNING provider, expires_at').get(state) as { provider: string; expires_at: number } | undefined;
      return row && row.expires_at >= Date.now() ? row.provider : null;
    },
  };

  tokens = {
    create: async (tokenHash: string, userId: string, purpose: TokenPurpose, expiresAt: number) => {
      this.db.prepare('INSERT OR REPLACE INTO user_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)').run(tokenHash, userId, purpose, expiresAt);
    },
    find: async (tokenHash: string, purpose: TokenPurpose) => {
      const row = this.db.prepare('SELECT user_id FROM user_tokens WHERE token_hash = ? AND purpose = ? AND expires_at >= ?').get(tokenHash, purpose, Date.now()) as { user_id: string } | undefined;
      return row?.user_id ?? null;
    },
    take: async (tokenHash: string, purpose: TokenPurpose) => {
      const row = this.db.prepare('DELETE FROM user_tokens WHERE token_hash = ? AND purpose = ? RETURNING user_id, expires_at').get(tokenHash, purpose) as { user_id: string; expires_at: number } | undefined;
      return row && row.expires_at >= Date.now() ? row.user_id : null;
    },
    deleteForUser: async (userId: string, purpose?: TokenPurpose) => {
      if (purpose) this.db.prepare('DELETE FROM user_tokens WHERE user_id = ? AND purpose = ?').run(userId, purpose);
      else this.db.prepare('DELETE FROM user_tokens WHERE user_id = ?').run(userId);
    },
  };

  async close() {
    this.db.close();
  }
}
