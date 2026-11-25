import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

// Učitaj .env ako postoji (Node 24 ima ugrađen parser)
try {
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  /* .env nije obavezan */
}

const bool = (v: string | undefined, def: boolean) => (v == null || v === '' ? def : /^(1|true|yes|on)$/i.test(v));
/** Serverless (Vercel): nema stalnog procesa — stanje se provjerava u bazi na svakom zahtjevu, realtime je polling. */
const serverless = bool(process.env.SERVERLESS, !!process.env.VERCEL);
const isProd = process.env.NODE_ENV === 'production' || serverless || !!process.env.RENDER;
const port = Number(process.env.PORT ?? 8787);

// Sva vremena u porukama/obavještenjima računamo u lokalnoj zoni korisnika (BiH)
process.env.TZ = process.env.APP_TZ ?? 'Europe/Sarajevo';

// Javna adresa: PUBLIC_URL, ili adresa koju hosting sam postavi (Vercel, Render, Railway), ili localhost.
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const publicUrl = (
  process.env.PUBLIC_URL ||
  (vercelHost ? `https://${vercelHost}` : '') ||
  process.env.RENDER_EXTERNAL_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '') ||
  (isProd ? `http://localhost:${port}` : 'http://localhost:5173')
).replace(/\/$/, '');

export const config = {
  root,
  isProd,
  serverless,
  port,
  publicUrl,
  dataDir: process.env.DATA_DIR ?? path.join(root, 'server', 'data'),
  distDir: path.join(root, 'dist'),
  /** Demo režim: početni podaci (Bijeljina), demo nalog i simulirani igrači. Za pravo lansiranje: DEMO_MODE=false */
  demo: bool(process.env.DEMO_MODE, true),
  cookieSecure: publicUrl.startsWith('https://'),
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
  /** Postgres / Supabase. Ako DATABASE_URL nije postavljen, koristi se lokalni SQLite (dataDir). */
  database: {
    url: (process.env.DATABASE_URL ?? '').trim(),
    /** Lozinka posebno (opciono) — tada u URL-u može ostati [YOUR-PASSWORD]; specijalni znakovi (@ # / %) ne lome URL. */
    password: process.env.DATABASE_PASSWORD ?? '',
    schema: process.env.DATABASE_SCHEMA ?? 'falijedan',
    ssl: (['disable', 'require', 'verify'].includes(process.env.DATABASE_SSL ?? '')
      ? process.env.DATABASE_SSL
      : /[?&]sslmode=disable\b/.test(process.env.DATABASE_URL ?? '')
        ? 'disable'
        : 'require') as 'disable' | 'require' | 'verify',
    caFile: process.env.DATABASE_CA_FILE ?? '',
    poolMax: Number(process.env.DATABASE_POOL_MAX ?? (serverless ? 3 : 5)),
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID ?? '', // Services ID, npr. app.falijedan.web
    teamId: process.env.APPLE_TEAM_ID ?? '',
    keyId: process.env.APPLE_KEY_ID ?? '',
    privateKey: (process.env.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  },
};

export const providers = {
  google: !!(config.google.clientId && config.google.clientSecret),
  apple: !!(config.apple.clientId && config.apple.teamId && config.apple.keyId && config.apple.privateKey),
  demo: config.demo,
};
