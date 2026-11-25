/**
 * Lozinke: scrypt (memorijski zahtjevan KDF, ugrađen u Node — bez dodatnih zavisnosti).
 * Parametri N=2^15, r=8, p=3 odgovaraju OWASP preporuci (ekvivalent N=2^17, r=8, p=1), ~32 MB i ~0,2 s po hešu.
 * Format: scrypt$N$r$p$salt$hash (base64url). Stari heševi (slabiji parametri) se nadograđuju pri prijavi.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, keylen: number, opts: crypto.ScryptOptions) => Promise<Buffer>;
const N = 2 ** 15;
const R = 8;
const P = 3;
const KEYLEN = 64;
const MAXMEM = 96 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

function parse(stored: string | null | undefined) {
  if (!stored?.startsWith('scrypt$')) return null;
  const [, n, r, p, saltB64, hashB64] = stored.split('$');
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  // Samo razumni parametri (heš je iz naše baze, ali ne vjerujemo slijepo ni njoj)
  if (![params.N, params.r, params.p].every(Number.isInteger) || params.N < 2 ** 10 || params.N > 2 ** 17 || params.r < 1 || params.r > 16 || params.p < 1 || params.p > 16) return null;
  if (!saltB64 || !hashB64) return null;
  return { params, salt: Buffer.from(saltB64, 'base64url'), hash: Buffer.from(hashB64, 'base64url') };
}

let dummy: Promise<string> | null = null;

/**
 * Provjera lozinke u konstantnom vremenu. Ako nalog ne postoji (stored = null), ipak se računa scrypt
 * nad lažnim hešom — da se po vremenu odgovora ne može otkriti koji emailovi imaju nalog.
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parsed = parse(stored);
  if (!parsed) {
    dummy ??= hashPassword(crypto.randomBytes(16).toString('hex'));
    const d = parse(await dummy)!;
    await scrypt(password, d.salt, d.hash.length, { ...d.params, maxmem: MAXMEM });
    return false;
  }
  const actual = await scrypt(password, parsed.salt, parsed.hash.length, { ...parsed.params, maxmem: MAXMEM });
  return actual.length === parsed.hash.length && crypto.timingSafeEqual(actual, parsed.hash);
}

/** Da li heš koristi starije (slabije) parametre — tada ga pri uspješnoj prijavi zamijenimo novim. */
export function needsRehash(stored: string | null | undefined): boolean {
  const p = parse(stored);
  return !!p && (p.params.N !== N || p.params.r !== R || p.params.p !== P);
}
