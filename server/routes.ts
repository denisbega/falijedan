/** REST API. Sve mutacije vraćaju { result, db } — svjež snimak podataka za korisnika. */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { config, providers } from './config.ts';
import { ensureFresh, etagFor, findUser, findUserByEmail, read, snapshotFor, transact } from './engine.ts';
import { appleAuthUrl, appleCallback, currentUserId, endSession, googleAuthUrl, googleCallback, rateLimit, startSession } from './auth.ts';
import { hashPassword, verifyPassword } from './passwords.ts';
import { attachClient } from './realtime.ts';
import { afterDirectMessage, afterSessionCreated } from './bots.ts';
import * as rules from '../src/lib/rules.ts';
import { ApiError, EMAIL_RE } from '../src/lib/rules.ts';
import { DEMO_USER_ID } from '../src/lib/seed.ts';
import type { Level, RatingKey, SportId } from '../src/lib/types.ts';

interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: string[];
  body: Record<string, unknown>;
  ip: string;
}
type Handler = (ctx: Ctx) => Promise<void> | void;

/* ---------- Odgovori ---------- */

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
};

export function sendJson(res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function withSnapshot(ctx: Ctx, userId: string, result: unknown, status = 200) {
  sendJson(ctx.res, status, { result: result ?? null, db: snapshotFor(userId) }, { ETag: etagFor(userId) });
}
function redirect(res: ServerResponse, to: string) {
  res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' });
  res.end();
}

/* ---------- Validacija ulaza ---------- */

const bad = (field: string) => new ApiError(`Neispravan unos: ${field}.`);
const str = (v: unknown, field: string, max = 200): string => {
  if (typeof v !== 'string') throw bad(field);
  return v.slice(0, max);
};
const optStr = (v: unknown, field: string, max = 200) => (v == null || v === '' ? undefined : str(v, field, max));
const num = (v: unknown, field: string): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw bad(field);
  return n;
};
const optNum = (v: unknown, field: string) => (v == null || v === '' ? undefined : num(v, field));
const int = (v: unknown, field: string) => Math.round(num(v, field));
const strArr = (v: unknown, field: string, maxItems = 10): string[] => {
  if (!Array.isArray(v)) throw bad(field);
  return v.slice(0, maxItems).map((x) => str(x, field, 40));
};

async function need(ctx: Ctx): Promise<string> {
  const id = await currentUserId(ctx.req);
  if (!id) throw new ApiError('Sesija je istekla — prijavi se ponovo.', 401);
  return id;
}

/* ---------- Rute ---------- */

const routes: [string, RegExp, Handler][] = [];
const on = (method: string, pattern: string, h: Handler) => routes.push([method, new RegExp(`^${pattern.replace(/:\w+/g, '([^/]+)')}$`), h]);

on('GET', '/api/health', ({ res }) => sendJson(res, 200, { ok: true, users: read().users.length, time: new Date().toISOString() }));

/* Auth */
// realtime: 'sse' (stalni server) ili 'poll' (serverless — klijent periodično provjerava /api/sync uz ETag)
on('GET', '/api/auth/providers', ({ res }) => sendJson(res, 200, { ...providers, realtime: config.serverless ? 'poll' : 'sse' }));

on('POST', '/api/auth/register', async (ctx) => {
  rateLimit(`auth:${ctx.ip}`, 20, 10 * 60000);
  const password = str(ctx.body.password, 'lozinka', 200);
  if (password.length < 6) throw new ApiError('Lozinka mora imati najmanje 6 znakova.');
  const email = str(ctx.body.email, 'email', 120);
  if (findUserByEmail(email.trim())) throw new ApiError('Nalog sa ovim emailom već postoji. Prijavi se.', 409);
  const passwordHash = await hashPassword(password);
  const userId = await transact((d) =>
    rules.createUser(d, { firstName: str(ctx.body.firstName, 'ime', 40), lastName: str(ctx.body.lastName, 'prezime', 40), email, passwordHash }),
  );
  await startSession(ctx.req, ctx.res, userId);
  withSnapshot(ctx, userId, { userId }, 201);
});

on('POST', '/api/auth/login', async (ctx) => {
  rateLimit(`auth:${ctx.ip}`, 20, 10 * 60000);
  const email = str(ctx.body.email, 'email', 120).trim().toLowerCase();
  const password = str(ctx.body.password, 'lozinka', 200);
  if (!EMAIL_RE.test(email)) throw new ApiError('Email adresa nije ispravna.');
  const user = findUserByEmail(email);
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok) throw new ApiError('Pogrešan email ili lozinka.', 401);
  await startSession(ctx.req, ctx.res, user.id);
  withSnapshot(ctx, user.id, { userId: user.id });
});

on('POST', '/api/auth/demo', async (ctx) => {
  if (!providers.demo || !findUser(DEMO_USER_ID)) throw new ApiError('Demo nalog nije dostupan.', 404);
  rateLimit(`auth:${ctx.ip}`, 30, 10 * 60000);
  await startSession(ctx.req, ctx.res, DEMO_USER_ID);
  withSnapshot(ctx, DEMO_USER_ID, { userId: DEMO_USER_ID });
});

on('POST', '/api/auth/logout', async (ctx) => {
  await endSession(ctx.req, ctx.res);
  sendJson(ctx.res, 200, { result: null });
});

on('GET', '/api/auth/google', async ({ res }) => {
  if (!providers.google) return redirect(res, '/prijava?greska=' + encodeURIComponent('Google prijava nije podešena.'));
  redirect(res, await googleAuthUrl());
});
on('GET', '/api/auth/google/callback', async (ctx) => {
  try {
    const userId = await googleCallback(ctx.url.searchParams);
    await startSession(ctx.req, ctx.res, userId);
    redirect(ctx.res, '/');
  } catch (e) {
    redirect(ctx.res, '/prijava?greska=' + encodeURIComponent(e instanceof ApiError ? e.message : 'Google prijava nije uspjela.'));
  }
});
on('GET', '/api/auth/apple', async ({ res }) => {
  if (!providers.apple) return redirect(res, '/prijava?greska=' + encodeURIComponent('Apple prijava nije podešena.'));
  redirect(res, await appleAuthUrl());
});
on('POST', '/api/auth/apple/callback', async (ctx) => {
  try {
    const userId = await appleCallback(new URLSearchParams(ctx.body.__raw as string));
    await startSession(ctx.req, ctx.res, userId);
    redirect(ctx.res, '/');
  } catch (e) {
    redirect(ctx.res, '/prijava?greska=' + encodeURIComponent(e instanceof ApiError ? e.message : 'Apple prijava nije uspjela.'));
  }
});

/* Podaci + realtime */
on('GET', '/api/sync', async (ctx) => {
  const userId = await need(ctx);
  const etag = etagFor(userId);
  if (ctx.req.headers['if-none-match'] === etag) {
    ctx.res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-store' });
    return void ctx.res.end();
  }
  sendJson(ctx.res, 200, { db: snapshotFor(userId) }, { ETag: etag });
});

on('GET', '/api/events', async (ctx) => {
  // Serverless funkcija ne smije držati otvorenu vezu; 204 = EventSource se ne spaja ponovo
  if (config.serverless) return void ctx.res.writeHead(204).end();
  const userId = await need(ctx);
  attachClient(ctx.req, ctx.res, userId);
});

/* Profil */
on('POST', '/api/profile', async (ctx) => {
  const userId = await need(ctx);
  const b = ctx.body;
  const sports = b.sports === undefined ? undefined : (Array.isArray(b.sports) ? b.sports.slice(0, 6) : []).map((s: Record<string, unknown>) => ({
    sport: str(s?.sport, 'sport', 20) as SportId,
    level: str(s?.level, 'nivo', 20) as Level,
    positions: strArr(s?.positions ?? [], 'pozicije', 8),
  }));
  await transact((d) =>
    rules.saveProfile(d, userId, {
      firstName: optStr(b.firstName, 'ime', 40),
      lastName: optStr(b.lastName, 'prezime', 40),
      bio: b.bio === undefined ? undefined : str(b.bio, 'bio', 160),
      sports,
      city: optStr(b.city, 'grad', 60),
      lat: optNum(b.lat, 'lat'),
      lng: optNum(b.lng, 'lng'),
      radiusKm: optNum(b.radiusKm, 'radijus'),
      completeOnboarding: b.completeOnboarding === true,
    }),
  );
  withSnapshot(ctx, userId, null);
});

/* Termini */
on('POST', '/api/sessions', async (ctx) => {
  const userId = await need(ctx);
  rateLimit(`create:${userId}`, 10, 60 * 60000);
  const b = ctx.body;
  const input: rules.CreateSessionInput = {
    sport: str(b.sport, 'sport', 20) as SportId,
    venueName: str(b.venueName, 'lokacija', 80),
    address: optStr(b.address, 'adresa', 120),
    city: optStr(b.city, 'grad', 60),
    lat: optNum(b.lat, 'lat'),
    lng: optNum(b.lng, 'lng'),
    startsAt: str(b.startsAt, 'vrijeme', 40),
    durationMin: int(b.durationMin, 'trajanje'),
    totalPlayers: int(b.totalPlayers, 'ukupno igrača'),
    baseCount: int(b.baseCount, 'prisutni'),
    priceKM: b.priceKM == null ? null : num(b.priceKM, 'cijena'),
    level: str(b.level, 'nivo', 20) as Level,
    neededPositions: strArr(b.neededPositions ?? [], 'pozicije', 8),
  };
  const result = await transact((d) => rules.createSession(d, userId, input));
  afterSessionCreated(result.id);
  withSnapshot(ctx, userId, result, 201);
});

on('POST', '/api/sessions/:id/join', async (ctx) => {
  const userId = await need(ctx);
  withSnapshot(ctx, userId, await transact((d) => rules.joinSession(d, userId, ctx.params[0], ctx.body.waitlist === true)));
});
on('POST', '/api/sessions/:id/leave', async (ctx) => {
  const userId = await need(ctx);
  await transact((d) => rules.leaveSession(d, userId, ctx.params[0]));
  withSnapshot(ctx, userId, null);
});
on('POST', '/api/sessions/:id/cancel', async (ctx) => {
  const userId = await need(ctx);
  await transact((d) => rules.cancelSession(d, userId, ctx.params[0]));
  withSnapshot(ctx, userId, null);
});
on('POST', '/api/sessions/:id/remove', async (ctx) => {
  const userId = await need(ctx);
  await transact((d) => rules.removePlayer(d, userId, ctx.params[0], str(ctx.body.userId, 'igrač', 60)));
  withSnapshot(ctx, userId, null);
});
on('POST', '/api/sessions/:id/ratings', async (ctx) => {
  const userId = await need(ctx);
  if (!Array.isArray(ctx.body.entries)) throw bad('ocjene');
  const keys: RatingKey[] = ['fairPlay', 'teamwork', 'punctuality', 'skill', 'fitness'];
  const entries: rules.RatingEntry[] = ctx.body.entries.slice(0, 40).map((e: Record<string, unknown>) => {
    const scores = (e?.scores ?? {}) as Record<string, unknown>;
    return {
      toUserId: str(e?.toUserId, 'igrač', 60),
      noShow: e?.noShow === true,
      comment: optStr(e?.comment, 'komentar', 240),
      scores: Object.fromEntries(keys.map((k) => [k, e?.noShow === true ? 0 : int(scores[k], 'ocjena')])) as Record<RatingKey, number>,
    };
  });
  await transact((d) => rules.submitRatings(d, userId, ctx.params[0], entries));
  withSnapshot(ctx, userId, null);
});
on('POST', '/api/sessions/:id/invite', async (ctx) => {
  const userId = await need(ctx);
  rateLimit(`invite:${userId}`, 40, 60 * 60000);
  const threadId = await transact((d) => rules.inviteToSession(d, userId, str(ctx.body.userId, 'igrač', 60), ctx.params[0]));
  withSnapshot(ctx, userId, { threadId });
});

/* Poruke */
on('POST', '/api/threads/direct', async (ctx) => {
  const userId = await need(ctx);
  withSnapshot(ctx, userId, { threadId: await transact((d) => rules.openDirectThread(d, userId, str(ctx.body.userId, 'igrač', 60))) });
});
on('POST', '/api/threads/:id/messages', async (ctx) => {
  const userId = await need(ctx);
  rateLimit(`msg:${userId}`, 40, 60000);
  const info = await transact((d) => rules.sendMessage(d, userId, ctx.params[0], str(ctx.body.text, 'poruka', 1000), optStr(ctx.body.sessionId, 'termin', 60)));
  if (info.kind === 'direct') afterDirectMessage(ctx.params[0], info.memberIds, userId);
  withSnapshot(ctx, userId, null);
});
on('POST', '/api/threads/:id/read', async (ctx) => {
  const userId = await need(ctx);
  await transact((d) => rules.markThreadRead(d, userId, ctx.params[0]));
  withSnapshot(ctx, userId, null);
});

/* Obavještenja */
on('POST', '/api/notifications/read-all', async (ctx) => {
  const userId = await need(ctx);
  await transact((d) => rules.markAllNotificationsRead(d, userId));
  withSnapshot(ctx, userId, null);
});
on('POST', '/api/notifications/:id/read', async (ctx) => {
  const userId = await need(ctx);
  await transact((d) => rules.markNotificationRead(d, userId, ctx.params[0]));
  withSnapshot(ctx, userId, null);
});

/* ---------- Dispečer ---------- */

async function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new ApiError('Zahtjev je prevelik.', 413);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const method = req.method ?? 'GET';
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
  try {
    const match = routes.find(([m, re]) => m === method && re.test(url.pathname));
    if (!match) throw new ApiError('Ruta ne postoji.', 404);
    const params = (url.pathname.match(match[1]) ?? []).slice(1).map(decodeURIComponent);
    // Da li je druga instanca servera nešto promijenila (Vercel: više funkcija nad istom bazom)
    await ensureFresh();
    let body: Record<string, unknown> = {};
    if (method === 'POST') {
      const isAppleCallback = url.pathname === '/api/auth/apple/callback';
      if (!isAppleCallback) {
        // CSRF zaštita: samo JSON zahtjevi sa iste adrese
        const ct = String(req.headers['content-type'] ?? '');
        if (!ct.includes('application/json')) throw new ApiError('Neispravan zahtjev.', 415);
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host && origin !== new URL(config.publicUrl).origin) throw new ApiError('Zabranjen pristup.', 403);
      }
      const raw = await readBody(req);
      if (isAppleCallback) body = { __raw: raw };
      else if (raw) {
        try {
          const parsed = JSON.parse(raw);
          body = parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
          throw new ApiError('Neispravan JSON.', 400);
        }
      }
    }
    await match[2]({ req, res, url, params, body, ip });
  } catch (e) {
    if (res.headersSent) return void res.end();
    if (e instanceof ApiError) return sendJson(res, e.status, { error: e.message });
    console.error(`${method} ${url.pathname}`, e);
    sendJson(res, 500, { error: 'Greška na serveru. Pokušaj ponovo.' });
  }
}
