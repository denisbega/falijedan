/**
 * API klijent — svaka akcija ide na server (server/routes.ts), koji provodi pravila
 * i vraća svjež snimak podataka. Komponente koriste samo ove funkcije.
 */
import type { AdminUser, DB } from './types';
import { store } from './store';
import type { CreateSessionInput, RatingEntry, SportProfileInput } from './rules';

export { validateSessionInput } from './rules';
export type { CreateSessionInput, RatingEntry, SportProfileInput };

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T = null>(path: string, body: unknown = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Nema veze sa serverom. Provjeri internet i pokušaj ponovo.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as { result?: T; db?: DB; error?: string };
  if (!res.ok) {
    if (res.status === 401 && store.get().currentUserId) store.setLoggedOut();
    throw new ApiError(data.error ?? 'Greška na serveru. Pokušaj ponovo.', res.status);
  }
  if (data.db) store.set(data.db, res.headers.get('ETag'));
  return data.result as T;
}

/* ============================ AUTH ============================ */

export interface Providers {
  google: boolean;
  apple: boolean;
  demo: boolean;
  /** 'sse' = stalni server sa realtime vezom; 'poll' = serverless (Vercel) */
  realtime?: 'sse' | 'poll';
  /** Cloudflare Turnstile (zaštita registracije od botova), ako je uključen */
  turnstileSiteKey?: string | null;
  /** Potvrda emaila je obavezna (slanje emaila je podešeno) */
  emailVerification?: boolean;
  /** "Zaboravljena lozinka" je dostupna */
  passwordReset?: boolean;
}
export async function getProviders(): Promise<Providers> {
  try {
    const res = await fetch('/api/auth/providers');
    if (res.ok) return (await res.json()) as Providers;
  } catch {
    /* server nedostupan */
  }
  return { google: false, apple: false, demo: false };
}

export const signUp = (input: { firstName: string; lastName: string; email: string; password: string; turnstileToken?: string }) => call('/api/auth/register', input);
export const signIn = (email: string, password: string) => call('/api/auth/login', { email, password });
export const signInDemo = () => call('/api/auth/demo');
/** Google / Apple: preusmjerenje na OAuth (server vraća korisnika nazad u aplikaciju). */
export function signInWithProvider(provider: 'google' | 'apple') {
  window.location.href = `/api/auth/${provider}`;
}
export async function signOut() {
  try {
    await call('/api/auth/logout');
  } finally {
    store.setLoggedOut();
  }
}

/* ============================ EMAIL: POTVRDA I NOVA LOZINKA ============================ */

export const verifyEmail = (token: string) => call<{ verified: boolean }>('/api/auth/verify', { token });
export const resendVerification = () => call<{ sent: boolean; verified?: boolean }>('/api/auth/verify/resend');
export const forgotPassword = (email: string) => call<{ sent: boolean }>('/api/auth/forgot', { email });
export const resetPassword = (token: string, password: string) => call<{ userId: string }>('/api/auth/reset', { token, password });

/* ============================ NALOG ============================ */

/** Preuzimanje svih ličnih podataka (JSON fajl). */
export function downloadMyData() {
  window.location.href = '/api/account/export';
}
/** Trajno brisanje naloga (lozinka je obavezna za naloge sa lozinkom). */
export async function deleteAccount(input: { password?: string; confirm: string }) {
  await call('/api/account/delete', input);
  store.setLoggedOut();
}

export const saveProfile = (input: {
  firstName?: string;
  lastName?: string;
  bio?: string;
  sports?: SportProfileInput[];
  city?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  completeOnboarding?: boolean;
}) => call('/api/profile', input);

/* ============================ TERMINI ============================ */

export const joinSession = (sessionId: string, opts: { waitlist?: boolean } = {}) =>
  call<{ status: 'confirmed' | 'waitlist'; missing: number }>(`/api/sessions/${encodeURIComponent(sessionId)}/join`, { waitlist: !!opts.waitlist });
export const leaveSession = (sessionId: string) => call(`/api/sessions/${encodeURIComponent(sessionId)}/leave`);
export const createSession = (input: CreateSessionInput) => call<{ id: string; notified: number }>('/api/sessions', input);
export const cancelSession = (sessionId: string) => call(`/api/sessions/${encodeURIComponent(sessionId)}/cancel`);
export const removePlayer = (sessionId: string, userId: string) => call(`/api/sessions/${encodeURIComponent(sessionId)}/remove`, { userId });
export const submitRatings = (sessionId: string, entries: RatingEntry[]) => call(`/api/sessions/${encodeURIComponent(sessionId)}/ratings`, { entries });
export const inviteToSession = async (userId: string, sessionId: string) =>
  (await call<{ threadId: string }>(`/api/sessions/${encodeURIComponent(sessionId)}/invite`, { userId })).threadId;

/* ============================ PORUKE ============================ */

export const openDirectThread = async (userId: string) => (await call<{ threadId: string }>('/api/threads/direct', { userId })).threadId;
export const sendMessage = (threadId: string, text: string, sessionId?: string) => call(`/api/threads/${encodeURIComponent(threadId)}/messages`, { text, sessionId });

export function markThreadRead(threadId: string) {
  const d = store.get();
  const me = d.currentUserId;
  if (!me) return;
  const last = d.messages.filter((m) => m.threadId === threadId).at(-1);
  const read = d.reads[`${threadId}:${me}`];
  if (!last || (read && read >= last.createdAt)) return;
  void call(`/api/threads/${encodeURIComponent(threadId)}/read`).catch(() => undefined);
}

/* ============================ ADMIN ============================ */

export async function getAdminUsers(): Promise<AdminUser[]> {
  let res: Response;
  try {
    res = await fetch('/api/admin/users', { credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new ApiError('Nema veze sa serverom. Provjeri internet i pokušaj ponovo.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as { result?: AdminUser[]; error?: string };
  if (!res.ok) throw new ApiError(data.error ?? 'Greška na serveru. Pokušaj ponovo.', res.status);
  return data.result ?? [];
}
export const adminUpdateUser = (userId: string, input: { firstName?: string; lastName?: string; email?: string; city?: string; bio?: string; verified?: boolean }) =>
  call<AdminUser[]>(`/api/admin/users/${encodeURIComponent(userId)}`, input);
export const adminDeleteUser = (userId: string) => call<AdminUser[]>(`/api/admin/users/${encodeURIComponent(userId)}/delete`);

/* ============================ OBAVJEŠTENJA ============================ */

export function markNotificationRead(id: string) {
  const n = store.get().notifications.find((x) => x.id === id);
  if (!n || n.read) return;
  void call(`/api/notifications/${encodeURIComponent(id)}/read`).catch(() => undefined);
}
export const markAllNotificationsRead = () => call('/api/notifications/read-all');
