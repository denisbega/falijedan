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
  /**
   * Demo režim: početni podaci (Bijeljina), demo nalog (javna lozinka) i simulirani igrači.
   * Podrazumijevano uključen samo u razvoju; u produkciji (npm start, Vercel) mora se eksplicitno uključiti.
   */
  // Lokalno sa pravom (Postgres/Supabase) bazom demo je isključen — da lokalni server ne mijenja produkcijske podatke
  demo: bool(process.env.DEMO_MODE, !isProd && !process.env.DATABASE_URL),
  /** Iza vlastitog reverse proxyja (nginx, Render…): IP klijenta iz zadnjeg X-Forwarded-For hopa. */
  trustProxy: bool(process.env.TRUST_PROXY, !!process.env.RENDER),
  /**
   * Slanje emaila (potvrda naloga, reset lozinke) preko HTTP API-ja — postavi JEDAN ključ:
   * Brevo (besplatno 300/dan, radi i bez vlastite domene) ili Resend (besplatno 3000/mj, traži domenu).
   * Bez ključa: u razvoju se linkovi ispisuju u konzolu, a potvrda emaila se ne traži.
   */
  // trim: vrijednosti zalijepljene u Vercel često imaju razmak/novi red na kraju (Brevo tada odbija ključ/pošiljaoca)
  email: {
    brevoKey: (process.env.BREVO_API_KEY ?? '').trim(),
    resendKey: (process.env.RESEND_API_KEY ?? '').trim(),
    from: (process.env.EMAIL_FROM ?? '').trim(),
    fromName: (process.env.EMAIL_FROM_NAME ?? '').trim() || 'FaliJedan',
    /**
     * Najviše email obavještenja (pozivi, poruke, termini) dnevno za cijelu aplikaciju — ostatak dnevne kvote
     * servisa ostaje za potvrdu naloga i novu lozinku (Brevo besplatno: 300/dan). 0 = obavještenja se ne šalju.
     */
    notifyDailyLimit: /^\d+$/.test((process.env.NOTIFY_EMAIL_DAILY_LIMIT ?? '').trim()) ? Number(process.env.NOTIFY_EMAIL_DAILY_LIMIT!.trim()) : 200,
  },
  /**
   * Super admin nalozi (emailovi, odvojeni zarezom): vide, uređuju i brišu sve korisnike, vide sve termine,
   * a korisnici im pišu kao podršci. Prava se daju samo ovdje (ne u bazi) — niko ih ne može sam sebi dodijeliti.
   */
  adminEmails: new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  ),
  /** Cloudflare Turnstile (opciono): zaštita registracije od botova */
  turnstile: {
    siteKey: process.env.TURNSTILE_SITE_KEY ?? '',
    secretKey: process.env.TURNSTILE_SECRET_KEY ?? '',
  },
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
    /** CA certifikat (PEM sadržaj) — za DATABASE_SSL=verify na Vercelu, gdje nema fajlova */
    ca: (process.env.DATABASE_CA ?? '').replace(/\\n/g, '\n'),
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

/** Email je podešen (ključ + adresa pošiljaoca). */
export const emailEnabled = !!((config.email.brevoKey || config.email.resendKey) && config.email.from);
/** Potvrda emaila je obavezna za akcije koje utiču na druge (prijava na termin, termini, poruke, ocjene). */
export const requireVerification = bool(process.env.REQUIRE_EMAIL_VERIFICATION, emailEnabled);

export const providers = {
  google: !!(config.google.clientId && config.google.clientSecret),
  apple: !!(config.apple.clientId && config.apple.teamId && config.apple.keyId && config.apple.privateKey),
  demo: config.demo,
};
