/** Lokalna baza (node:sqlite) — podrazumijevano kad DATABASE_URL nije postavljen. */
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../../src/lib/types.ts';
import { ORDER_BY, SPECS, assignRows, computeDiff, emptyState, fromRow, snapshotOf, type Kind, type Row, type Snapshot, type StorageAdapter } from './schema.ts';

const sqlType: Record<Kind, string> = { text: 'TEXT', int: 'INTEGER', real: 'REAL', bool: 'INTEGER', json: 'TEXT' };

export class SqliteStorage implements StorageAdapter {
  readonly kind = 'sqlite' as const;
  readonly label: string;
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
    `);
  }

  async load(): Promise<DB | null> {
    const { n } = this.db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    if (!n) return null;
    const meta = Object.fromEntries((this.db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
    const db = emptyState(Number(meta.version ?? 0), Number(meta.seeded_at ?? Date.now()));
    for (const spec of SPECS) {
      const rows = (this.db.prepare(`SELECT * FROM ${spec.table}${ORDER_BY[spec.table] ?? ''}`).all() as Row[]).map((r) => fromRow(spec, r));
      assignRows(db, spec, rows);
    }
    this.prev = snapshotOf(db);
    return db;
  }

  async persist(state: DB): Promise<boolean> {
    const diff = computeDiff(this.prev, state);
    if (diff.empty) return false;
    this.db.exec('BEGIN');
    try {
      for (const [spec, rows] of diff.upserts) for (const vals of rows) this.stmts.get(spec.table)!.upsert.run(...vals);
      for (const [spec, keys] of diff.deletes) for (const key of keys) this.stmts.get(spec.table)!.del.run(...key);
      const meta = this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
      meta.run('version', String(state.version));
      meta.run('seeded_at', String(state.seededAt));
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    this.prev = diff.next;
    return true;
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
    purgeExpired: async (nowIso: string) => {
      this.db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(nowIso);
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
  };

  async close() {
    this.db.close();
  }
}
