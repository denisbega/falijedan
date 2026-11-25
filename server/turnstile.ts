/**
 * Cloudflare Turnstile (opciono, besplatno) — zaštita registracije od botova.
 * Uključuje se postavljanjem TURNSTILE_SITE_KEY i TURNSTILE_SECRET_KEY; bez njih se provjera preskače.
 */
import { config } from './config.ts';
import { ApiError } from '../src/lib/rules.ts';

export async function verifyTurnstile(token: unknown, ip: string) {
  if (!config.turnstile.secretKey) return;
  if (typeof token !== 'string' || !token || token.length > 2048) throw new ApiError('Potvrdi da nisi robot (polje ispod lozinke).');
  let ok = false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: config.turnstile.secretKey, response: token, ...(ip && ip !== 'unknown' ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    ok = ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    throw new ApiError('Provjera protiv botova trenutno nije dostupna. Pokušaj ponovo.', 503);
  }
  if (!ok) throw new ApiError('Provjera protiv botova nije uspjela — pokušaj ponovo.');
}
