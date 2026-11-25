/**
 * Postgres baza — za Supabase (ili bilo koji Postgres). Aktivira se kad je postavljen DATABASE_URL.
 * Tabele se kreiraju automatski u zasebnoj šemi (podrazumijevano "falijedan"), koja NIJE izložena
 * Supabase Data API-ju; dodatno je uključen RLS bez polisa, pa im pristupa samo naš server.
 */
import pg from 'pg';
import type { DB } from '../../src/lib/types.ts';
import { ORDER_BY, SPECS, assignRows, computeDiff, emptyState, fromRow, snapshotOf, type Kind, type Row, type Snapshot, type Spec, type StorageAdapter, type Value } from './schema.ts';

const pgType: Record<Kind, string> = { text: 'TEXT', int: 'INTEGER', real: 'DOUBLE PRECISION', bool: 'BOOLEAN', json: 'JSONB' };

export interface PostgresOptions {
  url: string;
  password?: string;
  schema: string;
  ssl: 'disable' | 'require' | 'verify';
  ca?: string;
  poolMax: number;
}

export class PostgresStorage implements StorageAdapter {
  readonly kind = 'postgres' as const;
  readonly label: string;
  readonly host: string;
  private pool: pg.Pool;
  private prev: Snapshot = new Map();
  private s: string;

  constructor(opts: PostgresOptions) {
    if (!/^[a-z_][a-z0-9_]*$/.test(opts.schema)) throw new Error('DATABASE_SCHEMA smije sadržati samo mala slova, brojeve i _.');
    this.s = opts.schema;
    let connectionString = opts.url;
    let host = 'postgres';
    try {
      const u = new URL(opts.url);
      // SSL određuje isključivo DATABASE_SSL: "?sslmode=require" iz Supabase URL-a bi u pg-u značio punu
      // provjeru certifikata (verify-full) i pukao bi na Supabase pooleru.
      for (const k of [...u.searchParams.keys()]) if (/^(ssl|uselibpqcompat)/i.test(k)) u.searchParams.delete(k);
      if (opts.password) u.password = encodeURIComponent(opts.password);
      connectionString = u.toString();
      host = u.host;
    } catch {
      /* neispravan URL — pg će prijaviti grešku pri spajanju */
    }
    this.host = host;
    this.label = `Postgres (${host}, šema "${opts.schema}")`;
    this.pool = new pg.Pool({
      connectionString,
      max: opts.poolMax,
      ssl: opts.ssl === 'disable' ? false : opts.ssl === 'verify' ? { rejectUnauthorized: true, ca: opts.ca } : { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
    });
    this.pool.on('error', (e) => console.error('Postgres pool:', e.message));
  }

  private t(table: string) {
    return `"${this.s}"."${table}"`;
  }

  async init() {
    const ddl: string[] = [`CREATE SCHEMA IF NOT EXISTS "${this.s}"`];
    for (const spec of SPECS) {
      ddl.push(`CREATE TABLE IF NOT EXISTS ${this.t(spec.table)} (${spec.cols.map((c) => `"${c.c}" ${pgType[c.k]}`).join(', ')}, PRIMARY KEY (${spec.pk.map((p) => `"${p}"`).join(', ')}))`);
      for (const i of spec.indexes ?? []) ddl.push(`CREATE ${i.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS "${spec.table}_${i.name}" ON ${this.t(spec.table)} (${i.on})`);
    }
    ddl.push(
      `CREATE TABLE IF NOT EXISTS ${this.t('meta')} (key TEXT PRIMARY KEY, value TEXT)`,
      `CREATE TABLE IF NOT EXISTS ${this.t('auth_sessions')} (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, user_agent TEXT)`,
      `CREATE INDEX IF NOT EXISTS auth_sessions_user ON ${this.t('auth_sessions')} (user_id)`,
      `CREATE TABLE IF NOT EXISTS ${this.t('identities')} (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (provider, subject))`,
    );
    // RLS bez polisa: Supabase anon/authenticated uloge nemaju pristup; naš server (vlasnik tabela) ima.
    for (const table of [...SPECS.map((x) => x.table), 'meta', 'auth_sessions', 'identities']) ddl.push(`ALTER TABLE ${this.t(table)} ENABLE ROW LEVEL SECURITY`);
    const client = await this.pool.connect();
    try {
      for (const q of ddl) await client.query(q);
    } finally {
      client.release();
    }
  }

  async load(): Promise<DB | null> {
    const count = await this.pool.query(`SELECT COUNT(*)::int AS n FROM ${this.t('users')}`);
    if (!count.rows[0].n) return null;
    const metaRows = (await this.pool.query(`SELECT key, value FROM ${this.t('meta')}`)).rows as { key: string; value: string }[];
    const meta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
    const db = emptyState(Number(meta.version ?? 0), Number(meta.seeded_at ?? Date.now()));
    for (const spec of SPECS) {
      const res = await this.pool.query(`SELECT * FROM ${this.t(spec.table)}${ORDER_BY[spec.table] ?? ''}`);
      assignRows(db, spec, (res.rows as Row[]).map((r) => fromRow(spec, r)));
    }
    this.prev = snapshotOf(db);
    return db;
  }

  private pgValues(spec: Spec, vals: Value[]): unknown[] {
    return vals.map((v, i) => (spec.cols[i].k === 'bool' ? v === 1 : v));
  }

  async persist(state: DB): Promise<boolean> {
    const diff = computeDiff(this.prev, state);
    if (diff.empty) return false;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const [spec, rows] of diff.upserts) {
        const cols = spec.cols.map((c) => `"${c.c}"`);
        const updates = spec.cols.filter((c) => !spec.pk.includes(c.c)).map((c) => `"${c.c}" = EXCLUDED."${c.c}"`);
        const perChunk = Math.max(1, Math.floor(30000 / spec.cols.length));
        for (let i = 0; i < rows.length; i += perChunk) {
          const chunk = rows.slice(i, i + perChunk);
          const params: unknown[] = [];
          const tuples = chunk.map((vals) => {
            const start = params.length;
            params.push(...this.pgValues(spec, vals));
            return `(${vals.map((_, j) => `$${start + j + 1}`).join(', ')})`;
          });
          await client.query(
            `INSERT INTO ${this.t(spec.table)} (${cols.join(', ')}) VALUES ${tuples.join(', ')} ON CONFLICT (${spec.pk.map((p) => `"${p}"`).join(', ')}) DO ${updates.length ? `UPDATE SET ${updates.join(', ')}` : 'NOTHING'}`,
            params,
          );
        }
      }
      for (const [spec, keys] of diff.deletes)
        for (const key of keys) await client.query(`DELETE FROM ${this.t(spec.table)} WHERE ${spec.pk.map((p, i) => `"${p}" = $${i + 1}`).join(' AND ')}`, key);
      await client.query(`INSERT INTO ${this.t('meta')} (key, value) VALUES ('version', $1), ('seeded_at', $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [String(state.version), String(state.seededAt)]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
    this.prev = diff.next;
    return true;
  }

  sessions = {
    create: async (r: { tokenHash: string; userId: string; createdAt: string; expiresAt: string; userAgent: string }) => {
      await this.pool.query(`INSERT INTO ${this.t('auth_sessions')} (token_hash, user_id, created_at, expires_at, user_agent) VALUES ($1, $2, $3, $4, $5)`, [r.tokenHash, r.userId, r.createdAt, r.expiresAt, r.userAgent]);
    },
    find: async (tokenHash: string) => {
      const res = await this.pool.query(`SELECT user_id, expires_at FROM ${this.t('auth_sessions')} WHERE token_hash = $1`, [tokenHash]);
      const row = res.rows[0] as { user_id: string; expires_at: string } | undefined;
      return row ? { userId: row.user_id, expiresAt: row.expires_at } : null;
    },
    delete: async (tokenHash: string) => {
      await this.pool.query(`DELETE FROM ${this.t('auth_sessions')} WHERE token_hash = $1`, [tokenHash]);
    },
    purgeExpired: async (nowIso: string) => {
      await this.pool.query(`DELETE FROM ${this.t('auth_sessions')} WHERE expires_at < $1`, [nowIso]);
    },
  };

  identities = {
    find: async (provider: string, subject: string) => {
      const res = await this.pool.query(`SELECT user_id FROM ${this.t('identities')} WHERE provider = $1 AND subject = $2`, [provider, subject]);
      return (res.rows[0] as { user_id: string } | undefined)?.user_id ?? null;
    },
    upsert: async (provider: string, subject: string, userId: string) => {
      await this.pool.query(
        `INSERT INTO ${this.t('identities')} (provider, subject, user_id, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (provider, subject) DO UPDATE SET user_id = EXCLUDED.user_id`,
        [provider, subject, userId, new Date().toISOString()],
      );
    },
  };

  async close() {
    await this.pool.end();
  }
}
