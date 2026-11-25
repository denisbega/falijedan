import fs from 'node:fs';
import { config } from '../config.ts';
import type { StorageAdapter } from './schema.ts';
import { SqliteStorage } from './sqlite.ts';
import { PostgresStorage } from './postgres.ts';

/** DATABASE_URL postavljen → Postgres (Supabase); inače lokalni SQLite. */
export async function createStorage(): Promise<StorageAdapter> {
  if (!config.database.url) return new SqliteStorage(config.dataDir);
  if (config.database.url.includes('[YOUR-PASSWORD]') && !config.database.password)
    throw new Error('U DATABASE_URL je ostalo [YOUR-PASSWORD] — zamijeni ga lozinkom baze ili postavi DATABASE_PASSWORD u .env.');
  const pg = new PostgresStorage({
    url: config.database.url,
    password: config.database.password,
    schema: config.database.schema,
    ssl: config.database.ssl,
    ca: config.database.caFile ? fs.readFileSync(config.database.caFile, 'utf8') : undefined,
    poolMax: config.database.poolMax,
  });
  try {
    await pg.init();
  } catch (e) {
    await pg.close().catch(() => undefined);
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Ne mogu se spojiti na bazu (${pg.label}): ${msg}\n→ ${hint(msg, pg.host)}`);
  }
  return pg;
}

/** Savjet za najčešće greške pri spajanju na Supabase. */
function hint(msg: string, host: string): string {
  if (/password authentication failed/i.test(msg))
    return 'Pogrešna lozinka baze. Supabase → Project Settings → Database → Reset database password, pa je upiši u .env (DATABASE_PASSWORD).';
  if (/tenant or user not found/i.test(msg))
    return 'Pooler ne prepoznaje korisnika: korisničko ime mora biti "postgres.<project-ref>" — kopiraj cijeli URI iz Supabase → Connect → Session pooler.';
  if (/ENOTFOUND|ENETUNREACH|EHOSTUNREACH|EAI_AGAIN/i.test(msg) && /^db\..*supabase\.co/.test(host))
    return '"Direct connection" radi samo preko IPv6. Koristi Session pooler URI (Supabase → Connect → Session pooler).';
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg) && !host.includes('.'))
    return `Host "${host}" nije ispravan — lozinka vjerovatno sadrži @ # / ili %. Stavi je u DATABASE_PASSWORD, a u URL-u ostavi [YOUR-PASSWORD].`;
  if (/certificate/i.test(msg)) return 'Problem sa SSL certifikatom. Postavi DATABASE_SSL=require (ili DATABASE_SSL=verify + DATABASE_CA_FILE sa Supabase certifikatom).';
  if (/timeout|ETIMEDOUT/i.test(msg)) return 'Baza ne odgovara — provjeri internet vezu i da Supabase projekat nije pauziran (besplatni projekti se pauziraju nakon nedjelju dana neaktivnosti).';
  return 'Provjeri DATABASE_URL (host, port, korisnika i lozinku) u .env fajlu.';
}

export type { StorageAdapter } from './schema.ts';
