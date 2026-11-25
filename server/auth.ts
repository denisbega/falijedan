/**
 * Autentifikacija: email + lozinka (scrypt), sesije u httpOnly kolačiću,
 * Google i Apple OAuth (aktiviraju se kad su ključevi u .env).
 */
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from './config.ts';
import { findUser, sql, transact } from './engine.ts';
import { createUser, ApiError } from '../src/lib/rules.ts';

const COOKIE = 'fj_session';
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieHeader(value: string, maxAgeSec: number) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${config.cookieSecure ? '; Secure' : ''}`;
}

/* ---------- Sesije ---------- */

export function startSession(req: IncomingMessage, res: ServerResponse, userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + config.sessionDays * 86400000);
  sql()
    .prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)')
    .run(sha(token), userId, now.toISOString(), expires.toISOString(), String(req.headers['user-agent'] ?? '').slice(0, 200));
  res.setHeader('Set-Cookie', cookieHeader(token, config.sessionDays * 86400));
}

export function currentUserId(req: IncomingMessage): string | null {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const row = sql().prepare('SELECT user_id, expires_at FROM auth_sessions WHERE token_hash = ?').get(sha(token)) as { user_id: string; expires_at: string } | undefined;
  if (!row || row.expires_at < new Date().toISOString()) return null;
  return findUser(row.user_id) ? row.user_id : null;
}

export function endSession(req: IncomingMessage, res: ServerResponse) {
  const token = parseCookies(req)[COOKIE];
  if (token) sql().prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(sha(token));
  res.setHeader('Set-Cookie', cookieHeader('', 0));
}

export function purgeExpiredSessions() {
  sql().prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(new Date().toISOString());
}

/* ---------- Ograničenje pokušaja (brute force) ---------- */

const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  if (++b.count > max) throw new ApiError('Previše pokušaja. Sačekaj malo pa pokušaj ponovo.', 429);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60000).unref();

/* ---------- OAuth ---------- */

const states = new Map<string, { provider: 'google' | 'apple'; expires: number }>();
function newState(provider: 'google' | 'apple') {
  const state = crypto.randomBytes(18).toString('base64url');
  states.set(state, { provider, expires: Date.now() + 10 * 60000 });
  return state;
}
function takeState(state: string | null, provider: 'google' | 'apple') {
  const s = state ? states.get(state) : undefined;
  if (state) states.delete(state);
  if (!s || s.provider !== provider || s.expires < Date.now()) throw new ApiError('Prijava je istekla — pokušaj ponovo.', 400);
}

const callbackUrl = (p: 'google' | 'apple') => `${config.publicUrl}/api/auth/${p}/callback`;

export function googleAuthUrl() {
  const q = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: callbackUrl('google'),
    response_type: 'code',
    scope: 'openid email profile',
    state: newState('google'),
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export async function googleCallback(params: URLSearchParams) {
  takeState(params.get('state'), 'google');
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
  const info = (await infoRes.json()) as { sub: string; email?: string; email_verified?: boolean; given_name?: string; family_name?: string; picture?: string };
  if (!info.email || info.email_verified === false) throw new ApiError('Google nalog nema potvrđen email.');
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

export function appleAuthUrl() {
  const q = new URLSearchParams({
    client_id: config.apple.clientId,
    redirect_uri: callbackUrl('apple'),
    response_type: 'code',
    response_mode: 'form_post',
    scope: 'name email',
    state: newState('apple'),
  });
  return `https://appleid.apple.com/auth/authorize?${q}`;
}

export async function appleCallback(form: URLSearchParams) {
  takeState(form.get('state'), 'apple');
  const code = form.get('code');
  if (!code) throw new ApiError('Apple prijava je otkazana.');
  const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.apple.clientId, client_secret: appleClientSecret(), code, grant_type: 'authorization_code', redirect_uri: callbackUrl('apple') }),
  });
  if (!tokenRes.ok) throw new ApiError('Apple prijava nije uspjela.');
  const { id_token } = (await tokenRes.json()) as { id_token: string };
  // id_token stiže direktno od Apple-a preko TLS-a (server-server), pa je dovoljno pročitati payload
  const payload = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64url').toString()) as { sub: string; email?: string };
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

/** Pronalazi ili kreira korisnika za OAuth identitet (veže se i za postojeći nalog sa istim emailom). */
function linkIdentity(provider: 'google' | 'apple', subject: string, email: string | undefined, first?: string, last?: string): string {
  const db = sql();
  const existing = db.prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?').get(provider, subject) as { user_id: string } | undefined;
  if (existing && findUser(existing.user_id)) return existing.user_id;
  if (!email) throw new ApiError('Nalog nema email adresu.');
  const userId = transact((d) => {
    const byEmail = d.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (byEmail) return byEmail.id;
    const fallback = email.split('@')[0].replace(/[._\d]+/g, ' ').trim() || 'Igrač';
    return createUser(d, { firstName: first || fallback, lastName: last || '', email, passwordHash: null, relaxed: true });
  });
  db.prepare('INSERT OR REPLACE INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)').run(provider, subject, userId, new Date().toISOString());
  return userId;
}
