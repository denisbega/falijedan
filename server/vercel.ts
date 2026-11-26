/**
 * Vercel serverless funkcija — obrađuje sve /api/* zahtjeve (statični frontend služi Vercel CDN).
 * Nema stalnog procesa: stanje se provjerava u bazi na svakom zahtjevu (engine.ensureFresh),
 * a zakazani poslovi se pokreću uz zahtjeve, najviše jednom u minuti po instanci.
 * Build: scripts/build-vercel.mjs pakuje ovaj fajl u .vercel/output/functions/api.func/index.mjs.
 */
import './serverless-env.ts'; // mora biti prvi import: uključuje serverless režim prije učitavanja config-a
import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from './config.ts';
import { initEngine, refreshDemoData, runJobs } from './engine.ts';
import { handleApi, sendJson, withoutDb } from './routes.ts';
import { purgeExpiredSessions } from './auth.ts';
import { background } from './background.ts';

let lastJobs = 0;
let lastPurge = 0;
let lastDemo = Date.now();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  let url: URL;
  try {
    url = new URL(req.url ?? '/', 'https://localhost'); // fiksna baza — Host zaglavlje ne koristimo za parsiranje
  } catch {
    return sendJson(res, 400, { error: 'Neispravan zahtjev.' });
  }
  // Vercel rewrite /api/(.*) → /api?__p=$1: vrati originalnu putanju
  const original = url.searchParams.get('__p');
  if (original != null) {
    url.pathname = `/api/${original}`;
    url.searchParams.delete('__p');
  }

  // Podešavanja (ekran prijave) ne čekaju povezivanje s bazom pri hladnom startu
  if (withoutDb(url.pathname)) return handleApi(req, res, url);

  try {
    await initEngine();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return sendJson(res, 503, { error: 'Baza trenutno nije dostupna. Pokušaj ponovo za koji trenutak.' });
  }

  const now = Date.now();
  if (now - lastJobs > 60000) {
    lastJobs = now;
    await runJobs().catch((e) => console.error('zakazani poslovi:', e));
  }
  if (now - lastPurge > 6 * 3600000) {
    lastPurge = now;
    background(purgeExpiredSessions());
  }
  if (config.demo && now - lastDemo > 30 * 60000) {
    lastDemo = now;
    background(refreshDemoData());
  }

  await handleApi(req, res, url);
}
