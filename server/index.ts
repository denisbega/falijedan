/**
 * FaliJedan server — API + realtime + (u produkciji) statični frontend iz dist/.
 * Pokretanje: npm run dev (zajedno sa Vite-om) ili npm start (produkcija).
 */
import { config, providers } from './config.ts';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { initEngine, onChange, refreshDemoData, shutdownStorage, transact } from './engine.ts';
import { handleApi } from './routes.ts';
import { broadcastSync } from './realtime.ts';
import { purgeExpiredSessions } from './auth.ts';
import { runScheduledJobs } from '../src/lib/rules.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  if (!fs.existsSync(config.distDir)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Frontend nije buildovan. U razvoju otvori http://localhost:5173 (npm run dev), ili pokreni npm run build.');
  }
  const safe = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = path.join(config.distDir, safe);
  if (!file.startsWith(config.distDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(config.distDir, 'index.html');
  const ext = path.extname(file);
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...SECURITY_HEADERS,
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

try {
  await initEngine();
} catch (e) {
  console.error(`\n✖ ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
onChange(broadcastSync);

// Zakazani poslovi: podsjetnici (2h prije), pozivi na ocjenjivanje, čišćenje isteklih sesija
const jobs = () => transact((d) => runScheduledJobs(d, Date.now())).catch((e) => console.error('zakazani poslovi:', e));
await jobs();
setInterval(jobs, 60000).unref();
setInterval(() => purgeExpiredSessions().catch((e) => console.error('sesije:', e)), 6 * 3600000).unref();
if (config.demo) setInterval(() => refreshDemoData().catch((e) => console.error('demo podaci:', e)), 30 * 60000).unref();

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    void handleApi(req, res, url);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  serveStatic(req, res, url);
});
server.keepAliveTimeout = 65000;

server.listen(config.port, () => {
  console.log(`› FaliJedan API radi na http://localhost:${config.port}  (demo: ${config.demo ? 'da' : 'ne'}, Google: ${providers.google ? 'da' : 'ne'}, Apple: ${providers.apple ? 'da' : 'ne'})`);
});

const shutdown = () => {
  server.close();
  void Promise.resolve(shutdownStorage()).finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
