/**
 * Postgres baza — za Supabase (ili bilo koji Postgres). Aktivira se kad je postavljen DATABASE_URL.
 * Tabele se kreiraju automatski u zasebnoj šemi (podrazumijevano "falijedan"), koja NIJE izložena
 * Supabase Data API-ju; dodatno je uključen RLS bez polisa, pa im pristupa samo naš server.
 *
 * Radi i sa više instanci servera istovremeno (Vercel serverless funkcije): svaka izmjena ide pod
 * globalnim zaključavanjem (pg_advisory_xact_lock), a revizija u tabeli meta govori instancama
 * kad treba ponovo učitati stanje.
 */
import pg from 'pg';
import type { DB } from '../../src/lib/types.ts';
import { ORDER_BY, SPECS, assignRows, computeDiff, emptyState, fromRow, newEpoch, snapshotOf, type Kind, type Mutator, type Row, type Snapshot, type Spec, type StorageAdapter, type Value } from './schema.ts';

const pgType: Record<Kind, string> = { text: 'TEXT', int: 'INTEGER', real: 'DOUBLE PRECISION', bool: 'BOOLEAN', json: 'JSONB' };
/** Povećaj kad se promijeni struktura tabela (pokreće ponovno izvršavanje DDL-a). */
const DDL_VERSION = '2';

type Queryable = Pick<pg.PoolClient, 'query'>;

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
  private rev = 0;
  private epoch = '';
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
      idleTimeoutMillis: 20000,
      allowExitOnIdle: true,
    });
    this.pool.on('error', (e) => console.error('Postgres pool:', e.message));
  }

  get token() {
    return `${this.epoch}.${this.rev}`;
  }

  private t(table: string) {
    return `"${this.s}"."${table}"`;
  }

  /** Kreira šemu i tabele ako ne postoje (samo kad se promijeni DDL_VERSION — inače jedan brz upit). */
  async init() {
    try {
      const r = await this.pool.query(`SELECT value FROM ${this.t('meta')} WHERE key = 'ddl'`);
      if (r.rows[0]?.value === DDL_VERSION) return;
    } catch {
      /* šema još ne postoji */
    }
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
      `CREATE TABLE IF NOT EXISTS ${this.t('oauth_states')} (state TEXT PRIMARY KEY, provider TEXT NOT NULL, expires_at BIGINT NOT NULL)`,
      // RLS bez polisa: Supabase anon/authenticated uloge nemaju pristup; naš server (vlasnik tabela) ima.
      `DO $$ DECLARE r record; BEGIN
         FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = '${this.s}' AND c.relkind = 'r' AND NOT c.relrowsecurity LOOP
           EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', '${this.s}', r.relname);
         END LOOP;
       END $$`,
      `INSERT INTO ${this.t('meta')} (key, value) VALUES ('ddl', '${DDL_VERSION}') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
    const client = await this.pool.connect();
    try {
      // Zaključavanje: više instanci koje se pale istovremeno ne smiju paralelno kreirati iste objekte.
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('falijedan:init:${this.s}'))`);
      await client.query(ddl.join(';\n'));
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  private async readToken(q: Queryable): Promise<{ rev: number; epoch: string }> {
    const r = await q.query(`SELECT key, value FROM ${this.t('meta')} WHERE key IN ('rev', 'epoch')`);
    const m = Object.fromEntries((r.rows as { key: string; value: string }[]).map((x) => [x.key, x.value]));
    return { rev: Number(m.rev ?? 0), epoch: m.epoch ?? '' };
  }

  async revision(): Promise<string> {
    try {
      const { rev, epoch } = await this.readToken(this.pool);
      return `${epoch}.${rev}`;
    } catch (e) {
      // Šema je obrisana dok server radi (npr. "drop schema falijedan cascade" za čist početak) → napravi je ponovo
      if ((e as { code?: string }).code === '42P01' || (e as { code?: string }).code === '3F000') {
        await this.init();
        return 'reset';
      }
      throw e;
    }
  }

  /** Učitava cijelo stanje (uz reviziju) iz jednog konzistentnog snimka baze. */
  private async loadWith(q: Queryable): Promise<DB | null> {
    const metaRows = (await q.query(`SELECT key, value FROM ${this.t('meta')}`)).rows as { key: string; value: string }[];
    const meta = Object.fromEntries(metaRows.map((r) => [r.key, r.value]));
    this.rev = Number(meta.rev ?? 0);
    this.epoch = meta.epoch ?? '';
    const count = await q.query(`SELECT COUNT(*)::int AS n FROM ${this.t('users')}`);
    if (!count.rows[0].n) {
      this.prev = new Map();
      return null;
    }
    const db = emptyState(Number(meta.version ?? 0), Number(meta.seeded_at ?? Date.now()));
    for (const spec of SPECS) {
      const res = await q.query(`SELECT * FROM ${this.t(spec.table)}${ORDER_BY[spec.table] ?? ''}`);
      assignRows(db, spec, (res.rows as Row[]).map((r) => fromRow(spec, r)));
    }
    this.prev = snapshotOf(db);
    return db;
  }

  async load(): Promise<DB | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const db = await this.loadWith(client);
      await client.query('COMMIT');
      return db;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  private pgValues(spec: Spec, vals: Value[]): unknown[] {
    return vals.map((v, i) => (spec.cols[i].k === 'bool' ? v === 1 : v));
  }

  async mutate<T>(current: DB | null, fn: Mutator<T>) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Globalno zaključavanje izmjena — jedna po jedna, bez obzira na broj instanci servera.
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('falijedan:write:${this.s}'))`);
      const db = await this.readToken(client);
      // Ako je neka druga instanca u međuvremenu nešto upisala, radimo nad svježim stanjem iz baze.
      const base = current && db.rev === this.rev && db.epoch === this.epoch ? current : await this.loadWith(client);
      const { next, result } = fn(base);
      const diff = computeDiff(this.prev, next);
      if (diff.empty) {
        await client.query('COMMIT');
        return { next, result, changed: false };
      }
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
      const rev = this.rev + 1;
      const epoch = this.epoch || newEpoch();
      await client.query(
        `INSERT INTO ${this.t('meta')} (key, value) VALUES ('version', $1), ('seeded_at', $2), ('rev', $3), ('epoch', $4) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [String(next.version), String(next.seededAt), String(rev), epoch],
      );
      await client.query('COMMIT');
      this.prev = diff.next;
      this.rev = rev;
      this.epoch = epoch;
      return { next, result, changed: true };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
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
      await this.pool.query(`DELETE FROM ${this.t('oauth_states')} WHERE expires_at < $1`, [Date.now()]);
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

  oauthStates = {
    create: async (state: string, provider: string, expiresAt: number) => {
      await this.pool.query(`INSERT INTO ${this.t('oauth_states')} (state, provider, expires_at) VALUES ($1, $2, $3) ON CONFLICT (state) DO NOTHING`, [state, provider, expiresAt]);
    },
    take: async (state: string) => {
      const res = await this.pool.query(`DELETE FROM ${this.t('oauth_states')} WHERE state = $1 RETURNING provider, expires_at`, [state]);
      const row = res.rows[0] as { provider: string; expires_at: string } | undefined;
      return row && Number(row.expires_at) >= Date.now() ? row.provider : null;
    },
  };

  async close() {
    await this.pool.end();
  }
}
