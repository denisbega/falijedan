/**
 * Validacija ulaza — izvršava je SERVER (rute + pravila); klijent je može koristiti samo za ranije poruke.
 * Pravilo: neispravan ulaz se ODBIJA (400), ne skraćuje se i ne "popravlja" tiho.
 * Tekst se normalizuje (NFC, bez kontrolnih/nevidljivih znakova, sažeti razmaci), HTML se ne prihvata.
 */
import { ApiError } from './errors.ts';

export const LIMITS = {
  name: { min: 2, max: 40 },
  email: { max: 120 },
  password: { min: 8, max: 128 },
  bio: { max: 160 },
  city: { min: 2, max: 60 },
  venue: { min: 3, max: 80 },
  address: { max: 120 },
  message: { max: 1000 },
  comment: { max: 240 },
} as const;

const bad = (field: string, why?: string) => new ApiError(why ?? `Neispravan unos: ${field}.`);

// Kontrolni znakovi (osim \n i \t), zero-width i bidi "override" znakovi (lažiranje teksta)
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
// Izgleda kao HTML tag (i nezatvoren: "<script", "<img src=…") — ne prihvatamo; React ionako escapuje,
// ali takav sadržaj je smeće ili pokušaj napada (i opasan ako se ikad prikaže van Reacta, npr. u emailu).
// Pravi tag nema razmak iza "<" (browser "< b>" ne tretira kao tag) — "a < b i 3 > 2" i "<3" prolaze.
const HTMLISH = /<\/?[a-z!?][^>]*>|<\/?(script|iframe|img|svg|style|object|embed|link|meta|a|body|html|form|input|video|audio|math)\b/i;

export interface TextOpts {
  min?: number;
  max: number;
  multiline?: boolean;
  /** dozvoli prazan string (vraća '') */
  optional?: boolean;
}

/** Čist tekst: string, normalizovan, dužina u granicama, bez HTML-a i kontrolnih znakova. */
export function text(v: unknown, field: string, o: TextOpts): string {
  if (typeof v !== 'string') throw bad(field);
  if (v.length > o.max * 4) throw bad(field, `Polje "${field}" je predugo (najviše ${o.max} znakova).`);
  let s = v.normalize('NFC').replace(INVISIBLE, '');
  if (!o.multiline && /[\r\n]/.test(s)) s = s.replace(/[\r\n]+/g, ' ');
  s = s.replace(/\r\n?/g, '\n');
  if (CONTROL.test(s.replace(/[\n\t]/g, ''))) throw bad(field);
  s = o.multiline ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
  if (!s) {
    if (o.optional) return '';
    throw bad(field, `Polje "${field}" je obavezno.`);
  }
  if (o.min && [...s].length < o.min) throw bad(field, `Polje "${field}" je prekratko (najmanje ${o.min} znaka).`);
  if ([...s].length > o.max) throw bad(field, `Polje "${field}" je predugo (najviše ${o.max} znakova).`);
  if (HTMLISH.test(s)) throw bad(field, `Polje "${field}" ne smije sadržati HTML ili kod.`);
  return s;
}

const NAME_RE = /^[\p{L}\p{M}]+(?:[ '’.-][\p{L}\p{M}]+)*\.?$/u;
/** Ime/prezime: slova (sva pisma), razmak, crtica, apostrof, tačka; 2–40 znakova. */
export function personName(v: unknown, field: string): string {
  const s = text(v, field, { min: LIMITS.name.min, max: LIMITS.name.max });
  if (!NAME_RE.test(s)) throw bad(field, `${field[0].toUpperCase()}${field.slice(1)} smije sadržati samo slova, razmak, crticu i apostrof.`);
  return s;
}

/** Ime iz OAuth-a (Google/Apple) — ne odbija, nego čisti; null ako ništa ne ostane. */
export function sanitizeName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .replace(/<[^>]*>?/g, '') // HTML tagovi se uklanjaju cijeli (ne ostavljaju "b", "script"…)
    .replace(/[^\p{L}\p{M} '’.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.name.max)
    .trim();
  return s.length >= LIMITS.name.min && NAME_RE.test(s) ? s : null;
}

// Praktičan (ne RFC-pun) format: lokalni dio bez razmaka/navodnika, domen sa TLD-om od bar 2 slova
const EMAIL_STRICT = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
export function email(v: unknown): string {
  if (typeof v !== 'string') throw bad('email');
  const s = v.normalize('NFC').trim().toLowerCase();
  if (!s || s.length > LIMITS.email.max || !EMAIL_STRICT.test(s) || s.includes('..') || s.startsWith('.') || s.split('@')[0].endsWith('.'))
    throw bad('email', 'Email adresa nije ispravna.');
  return s;
}

const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', '11223344', 'password', 'password1', 'passw0rd',
  'qwertyui', 'qwerty123', 'qwertzui', 'asdfghjk', 'iloveyou', 'abc12345', 'abcd1234', 'lozinka1', 'lozinka123', 'sifra123', 'šifra123',
  'falijedan', 'fudbal123', 'football', 'sarajevo', 'bijeljina', 'beograd1', 'zagreb12', 'welcome1', 'admin123', 'letmein1',
]);
/** Lozinka za novi nalog: 8–128 znakova, ne smije biti trivijalna ni jednaka emailu. */
export function newPassword(v: unknown, mail?: string): string {
  if (typeof v !== 'string') throw bad('lozinka');
  if (v.length < LIMITS.password.min) throw bad('lozinka', `Lozinka mora imati najmanje ${LIMITS.password.min} znakova.`);
  if (v.length > LIMITS.password.max) throw bad('lozinka', `Lozinka može imati najviše ${LIMITS.password.max} znakova.`);
  const low = v.toLowerCase();
  if (!v.trim() || new Set(v).size < 4 || COMMON_PASSWORDS.has(low) || (mail && (low === mail || low === mail.split('@')[0])))
    throw bad('lozinka', 'Lozinka je previše jednostavna — izaberi težu.');
  return v;
}

/** Lozinka pri prijavi: samo tip i dužina (bez pravila jačine — stari nalozi). */
export function anyPassword(v: unknown): string {
  if (typeof v !== 'string' || !v || v.length > 1024) throw bad('lozinka', 'Pogrešan email ili lozinka.');
  return v;
}

export function num(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw bad(field);
  if (v < min || v > max) throw bad(field, `Vrijednost "${field}" mora biti između ${min} i ${max}.`);
  return v;
}
export function int(v: unknown, field: string, min: number, max: number): number {
  const n = num(v, field, min, max);
  if (!Number.isInteger(n)) throw bad(field);
  return n;
}
export const lat = (v: unknown) => num(v, 'geografska širina', -90, 90);
export const lng = (v: unknown) => num(v, 'geografska dužina', -180, 180);

export function bool(v: unknown, field: string): boolean {
  if (typeof v !== 'boolean') throw bad(field);
  return v;
}

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
/** ID iz baze (u, s, t, m, n…): samo slova, brojevi, _ i -. */
export function id(v: unknown, field: string): string {
  if (typeof v !== 'string' || !ID_RE.test(v)) throw bad(field);
  return v;
}
export const isId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v);

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) throw bad(field);
  return v as T;
}

export function array(v: unknown, field: string, maxItems: number): unknown[] {
  if (!Array.isArray(v)) throw bad(field);
  if (v.length > maxItems) throw bad(field, `Previše stavki u polju "${field}" (najviše ${maxItems}).`);
  return v;
}

/** Objekat sa tačno dozvoljenim poljima — nepoznata polja (mass assignment, __proto__…) se odbijaju. */
export function shape(v: unknown, field: string, allowed: readonly string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad(field);
  for (const k of Object.keys(v)) if (!allowed.includes(k)) throw bad(field, `Nepoznato polje u zahtjevu: ${k.slice(0, 30)}.`);
  return v as Record<string, unknown>;
}

/** Datum/vrijeme u ISO formatu (YYYY-MM-DDTHH:mm…), stvarni datum. */
export function isoDate(v: unknown, field: string): string {
  const m = typeof v === 'string' && v.length <= 40 ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(:(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(v) : null;
  if (!m) throw bad(field);
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[7] ?? '0'].map(Number);
  // V8 je popustljiv ("2026-11-31" → 1. decembar) — provjeravamo stvarne dane u mjesecu i opseg vremena
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth || h > 23 || mi > 59 || s > 59) throw bad(field, 'Datum ili vrijeme ne postoji.');
  const t = Date.parse(v as string);
  if (Number.isNaN(t)) throw bad(field);
  return new Date(t).toISOString();
}
