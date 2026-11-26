// Vercel build (Build Output API v3): statični frontend iz dist/ + jedna serverless funkcija za /api/*.
// Pokreće se preko "npm run build:vercel" (vercel.json → buildCommand) nakon običnog "npm run build".
// Rezultat je .vercel/output/, koji Vercel koristi direktno.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import { isAdsenseClient, staticHeaders } from '../server/headers.ts';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, '.vercel', 'output');
const fnDir = path.join(out, 'functions', 'api.func');
const dist = path.join(root, 'dist');

if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist/ ne postoji — prvo "npm run build".');
fs.rmSync(out, { recursive: true, force: true });

// 1) Statični fajlovi
fs.cpSync(dist, path.join(out, 'static'), { recursive: true });

// 2) API funkcija: server/vercel.ts + sve zavisnosti (pg…) u jedan index.mjs
await build({
  configFile: false,
  root,
  logLevel: 'warn',
  plugins: [
    {
      // Na Vercelu se koristi samo Postgres — lokalni SQLite adapter (node:sqlite) se ne pakuje
      name: 'falijedan:no-sqlite',
      enforce: 'pre',
      resolveId(id) {
        if (/[\\/]sqlite\.ts$/.test(id) || id === './sqlite.ts') return '\0no-sqlite';
      },
      load(id) {
        if (id === '\0no-sqlite') return 'export class SqliteStorage { constructor() { throw new Error("SQLite nije dostupan na Vercelu — postavi DATABASE_URL."); } }';
      },
    },
  ],
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: path.join(root, 'server', 'vercel.ts'),
    outDir: fnDir,
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    sourcemap: false,
    copyPublicDir: false,
    rolldownOptions: {
      external: ['pg-native', 'cloudflare:sockets'],
      output: { format: 'es', entryFileNames: 'index.mjs', codeSplitting: false },
    },
  },
});

// 3) Region funkcije = region Supabase baze (svaki upit ide preko okeana ako nisu u istom regionu)
const AWS_TO_VERCEL = {
  'us-east-1': 'iad1', 'us-east-2': 'cle1', 'us-west-1': 'sfo1', 'us-west-2': 'pdx1', 'ca-central-1': 'yul1', 'sa-east-1': 'gru1',
  'eu-west-1': 'dub1', 'eu-west-2': 'lhr1', 'eu-west-3': 'cdg1', 'eu-central-1': 'fra1', 'eu-central-2': 'fra1', 'eu-north-1': 'arn1',
  'ap-south-1': 'bom1', 'ap-southeast-1': 'sin1', 'ap-southeast-2': 'syd1', 'ap-northeast-1': 'hnd1', 'ap-northeast-2': 'icn1',
  'ap-northeast-3': 'kix1', 'ap-east-1': 'hkg1', 'af-south-1': 'cpt1', 'me-central-1': 'dxb1',
};
const awsRegion = /\.?([a-z]{2}-[a-z]+-\d)\.pooler\.supabase\.com/.exec(process.env.DATABASE_URL ?? '')?.[1];
const region = process.env.FUNCTION_REGION || (awsRegion && AWS_TO_VERCEL[awsRegion]) || '';
if (!process.env.DATABASE_URL) console.warn('⚠ DATABASE_URL nije postavljen u Vercel Environment Variables — API neće raditi dok ga ne dodaš.');
else if (!region) console.warn('⚠ Ne mogu odrediti region baze iz DATABASE_URL — postavi FUNCTION_REGION (npr. fra1) da funkcija bude blizu baze.');

const major = Number(process.versions.node.split('.')[0]);
fs.writeFileSync(
  path.join(fnDir, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: `nodejs${[20, 22, 24].includes(major) ? major : 22}.x`,
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      supportsResponseStreaming: false,
      maxDuration: 30,
      ...(region ? { regions: [region] } : {}),
    },
    null,
    2,
  ),
);

// 4) Rute: /api/* → funkcija (originalna putanja u ?__p=), keš za statiku, SPA fallback na index.html
fs.writeFileSync(
  path.join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        // Sigurnosna zaglavlja + CSP za sve (isti izvor kao stalni server: server/headers.ts)
        { src: '^/(.*)$', headers: staticHeaders({ https: true, turnstile: !!process.env.TURNSTILE_SITE_KEY, ads: isAdsenseClient(process.env.ADSENSE_CLIENT) }), continue: true },
        { src: '^/assets/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
        { src: '^/(sw\.js|index\.html)?$', headers: { 'cache-control': 'no-cache' }, continue: true },
        { src: '^/api(?:/(.*))?$', dest: '/api?__p=$1' },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);

const size = (fs.statSync(path.join(fnDir, 'index.mjs')).size / 1024).toFixed(0);
console.log(`✓ Vercel output: .vercel/output (funkcija /api ${size} KB${region ? `, region ${region}` : ''})`);
