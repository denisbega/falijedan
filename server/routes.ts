/**
 * REST API. Sve mutacije vraćaju { result, db } — svjež snimak podataka za korisnika.
 * Svaki ulaz se validira na serveru (src/lib/validation.ts): nepoznata polja, pogrešni tipovi,
 * preduge vrijednosti, HTML i nemoguće vrijednosti se ODBIJAJU — ništa se ne skraćuje tiho.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { config, emailEnabled, providers, requireVerification } from './config.ts';
import { adminUsers, db, ensureFresh, etagFor, findUser, findUserByEmail, isAdmin, read, snapshotFor, transact } from './engine.ts';
import { appleAuthUrl, appleCallback, currentUserId, endAllSessions, endSession, googleAuthUrl, googleCallback, memoryLimit, newEmailToken, peekEmailToken, rateLimit, startSession, trustDevice, trustedDevice, useEmailToken } from './auth.ts';
import { resetPasswordMail, sendEmail, verifyEmailMail } from './email.ts';
import { background } from './background.ts';
import { hashPassword, needsRehash, verifyPassword } from './passwords.ts';
import { verifyTurnstile } from './turnstile.ts';
import { attachClient } from './realtime.ts';
import { afterDirectMessage, afterSessionCreated } from './bots.ts';
import { apiHeaders } from './headers.ts';
import * as rules from '../src/lib/rules.ts';
import { ApiError } from '../src/lib/rules.ts';
import * as v from '../src/lib/validation.ts';
import { ANY_POSITION, LEVELS, SPORTS, getSport } from '../src/lib/sports.ts';
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

const MIN = 60000;
const HOUR = 60 * MIN;
const SPORT_IDS = SPORTS.map((s) => s.id) as SportId[];
const LEVEL_IDS = LEVELS.map((l) => l.id) as Level[];
const RATING_KEYS: RatingKey[] = ['fairPlay', 'teamwork', 'punctuality', 'skill', 'fitness'];
const API_HEADERS = apiHeaders({ https: config.cookieSecure, turnstile: false });

/* ---------- Odgovori ---------- */

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

async function need(ctx: Ctx): Promise<string> {
  const id = await currentUserId(ctx.req);
  if (!id) throw new ApiError('Sesija je istekla — prijavi se ponovo.', 401);
  return id;
}

/** Akcije koje utiču na druge (termini, prijave, poruke, ocjene) traže potvrđen email — protiv lažnih naloga. */
function requireVerified(userId: string) {
  if (!requireVerification) return;
  if (!findUser(userId)?.verified) throw new ApiError('Prvo potvrdi email adresu — link smo ti poslali na email. Novi link možeš zatražiti na početnoj stranici.', 403);
}

async function sendVerification(userId: string) {
  const u = findUser(userId);
  if (!u?.email || u.verified) return;
  const token = await newEmailToken(userId, 'verify', 48 * HOUR);
  await sendEmail(verifyEmailMail(u.email, u.firstName, `${config.publicUrl}/potvrda-emaila?token=${token}`));
}

const LOCKED_MESSAGE = 'Previše neuspjelih pokušaja prijave na ovaj nalog. Prijavi se sa uređaja koji već koristiš ili postavi novu lozinku preko „Zaboravljena lozinka?“.';

/** IP klijenta. Vercel prepisuje x-forwarded-for/x-real-ip; na vlastitom serveru vjerujemo proxyju samo uz TRUST_PROXY. */
function clientIp(req: IncomingMessage): string {
  const h = (n: string) => String(req.headers[n] ?? '').trim();
  if (config.serverless) return (h('x-real-ip') || h('x-forwarded-for').split(',')[0]).trim() || 'unknown';
  if (config.trustProxy) {
    const hops = h('x-forwarded-for').split(',').map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1]; // adresu je dodao NAŠ proxy (zadnji hop)
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/* ---------- Rute ---------- */

const routes: [string, RegExp, Handler][] = [];
const on = (method: string, pattern: string, h: Handler) => routes.push([method, new RegExp(`^${pattern.replace(/:\w+/g, '([^/]+)')}$`), h]);
const empty = (ctx: Ctx) => v.shape(ctx.body, 'zahtjev', []);

on('GET', '/api/health', ({ res }) => sendJson(res, 200, { ok: true, time: new Date().toISOString() }));

/* Auth */
// realtime: 'sse' (stalni server) ili 'poll' (serverless — klijent periodično provjerava /api/sync uz ETag)
on('GET', '/api/auth/providers', ({ res }) =>
  sendJson(res, 200, {
    ...providers,
    realtime: config.serverless ? 'poll' : 'sse',
    turnstileSiteKey: config.turnstile.siteKey || null,
    emailVerification: requireVerification,
    passwordReset: emailEnabled || !config.isProd, // u razvoju link ide u konzolu
  }),
);

on('POST', '/api/auth/register', async (ctx) => {
  const b = v.shape(ctx.body, 'registracija', ['firstName', 'lastName', 'email', 'password', 'turnstileToken']);
  await rateLimit('register-ip', ctx.ip, 10, HOUR);
  const firstName = v.personName(b.firstName, 'ime');
  const lastName = v.personName(b.lastName, 'prezime');
  const email = v.email(b.email);
  const password = v.newPassword(b.password, email);
  await verifyTurnstile(b.turnstileToken, ctx.ip);
  if (findUserByEmail(email)) throw new ApiError('Nalog sa ovim emailom već postoji. Prijavi se.', 409);
  const passwordHash = await hashPassword(password);
  const userId = await transact((d) => rules.createUser(d, { firstName, lastName, email, passwordHash }));
  await startSession(ctx.req, ctx.res, userId);
  await trustDevice(ctx.req, ctx.res, userId);
  background(sendVerification(userId)); // ne usporava registraciju; neuspjeh → korisnik traži novi link
  withSnapshot(ctx, userId, { userId }, 201);
});

on('POST', '/api/auth/login', async (ctx) => {
  const b = v.shape(ctx.body, 'prijava', ['email', 'password']);
  await rateLimit('login-ip', ctx.ip, 30, 15 * MIN);
  const email = v.email(b.email);
  const password = v.anyPassword(b.password);
  const user = findUserByEmail(email);
  // Povjerljiv uređaj (ovdje se korisnik već prijavljivao) ima svoj limit — napadač koji pogađa lozinku
  // sa drugih adresa NE može zaključati vlasnika. Novi uređaji dijele limit po nalogu (brute force).
  const device = user ? await trustedDevice(ctx.req, user.id) : null;
  if (device) await rateLimit('login-dev', device, 10, 15 * MIN);
  else await rateLimit('login-acct', email, 10, 15 * MIN, LOCKED_MESSAGE);
  // Demo nalog (javna lozinka) se ne može koristiti kad demo režim nije uključen
  const usable = user && user.passwordHash && (config.demo || user.id !== DEMO_USER_ID) ? user : null;
  const ok = await verifyPassword(password, usable?.passwordHash); // i za nepostojeći nalog troši isto vrijeme
  if (!usable || !ok) throw new ApiError('Pogrešan email ili lozinka.', 401);
  if (needsRehash(usable.passwordHash)) {
    const fresh = await hashPassword(password);
    await transact((d) => {
      const u = d.users.find((x) => x.id === usable.id);
      if (u) u.passwordHash = fresh;
    }).catch(() => undefined);
  }
  await startSession(ctx.req, ctx.res, usable.id);
  await trustDevice(ctx.req, ctx.res, usable.id);
  withSnapshot(ctx, usable.id, { userId: usable.id });
});

/* Potvrda emaila i nova lozinka */
on('POST', '/api/auth/verify', async (ctx) => {
  const b = v.shape(ctx.body, 'potvrda', ['token']);
  await rateLimit('verify-ip', ctx.ip, 30, HOUR);
  const userId = await useEmailToken(b.token, 'verify');
  if (!userId || !findUser(userId)?.email) throw new ApiError('Link za potvrdu je nevažeći ili je istekao. Zatraži novi u aplikaciji.', 400);
  await transact((d) => {
    const u = d.users.find((x) => x.id === userId);
    if (u) u.verified = true;
  });
  const me = await currentUserId(ctx.req);
  if (me) return withSnapshot(ctx, me, { verified: true });
  sendJson(ctx.res, 200, { result: { verified: true } });
});

on('POST', '/api/auth/verify/resend', async (ctx) => {
  const userId = await need(ctx);
  empty(ctx);
  if (findUser(userId)?.verified) return withSnapshot(ctx, userId, { sent: false, verified: true });
  await rateLimit('verify-resend', userId, 3, HOUR, 'Link je već poslan nekoliko puta. Provjeri i spam folder, pa pokušaj ponovo za sat vremena.');
  await sendVerification(userId);
  withSnapshot(ctx, userId, { sent: true });
});

on('POST', '/api/auth/forgot', async (ctx) => {
  const b = v.shape(ctx.body, 'zaboravljena lozinka', ['email']);
  await rateLimit('forgot-ip', ctx.ip, 10, HOUR);
  const email = v.email(b.email);
  await rateLimit('forgot-acct', email, 3, HOUR, 'Link je već poslan nekoliko puta. Provjeri i spam folder, pa pokušaj ponovo za sat vremena.');
  if (!emailEnabled && config.isProd) throw new ApiError('Reset lozinke trenutno nije dostupan. Pokušaj kasnije.', 503);
  const user = findUserByEmail(email);
  // Isti odgovor (i isto vrijeme — slanje ide u pozadini) bez obzira postoji li nalog: nema otkrivanja emailova
  if (user && (config.demo || user.id !== DEMO_USER_ID)) {
    background(
      (async () => {
        const token = await newEmailToken(user.id, 'reset', 30 * MIN);
        await sendEmail(resetPasswordMail(user.email!, user.firstName, `${config.publicUrl}/nova-lozinka?token=${token}`));
      })(),
    );
  }
  sendJson(ctx.res, 200, { result: { sent: true } });
});

on('POST', '/api/auth/reset', async (ctx) => {
  const b = v.shape(ctx.body, 'nova lozinka', ['token', 'password']);
  await rateLimit('reset-ip', ctx.ip, 20, HOUR);
  const invalid = new ApiError('Link za novu lozinku je nevažeći ili je istekao. Zatraži novi.', 400);
  const owner = await peekEmailToken(b.token, 'reset');
  const user = owner ? findUser(owner) : undefined;
  if (!user?.email) throw invalid;
  const password = v.newPassword(b.password, user.email); // provjera prije trošenja linka
  if ((await useEmailToken(b.token, 'reset')) !== user.id) throw invalid;
  const passwordHash = await hashPassword(password);
  await transact((d) => {
    const u = d.users.find((x) => x.id === user.id);
    if (!u) throw invalid;
    u.passwordHash = passwordHash;
    u.verified = true; // link iz emaila dokazuje vlasništvo nad adresom
  });
  // Odjava sa svih uređaja (i ukidanje povjerljivih uređaja) — ako je neko znao staru lozinku, gubi pristup
  await endAllSessions(user.id);
  await db().tokens.deleteForUser(user.id, 'device');
  await db().tokens.deleteForUser(user.id, 'reset');
  await startSession(ctx.req, ctx.res, user.id);
  await trustDevice(ctx.req, ctx.res, user.id);
  withSnapshot(ctx, user.id, { userId: user.id });
});

on('POST', '/api/auth/demo', async (ctx) => {
  empty(ctx);
  if (!providers.demo || !findUser(DEMO_USER_ID)) throw new ApiError('Demo nalog nije dostupan.', 404);
  await rateLimit('demo-ip', ctx.ip, 30, 10 * MIN);
  await startSession(ctx.req, ctx.res, DEMO_USER_ID);
  withSnapshot(ctx, DEMO_USER_ID, { userId: DEMO_USER_ID });
});

on('POST', '/api/auth/logout', async (ctx) => {
  empty(ctx);
  await endSession(ctx.req, ctx.res);
  sendJson(ctx.res, 200, { result: null });
});

// Greške OAuth-a idu klijentu kao kod (klijent prikazuje samo poznate poruke — nema podmetanja teksta)
const oauthError = (e: unknown) => (e instanceof ApiError && e.status === 400 && /istekla/.test(e.message) ? 'istekla' : 'neuspjela');

on('GET', '/api/auth/google', async (ctx) => {
  if (!providers.google) return redirect(ctx.res, '/prijava?greska=nije-podeseno');
  await rateLimit('oauth-ip', ctx.ip, 30, 10 * MIN);
  redirect(ctx.res, await googleAuthUrl(ctx.res));
});
on('GET', '/api/auth/google/callback', async (ctx) => {
  try {
    const userId = await googleCallback(ctx.req, ctx.res, ctx.url.searchParams);
    await startSession(ctx.req, ctx.res, userId);
    await trustDevice(ctx.req, ctx.res, userId);
    redirect(ctx.res, '/');
  } catch (e) {
    redirect(ctx.res, `/prijava?greska=${oauthError(e)}`);
  }
});
on('GET', '/api/auth/apple', async (ctx) => {
  if (!providers.apple) return redirect(ctx.res, '/prijava?greska=nije-podeseno');
  await rateLimit('oauth-ip', ctx.ip, 30, 10 * MIN);
  redirect(ctx.res, await appleAuthUrl(ctx.res));
});
on('POST', '/api/auth/apple/callback', async (ctx) => {
  try {
    const userId = await appleCallback(ctx.req, ctx.res, new URLSearchParams(ctx.body.__raw as string));
    await startSession(ctx.req, ctx.res, userId);
    await trustDevice(ctx.req, ctx.res, userId);
    redirect(ctx.res, '/');
  } catch (e) {
    redirect(ctx.res, `/prijava?greska=${oauthError(e)}`);
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

/* Nalog: izvoz i brisanje ličnih podataka */
on('GET', '/api/account/export', async (ctx) => {
  const userId = await need(ctx);
  await rateLimit('export', userId, 10, HOUR);
  const data = rules.exportUserData(read(), userId);
  sendJson(ctx.res, 200, data, { 'Content-Disposition': `attachment; filename="falijedan-podaci-${new Date().toISOString().slice(0, 10)}.json"` });
});

on('POST', '/api/account/delete', async (ctx) => {
  const userId = await need(ctx);
  const b = v.shape(ctx.body, 'brisanje', ['password', 'confirm']);
  if (userId === DEMO_USER_ID) throw new ApiError('Demo nalog se ne može obrisati.', 403);
  if (typeof b.confirm !== 'string' || !/^obri[sš]i$/i.test(b.confirm.trim())) throw new ApiError('Za potvrdu upiši OBRIŠI.');
  await rateLimit('delete', userId, 5, 15 * MIN);
  const me = findUser(userId)!;
  if (me.passwordHash) {
    const ok = await verifyPassword(v.anyPassword(b.password), me.passwordHash);
    if (!ok) throw new ApiError('Pogrešna lozinka.', 403);
  }
  await transact((d) => rules.deleteAccount(d, userId));
  await endAllSessions(userId);
  await db().identities.deleteForUser(userId);
  await db().tokens.deleteForUser(userId);
  await endSession(ctx.req, ctx.res);
  sendJson(ctx.res, 200, { result: { deleted: true } });
});

/* Profil */
on('POST', '/api/profile', async (ctx) => {
  const userId = await need(ctx);
  const b = v.shape(ctx.body, 'profil', ['firstName', 'lastName', 'bio', 'sports', 'city', 'lat', 'lng', 'radiusKm', 'completeOnboarding']);
  let sports: rules.SportProfileInput[] | undefined;
  if (b.sports !== undefined) {
    sports = v.array(b.sports, 'sportovi', SPORT_IDS.length).map((x) => {
      const o = v.shape(x, 'sport', ['sport', 'level', 'positions']);
      const sport = v.oneOf(o.sport, SPORT_IDS, 'sport');
      const level = v.oneOf(o.level, LEVEL_IDS, 'nivo');
      const allowed = [...getSport(sport).positions, ANY_POSITION];
      const positions = o.positions === undefined ? [] : v.array(o.positions, 'pozicije', allowed.length).map((p) => v.oneOf(p, allowed, 'pozicija'));
      return { sport, level, positions: [...new Set(positions)] };
    });
    if (new Set(sports.map((s) => s.sport)).size !== sports.length) throw new ApiError('Svaki sport može biti naveden samo jednom.');
  }
  const hasLoc = b.lat !== undefined || b.lng !== undefined;
  const input = {
      firstName: b.firstName === undefined ? undefined : v.personName(b.firstName, 'ime'),
      lastName: b.lastName === undefined ? undefined : v.personName(b.lastName, 'prezime'),
      bio: b.bio === undefined ? undefined : v.text(b.bio, 'o tebi', { max: v.LIMITS.bio.max, optional: true }),
      sports,
      city: b.city === undefined ? undefined : v.text(b.city, 'grad', { min: v.LIMITS.city.min, max: v.LIMITS.city.max }),
      lat: hasLoc ? v.lat(b.lat) : undefined,
      lng: hasLoc ? v.lng(b.lng) : undefined,
      radiusKm: b.radiusKm === undefined ? undefined : v.int(b.radiusKm, 'radijus', 1, 50),
      completeOnboarding: b.completeOnboarding === undefined ? false : v.bool(b.completeOnboarding, 'onboarding'),
  };
  await rateLimit('profile', userId, 60, HOUR);
  await transact((d) => rules.saveProfile(d, userId, input));
  withSnapshot(ctx, userId, null);
});

/* Termini */
on('POST', '/api/sessions', async (ctx) => {
  const userId = await need(ctx);
  requireVerified(userId);
  const b = v.shape(ctx.body, 'termin', ['sport', 'venueName', 'address', 'city', 'lat', 'lng', 'startsAt', 'durationMin', 'totalPlayers', 'baseCount', 'priceKM', 'level', 'neededPositions']);
  const sport = v.oneOf(b.sport, SPORT_IDS, 'sport');
  const allowed = [...getSport(sport).positions, ANY_POSITION];
  const hasLoc = b.lat !== undefined || b.lng !== undefined;
  const input: rules.CreateSessionInput = {
    sport,
    venueName: v.text(b.venueName, 'lokacija', { min: v.LIMITS.venue.min, max: v.LIMITS.venue.max }),
    address: b.address == null ? undefined : v.text(b.address, 'adresa', { max: v.LIMITS.address.max, optional: true }) || undefined,
    city: b.city == null ? undefined : v.text(b.city, 'grad', { min: v.LIMITS.city.min, max: v.LIMITS.city.max }),
    lat: hasLoc ? v.lat(b.lat) : undefined,
    lng: hasLoc ? v.lng(b.lng) : undefined,
    startsAt: v.isoDate(b.startsAt, 'vrijeme'),
    durationMin: v.int(b.durationMin, 'trajanje', 30, 240),
    totalPlayers: v.int(b.totalPlayers, 'ukupno igrača', 2, 50),
    baseCount: v.int(b.baseCount, 'prisutni', 1, 49),
    priceKM: b.priceKM == null ? null : v.num(b.priceKM, 'cijena', 0, 200),
    level: v.oneOf(b.level, LEVEL_IDS, 'nivo'),
    neededPositions: b.neededPositions === undefined ? [] : v.array(b.neededPositions, 'pozicije', 8).map((p) => v.oneOf(p, allowed, 'pozicija')),
  };
  // Limit broji samo ispravne zahtjeve (greška u formi ne smije zaključati korisnika na sat vremena)
  await rateLimit('create', userId, 10, HOUR);
  const result = await transact((d) => rules.createSession(d, userId, input));
  afterSessionCreated(result.id);
  withSnapshot(ctx, userId, result, 201);
});

on('POST', '/api/sessions/:id/join', async (ctx) => {
  const userId = await need(ctx);
  requireVerified(userId);
  const b = v.shape(ctx.body, 'prijava na termin', ['waitlist']);
  const waitlist = b.waitlist === undefined ? false : v.bool(b.waitlist, 'lista čekanja');
  await rateLimit('join', userId, 30, HOUR); // prijava/odjava u krug = spam obavještenja organizatoru
  withSnapshot(ctx, userId, await transact((d) => rules.joinSession(d, userId, ctx.params[0], waitlist)));
});
on('POST', '/api/sessions/:id/leave', async (ctx) => {
  const userId = await need(ctx);
  empty(ctx);
  await rateLimit('leave', userId, 30, HOUR);
  await transact((d) => rules.leaveSession(d, userId, ctx.params[0]));
  withSnapshot(ctx, userId, null);
});
on('POST', '/api/sessions/:id/cancel', async (ctx) => {
  const userId = await need(ctx);
  empty(ctx);
  await transact((d) => rules.cancelSession(d, userId, ctx.params[0]));
  withSnapshot(ctx, userId, null);
});
on('POST', '/api/sessions/:id/remove', async (ctx) => {
  const userId = await need(ctx);
  const b = v.shape(ctx.body, 'uklanjanje', ['userId']);
  const target = v.id(b.userId, 'igrač');
  await transact((d) => rules.removePlayer(d, userId, ctx.params[0], target));
  withSnapshot(ctx, userId, null);
});
on('POST', '/api/sessions/:id/ratings', async (ctx) => {
  const userId = await need(ctx);
  requireVerified(userId);
  const b = v.shape(ctx.body, 'ocjene', ['entries']);
  const entries: rules.RatingEntry[] = v.array(b.entries, 'ocjene', 30).map((x) => {
    const e = v.shape(x, 'ocjena', ['toUserId', 'scores', 'comment', 'noShow']);
    const noShow = e.noShow === undefined ? false : v.bool(e.noShow, 'izostanak');
    const s = e.scores === undefined && noShow ? {} : v.shape(e.scores, 'ocjene', RATING_KEYS);
    return {
      toUserId: v.id(e.toUserId, 'igrač'),
      noShow,
      comment: noShow || e.comment == null ? undefined : v.text(e.comment, 'komentar', { max: v.LIMITS.comment.max, multiline: true, optional: true }) || undefined,
      scores: Object.fromEntries(RATING_KEYS.map((k) => [k, noShow ? 0 : v.int(s[k], 'ocjena', 1, 5)])) as Record<RatingKey, number>,
    };
  });
  await rateLimit('rate', userId, 20, HOUR);
  await transact((d) => rules.submitRatings(d, userId, ctx.params[0], entries));
  withSnapshot(ctx, userId, null);
});
on('POST', '/api/sessions/:id/invite', async (ctx) => {
  const userId = await need(ctx);
  requireVerified(userId);
  const b = v.shape(ctx.body, 'poziv', ['userId']);
  const target = v.id(b.userId, 'igrač');
  await rateLimit('invite', userId, 30, HOUR);
  const threadId = await transact((d) => rules.inviteToSession(d, userId, target, ctx.params[0]));
  withSnapshot(ctx, userId, { threadId });
});

/* Poruke */
// Podršci (adminu) može pisati i korisnik koji još nije potvrdio email — njemu pomoć najčešće i treba
const isAdminThread = (threadId: string, userId: string) => {
  const t = read().threads.find((x) => x.id === threadId);
  return t?.kind === 'direct' && t.memberIds.some((id) => id !== userId && isAdmin(findUser(id)));
};

on('POST', '/api/threads/direct', async (ctx) => {
  const userId = await need(ctx);
  const b = v.shape(ctx.body, 'razgovor', ['userId']);
  const other = v.id(b.userId, 'igrač');
  if (!isAdmin(findUser(other))) requireVerified(userId);
  const exists = read().threads.some((t) => t.kind === 'direct' && t.memberIds.includes(userId) && t.memberIds.includes(other));
  // novi razgovori sa nepoznatima: spam (admin piše korisnicima bez ograničenja)
  if (!exists && !isAdmin(findUser(userId))) await rateLimit('direct', userId, 30, 24 * HOUR);
  withSnapshot(ctx, userId, { threadId: await transact((d) => rules.openDirectThread(d, userId, other)) });
});
on('POST', '/api/threads/:id/messages', async (ctx) => {
  const userId = await need(ctx);
  if (!isAdminThread(ctx.params[0], userId)) requireVerified(userId);
  const b = v.shape(ctx.body, 'poruka', ['text', 'sessionId']);
  const sessionId = b.sessionId == null ? undefined : v.id(b.sessionId, 'termin');
  const text = v.text(b.text ?? '', 'poruka', { max: v.LIMITS.message.max, multiline: true, optional: !!sessionId });
  if (!memoryLimit(`msg:${userId}`, 20, MIN)) throw new ApiError('Šalješ poruke prebrzo. Sačekaj malo.', 429);
  await rateLimit('msg-day', userId, 500, 24 * HOUR);
  const info = await transact((d) => rules.sendMessage(d, userId, ctx.params[0], text, sessionId));
  if (info.kind === 'direct') afterDirectMessage(ctx.params[0], info.memberIds, userId);
  withSnapshot(ctx, userId, null);
});
on('POST', '/api/threads/:id/read', async (ctx) => {
  const userId = await need(ctx);
  empty(ctx);
  await transact((d) => rules.markThreadRead(d, userId, ctx.params[0]));
  withSnapshot(ctx, userId, null);
});

/* Obavještenja */
on('POST', '/api/notifications/read-all', async (ctx) => {
  const userId = await need(ctx);
  empty(ctx);
  await transact((d) => rules.markAllNotificationsRead(d, userId));
  withSnapshot(ctx, userId, null);
});
on('POST', '/api/notifications/:id/read', async (ctx) => {
  const userId = await need(ctx);
  empty(ctx);
  await transact((d) => rules.markNotificationRead(d, userId, ctx.params[0]));
  withSnapshot(ctx, userId, null);
});

/* Admin panel (ADMIN_EMAILS): svi korisnici sa emailovima, izmjena i brisanje. Termine admin vidi iz običnog snimka. */
async function needAdmin(ctx: Ctx): Promise<string> {
  const id = await need(ctx);
  if (!isAdmin(findUser(id))) throw new ApiError('Nemaš pristup.', 403);
  return id;
}

on('GET', '/api/admin/users', async (ctx) => {
  await needAdmin(ctx);
  sendJson(ctx.res, 200, { result: adminUsers() });
});

on('POST', '/api/admin/users/:id', async (ctx) => {
  const adminId = await needAdmin(ctx);
  const target = ctx.params[0];
  const b = v.shape(ctx.body, 'korisnik', ['firstName', 'lastName', 'email', 'city', 'bio', 'verified']);
  const input = {
    firstName: b.firstName === undefined ? undefined : v.personName(b.firstName, 'ime'),
    lastName: b.lastName === undefined ? undefined : v.personName(b.lastName, 'prezime'),
    email: b.email === undefined ? undefined : v.email(b.email),
    city: b.city === undefined ? undefined : v.text(b.city, 'grad', { min: v.LIMITS.city.min, max: v.LIMITS.city.max }),
    bio: b.bio === undefined ? undefined : v.text(b.bio, 'opis', { max: v.LIMITS.bio.max, optional: true }),
    verified: b.verified === undefined ? undefined : v.bool(b.verified, 'potvrđen email'),
  };
  const before = findUser(target);
  if (input.email && before?.email && input.email !== before.email.toLowerCase() && isAdmin(before))
    throw new ApiError('Email admin naloga se ne mijenja ovdje — on je naveden u ADMIN_EMAILS.', 403);
  await transact((d) => rules.adminUpdateUser(d, target, input));
  console.log(`admin: ${adminId} izmijenio nalog ${target}`);
  withSnapshot(ctx, adminId, adminUsers());
});

on('POST', '/api/admin/users/:id/delete', async (ctx) => {
  const adminId = await needAdmin(ctx);
  empty(ctx);
  const target = ctx.params[0];
  if (target === adminId) throw new ApiError('Svoj nalog brišeš u profilu: Uredi profil → Obriši nalog.');
  const u = findUser(target);
  if (!u || rules.isDeletedUser(u)) throw new ApiError('Korisnik ne postoji ili je već obrisan.', 404);
  if (isAdmin(u)) throw new ApiError('Admin nalog se ne može obrisati — prvo ga ukloni iz ADMIN_EMAILS.', 403);
  // Isto kao kad korisnik sam obriše nalog: lični podaci se brišu, budući termini otkazuju, sesije gase
  await transact((d) => rules.deleteAccount(d, target));
  await endAllSessions(target);
  await db().identities.deleteForUser(target);
  await db().tokens.deleteForUser(target);
  console.log(`admin: ${adminId} obrisao nalog ${target}`);
  withSnapshot(ctx, adminId, adminUsers());
});

/* ---------- Dispečer ---------- */

/**
 * Rute koje ne čitaju bazu (samo podešavanja servera). Odgovaraju odmah, i dok se baza tek povezuje
 * (hladan start Vercel funkcije) — inače ekran prijave čeka bazu da bi saznao npr. Turnstile ključ.
 */
export const withoutDb = (pathname: string) => pathname === '/api/auth/providers';

async function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<string> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > limit) throw new ApiError('Zahtjev je prevelik.', 413);
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new ApiError('Zahtjev je prevelik.', 413);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** CSRF: POST samo kao JSON (tačan MIME tip — "text/plain; x=application/json" ne prolazi) i sa našeg sajta. */
function assertSameSiteJson(req: IncomingMessage) {
  const mime = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (mime !== 'application/json') throw new ApiError('Neispravan zahtjev.', 415);
  if (String(req.headers['sec-fetch-site'] ?? '') === 'cross-site') throw new ApiError('Zabranjen pristup.', 403);
  const origin = req.headers.origin;
  if (origin === undefined) return;
  let host = '';
  try {
    host = new URL(origin).host;
  } catch {
    throw new ApiError('Zabranjen pristup.', 403); // npr. "null" iz sandbox iframe-a
  }
  if (host !== req.headers.host && origin !== new URL(config.publicUrl).origin) throw new ApiError('Zabranjen pristup.', 403);
}

export async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const method = req.method ?? 'GET';
  const ip = clientIp(req);
  for (const [k, val] of Object.entries(API_HEADERS)) res.setHeader(k, val);
  try {
    // Grubo ograničenje po IP adresi (preopterećenje jedne instance) — bez upita u bazu
    if (!memoryLimit(`ip:${ip}`, 300, MIN)) throw new ApiError('Previše zahtjeva. Sačekaj malo.', 429);
    const match = routes.find(([m, re]) => m === method && re.test(url.pathname));
    if (!match) throw new ApiError('Ruta ne postoji.', 404);
    const params = (url.pathname.match(match[1]) ?? []).slice(1).map((p) => {
      let decoded: string;
      try {
        decoded = decodeURIComponent(p);
      } catch {
        throw new ApiError('Ruta ne postoji.', 404);
      }
      if (!v.isId(decoded)) throw new ApiError('Ne postoji.', 404); // ID-evi su samo [A-Za-z0-9_-]
      return decoded;
    });
    let body: Record<string, unknown> = {};
    if (method === 'POST') {
      const isAppleCallback = url.pathname === '/api/auth/apple/callback';
      if (!isAppleCallback) assertSameSiteJson(req);
      const raw = await readBody(req);
      if (isAppleCallback) body = { __raw: raw };
      else if (raw.trim()) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new ApiError('Neispravan JSON.', 400);
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ApiError('Neispravan zahtjev.', 400);
        body = parsed as Record<string, unknown>;
      }
    }
    // Da li je druga instanca servera nešto promijenila (Vercel: više funkcija nad istom bazom)
    if (!withoutDb(url.pathname)) await ensureFresh();
    await match[2]({ req, res, url, params, body, ip });
  } catch (e) {
    if (res.headersSent) return void res.end();
    if (e instanceof ApiError) return sendJson(res, e.status, { error: e.message }, e.status === 429 ? { 'Retry-After': '60' } : {});
    console.error(`${method} ${url.pathname}`, e instanceof Error ? e.message : e);
    sendJson(res, 500, { error: 'Greška na serveru. Pokušaj ponovo.' });
  }
}
