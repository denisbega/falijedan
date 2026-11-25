/**
 * Sigurnosna HTTP zaglavlja — jedno mjesto za stalni server (server/index.ts, server/routes.ts)
 * i Vercel (scripts/build-vercel.mjs upisuje ih u .vercel/output/config.json).
 * Bez importa iz ostatka servera, da ga build skripta može učitati samostalno.
 */

export interface HeaderOptions {
  /** https → HSTS i upgrade-insecure-requests */
  https: boolean;
  /** Cloudflare Turnstile uključen (script + iframe sa challenges.cloudflare.com) */
  turnstile: boolean;
}

const TURNSTILE = 'https://challenges.cloudflare.com';

/** Content-Security-Policy za aplikaciju (HTML, JS, service worker). */
export function contentSecurityPolicy(o: HeaderOptions): string {
  const tiles = 'https://server.arcgisonline.com';
  const fonts = 'https://fonts.googleapis.com https://fonts.gstatic.com';
  return [
    "default-src 'self'",
    `script-src 'self'${o.turnstile ? ` ${TURNSTILE}` : ''}`,
    // framer-motion i Leaflet postavljaju inline style atribute; skripte ostaju striktne
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${tiles}`,
    // service worker keširá fontove i tile-ove mape (fetch iz SW-a)
    `connect-src 'self' ${tiles} ${fonts}${o.turnstile ? ` ${TURNSTILE}` : ''}`,
    `frame-src ${o.turnstile ? TURNSTILE : "'none'"}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "manifest-src 'self'",
    "worker-src 'self'",
    ...(o.https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

const common = (o: HeaderOptions): Record<string, string> => ({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  ...(o.https ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' } : {}),
});

/** Zaglavlja za statične fajlove (HTML/JS/CSS/SW). */
export const staticHeaders = (o: HeaderOptions): Record<string, string> => ({ ...common(o), 'Content-Security-Policy': contentSecurityPolicy(o) });

/** Zaglavlja za API odgovore (JSON) — API ne služi HTML, pa je CSP maksimalno restriktivan. */
export const apiHeaders = (o: HeaderOptions): Record<string, string> => ({
  ...common(o),
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
});
