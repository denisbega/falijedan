/**
 * Autentifikacija: email + lozinka (scrypt), sesije u httpOnly kolačiću,
 * Google i Apple OAuth (aktiviraju se kad su ključevi u .env).
 */
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from './config.ts';
import { db, findUser, transact } from './engine.ts';
import { createUser, ApiError } from '../src/lib/rules.ts';
import { sanitizeName } from '../src/lib/validation.ts';
import { DEMO_USER_ID } from '../src/lib/seed.ts';

const SECURE = config.cookieSecure;
// __Host- prefiks (samo na https): kolačić se ne može postaviti sa poddomena niti bez Secure/Path=/
const COOKIE = SECURE ? '__Host-fj_session' : 'fj_session';
const LEGACY_COOKIE = 'fj_session';
const OAUTH_COOKIE = SECURE ? '__Host-fj_oauth' : 'fj_oauth';
export const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const raw = part.slice(i + 1).trim();
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(raw);
    } catch {
      out[part.slice(0, i).trim()] = raw; // tuđi kolačić sa neispravnim % ne smije srušiti zahtjev
    }
  }
  return out;
}

const cookie = (name: string, value: string, maxAgeSec: number, sameSite: 'Lax' | 'None' = 'Lax') =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAgeSec}${SECURE || sameSite === 'None' ? '; Secure' : ''}`;

/** Dodaje Set-Cookie (ne briše kolačiće koje je isti odgovor već postavio). */
function addCookie(res: ServerResponse, ...values: string[]) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [String(prev)] : []), ...values]);
}

function sessionToken(req: IncomingMessage): string | null {
  const c = parseCookies(req);
  const t = c[COOKIE] ?? c[LEGACY_COOKIE];
  return t && /^[A-Za-z0-9_-]{20,100}$/.test(t) ? t : null;
}

/* ---------- Sesije ---------- */

/** Kratki keš sesija (stalni server). Serverless (više instanci): bez keša, da odjava odmah važi svuda. */
const sessionCache = new Map<string, { userId: string; expiresAt: string; cachedAt: number }>();
const CACHE_MS = config.serverless ? 0 : 60000;

export async function startSession(req: IncomingMessage, res: ServerResponse, userId: string) {
  // Rotacija: stara sesija iz ovog browsera (ako postoji) se ukida — nema "session fixation"
  const old = sessionToken(req);
  if (old) {
    sessionCache.delete(sha(old));
    await db().sessions.delete(sha(old));
  }
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + config.sessionDays * 86400000);
  await db().sessions.create({ tokenHash: sha(token), userId, createdAt: now.toISOString(), expiresAt: expires.toISOString(), userAgent: String(req.headers['user-agent'] ?? '').slice(0, 200) });
  addCookie(res, cookie(COOKIE, token, config.sessionDays * 86400));
  if (COOKIE !== LEGACY_COOKIE) addCookie(res, cookie(LEGACY_COOKIE, '', 0));
}

export async function currentUserId(req: IncomingMessage): Promise<string | null> {
  const token = sessionToken(req);
  if (!token) return null;
  const hash = sha(token);
  let row = sessionCache.get(hash);
  if (!row || Date.now() - row.cachedAt >= CACHE_MS) {
    const found = await db().sessions.find(hash);
    if (!found) {
      sessionCache.delete(hash);
      return null;
    }
    row = { ...found, cachedAt: Date.now() };
    sessionCache.set(hash, row);
  }
  if (row.expiresAt < new Date().toISOString()) return null;
  // Demo nalog (javna lozinka) ne smije raditi kad demo režim nije uključen (npr. produkcija sa starim demo podacima)
  if (!config.demo && row.userId === DEMO_USER_ID) return null;
  const user = findUser(row.userId);
  return user && user.email ? row.userId : null; // obrisan nalog (bez emaila) nema pristup
}

export async function endSession(req: IncomingMessage, res: ServerResponse) {
  const token = sessionToken(req);
  if (token) {
    sessionCache.delete(sha(token));
    await db().sessions.delete(sha(token));
  }
  addCookie(res, cookie(COOKIE, '', 0));
  if (COOKIE !== LEGACY_COOKIE) addCookie(res, cookie(LEGACY_COOKIE, '', 0));
}

/** Odjava korisnika sa svih uređaja (brisanje naloga, preuzimanje naloga preko OAuth-a). */
export async function endAllSessions(userId: string) {
  for (const [k, v] of sessionCache) if (v.userId === userId) sessionCache.delete(k);
  await db().sessions.deleteForUser(userId);
}

export async function purgeExpiredSessions() {
  const now = new Date().toISOString();
  for (const [k, v] of sessionCache) if (v.expiresAt < now || Date.now() - v.cachedAt > CACHE_MS) sessionCache.delete(k);
  await db().sessions.purgeExpired(now);
}

/* ---------- Povjerljivi uređaji (zaštita od zaključavanja tuđeg naloga) ---------- */

/**
 * Nakon uspješne prijave browser dobija dugotrajan kolačić "uređaja". Pri prijavi sa takvog uređaja važi
 * poseban limit po uređaju, pa napadač koji pogađa lozinku sa drugih adresa ne može zaključati vlasnika
 * na njegovom telefonu/računaru (OWASP "device cookies"). Sa novog uređaja važi limit po nalogu.
 */
const DEVICE_COOKIE = SECURE ? '__Host-fj_device' : 'fj_device';
const DEVICE_DAYS = 365;

/** Heš tokena uređaja ako je ovaj browser povjerljiv za datog korisnika, inače null. */
export async function trustedDevice(req: IncomingMessage, userId: string): Promise<string | null> {
  const token = parseCookies(req)[DEVICE_COOKIE];
  if (!token || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const hash = sha(token);
  return (await db().tokens.find(hash, 'device')) === userId ? hash : null;
}

export async function trustDevice(req: IncomingMessage, res: ServerResponse, userId: string) {
  if (await trustedDevice(req, userId)) return;
  const token = crypto.randomBytes(32).toString('base64url');
  await db().tokens.create(sha(token), userId, 'device', Date.now() + DEVICE_DAYS * 86400000);
  addCookie(res, cookie(DEVICE_COOKIE, token, DEVICE_DAYS * 86400));
}

/* ---------- Jednokratni email tokeni (potvrda emaila, reset lozinke) ---------- */

/** Novi token (u bazi samo heš); prethodni tokeni iste namjene za tog korisnika se poništavaju. */
export async function newEmailToken(userId: string, purpose: 'verify' | 'reset', ttlMs: number): Promise<string> {
  await db().tokens.deleteForUser(userId, purpose);
  const token = crypto.randomBytes(32).toString('base64url');
  await db().tokens.create(sha(token), userId, purpose, Date.now() + ttlMs);
  return token;
}

/** Provjeri token bez trošenja (npr. da se lozinka validira prije nego što se link iskoristi). */
export async function peekEmailToken(token: unknown, purpose: 'verify' | 'reset'): Promise<string | null> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return db().tokens.find(sha(token), purpose);
}

/** Iskoristi token (jednokratno); vraća korisnika ili null ako je token nevažeći/istekao. */
export async function useEmailToken(token: unknown, purpose: 'verify' | 'reset'): Promise<string | null> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  return db().tokens.take(sha(token), purpose);
}

/* ---------- Ograničenje pokušaja ---------- */

/**
 * Brojač u bazi — važi za sve instance servera (Vercel). Ključ je heš (IP adrese i emailovi se ne čuvaju u bazi).
 * Baca 429 kad se pređe `max` pokušaja u prozoru.
 */
export async function rateLimit(kind: string, value: string, max: number, windowMs: number, message = 'Previše pokušaja. Sačekaj malo pa pokušaj ponovo.') {
  if (!(await underLimit(kind, value, max, windowMs))) throw new ApiError(message, 429);
}

/** Isto brojanje kao rateLimit, ali bez greške: true = još ima mjesta (i ovaj pokušaj je ubrojan). */
export async function underLimit(kind: string, value: string, max: number, windowMs: number): Promise<boolean> {
  return (await db().rateLimit.hit(`${kind}:${sha(`${kind}|${value}`).slice(0, 40)}`, windowMs)) <= max;
}

/** Jeftino ograničenje u memoriji (zaštita od preopterećenja jedne instance) — bez upita u bazu. */
const buckets = new Map<string, { count: number; reset: number }>();
export function memoryLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    if (buckets.size > 50000) buckets.clear(); // ograniči memoriju
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  return ++b.count <= max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60000).unref();

/* ---------- OAuth ---------- */

/**
 * "state" se čuva u bazi (callback može stići na drugu instancu) I u kolačiću ovog browsera:
 * callback se prihvata samo ako se oba poklapaju — napadač ne može "ubaciti" svoj Google nalog žrtvi (login CSRF).
 * Apple vraća korisnika POST-om sa drugog sajta, pa kolačić mora biti SameSite=None (samo preko https).
 */
async function newState(res: ServerResponse, provider: 'google' | 'apple') {
  const state = crypto.randomBytes(24).toString('base64url');
  await db().oauthStates.create(state, provider, Date.now() + 10 * 60000);
  addCookie(res, cookie(OAUTH_COOKIE, state, 600, SECURE ? 'None' : 'Lax'));
  return state;
}
async function takeState(req: IncomingMessage, res: ServerResponse, state: string | null, provider: 'google' | 'apple') {
  const bound = parseCookies(req)[OAUTH_COOKIE] ?? '';
  addCookie(res, cookie(OAUTH_COOKIE, '', 0, SECURE ? 'None' : 'Lax'));
  const same = !!state && bound.length === state.length && crypto.timingSafeEqual(Buffer.from(bound), Buffer.from(state));
  const found = state ? await db().oauthStates.take(state) : null;
  if (!same || found !== provider) throw new ApiError('Prijava je istekla — pokušaj ponovo.', 400);
}

const callbackUrl = (p: 'google' | 'apple') => `${config.publicUrl}/api/auth/${p}/callback`;

export async function googleAuthUrl(res: ServerResponse) {
  const q = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: callbackUrl('google'),
    response_type: 'code',
    scope: 'openid email profile',
    state: await newState(res, 'google'),
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export async function googleCallback(req: IncomingMessage, res: ServerResponse, params: URLSearchParams) {
  await takeState(req, res, params.get('state'), 'google');
  const code = params.get('code');
  if (!code) throw new ApiError('Google prijava je otkazana.');
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: config.google.clientId, client_secret: config.google.clientSecret, redirect_uri: callbackUrl('google'), grant_type: 'authorization_code' }),
  });
  if (!tokenRes.ok) throw new ApiError('Google prijava nije uspjela.');
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${access_token}` } });
  if (!infoRes.ok) throw new ApiError('Google profil nije dostupan.');
  const info = (await infoRes.json()) as { sub: string; email?: string; email_verified?: boolean; given_name?: string; family_name?: string };
  if (!info.sub || !info.email || info.email_verified !== true) throw new ApiError('Google nalog nema potvrđen email.');
  return linkIdentity('google', info.sub, info.email, info.given_name, info.family_name);
}

function appleClientSecret() {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'ES256', kid: config.apple.keyId });
  const body = enc({ iss: config.apple.teamId, iat: now, exp: now + 3600, aud: 'https://appleid.apple.com', sub: config.apple.clientId });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: config.apple.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${sig.toString('base64url')}`;
}

export async function appleAuthUrl(res: ServerResponse) {
  const q = new URLSearchParams({
    client_id: config.apple.clientId,
    redirect_uri: callbackUrl('apple'),
    response_type: 'code',
    response_mode: 'form_post',
    scope: 'name email',
    state: await newState(res, 'apple'),
  });
  return `https://appleid.apple.com/auth/authorize?${q}`;
}

export async function appleCallback(req: IncomingMessage, res: ServerResponse, form: URLSearchParams) {
  await takeState(req, res, form.get('state'), 'apple');
  const code = form.get('code');
  if (!code) throw new ApiError('Apple prijava je otkazana.');
  const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.apple.clientId, client_secret: appleClientSecret(), code, grant_type: 'authorization_code', redirect_uri: callbackUrl('apple') }),
  });
  if (!tokenRes.ok) throw new ApiError('Apple prijava nije uspjela.');
  const { id_token } = (await tokenRes.json()) as { id_token: string };
  // id_token stiže direktno od Apple-a preko TLS-a (server-server); ipak provjeravamo izdavaoca, primaoca i rok
  const payload = JSON.parse(Buffer.from(String(id_token).split('.')[1] ?? '', 'base64url').toString()) as { iss?: string; aud?: string; exp?: number; sub?: string; email?: string };
  if (payload.iss !== 'https://appleid.apple.com' || payload.aud !== config.apple.clientId || !payload.sub || (payload.exp ?? 0) * 1000 < Date.now())
    throw new ApiError('Apple prijava nije uspjela.');
  let first: string | undefined;
  let last: string | undefined;
  try {
    const u = JSON.parse(form.get('user') ?? '{}') as { name?: { firstName?: string; lastName?: string } };
    first = u.name?.firstName;
    last = u.name?.lastName;
  } catch {
    /* ime šalje samo pri prvoj prijavi */
  }
  return linkIdentity('apple', payload.sub, payload.email, first, last);
}

/**
 * Pronalazi ili kreira korisnika za OAuth identitet (email je potvrdio Google/Apple).
 * Ako već postoji nalog sa tim emailom koji NIJE potvrđen (registracija lozinkom, bez provjere emaila),
 * vlasnik emaila preuzima nalog: lozinka se briše i sve postojeće sesije se ukidaju — tako neko ko je
 * unaprijed registrovao tuđi email ne može zadržati pristup (account pre-hijacking).
 */
export async function linkIdentity(provider: 'google' | 'apple', subject: string, email: string | undefined, first?: string, last?: string): Promise<string> {
  const existing = await db().identities.find(provider, subject);
  if (existing && findUser(existing)?.email) return existing;
  if (!email) throw new ApiError('Nalog nema email adresu.');
  const mail = email.trim().toLowerCase();
  const { userId, takenOver } = await transact((d) => {
    const byEmail = d.users.find((u) => u.email?.toLowerCase() === mail);
    if (byEmail) {
      const takenOver = !byEmail.verified && !!byEmail.passwordHash;
      if (takenOver) byEmail.passwordHash = null;
      byEmail.verified = true;
      return { userId: byEmail.id, takenOver };
    }
    const fallback = sanitizeName(mail.split('@')[0].replace(/[._\d+-]+/g, ' ')) ?? 'Igrač';
    const id = createUser(d, { firstName: sanitizeName(first) ?? fallback, lastName: sanitizeName(last) ?? '', email: mail, passwordHash: null, verified: true, relaxed: true });
    return { userId: id, takenOver: false };
  });
  if (takenOver) await endAllSessions(userId);
  await db().identities.upsert(provider, subject, userId);
  return userId;
}
