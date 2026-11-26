/**
 * FaliJedan server — API + realtime + (u produkciji) statični frontend iz dist/.
 * Pokretanje: npm run dev (zajedno sa Vite-om) ili npm start (produkcija).
 */
import { config, providers } from './config.ts';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { initEngine, onChange, refreshDemoData, runJobs, shutdownStorage } from './engine.ts';
import { handleApi, sendJson } from './routes.ts';
import { isAdsenseClient, staticHeaders } from './headers.ts';
import { broadcastSync } from './realtime.ts';
import { purgeExpiredSessions } from './auth.ts';

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

const STATIC_HEADERS = staticHeaders({ https: config.cookieSecure, turnstile: !!config.turnstile.siteKey, ads: isAdsenseClient(process.env.ADSENSE_CLIENT) });

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  if (!fs.existsSync(config.distDir)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Frontend nije buildovan. U razvoju otvori http://localhost:5173 (npm run dev), ili pokreni npm run build.');
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Neispravna adresa.');
  }
  const safe = path.normalize(decoded.replaceAll('\0', '')).replace(/^([/\\])+/, '');
  let file = path.join(config.distDir, safe);
  // Samo fajlovi unutar dist/ (path traversal) i bez skrivenih (.nešto); sve ostalo → index.html (SPA)
  const inside = file.startsWith(config.distDir + path.sep);
  const hidden = safe.split(/[/\\]/).some((part) => part.startsWith('.'));
  if (!inside || hidden || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(config.distDir, 'index.html');
  const ext = path.extname(file);
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...STATIC_HEADERS,
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res);
}

try {
  await initEngine();
} catch (e) {
  console.error(`\n✖ ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
onChange(broadcastSync);

// Zakazani poslovi: podsjetnici (2h prije), pozivi na ocjenjivanje, čišćenje isteklih sesija
const jobs = () => runJobs().catch((e) => console.error('zakazani poslovi:', e));
await jobs();
setInterval(jobs, 60000).unref();
setInterval(() => purgeExpiredSessions().catch((e) => console.error('sesije:', e)), 6 * 3600000).unref();
if (config.demo) setInterval(() => refreshDemoData().catch((e) => console.error('demo podaci:', e)), 30 * 60000).unref();

const server = http.createServer((req, res) => {
  // Nijedan zahtjev (loš URL, Host zaglavlje, %-kodiranje…) ne smije srušiti proces
  try {
    // Fiksna baza: Host zaglavlje šalje klijent, ne koristimo ga za parsiranje
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      handleApi(req, res, url).catch((e) => {
        console.error('api:', e instanceof Error ? e.message : e);
        if (!res.headersSent) sendJson(res, 500, { error: 'Greška na serveru. Pokušaj ponovo.' });
        else res.end();
      });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end();
    }
    serveStatic(req, res, url);
  } catch (e) {
    console.error('zahtjev:', e instanceof Error ? e.message : e);
    if (!res.headersSent) res.writeHead(400);
    res.end();
  }
});
server.headersTimeout = 20000;
server.requestTimeout = 30000;
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
