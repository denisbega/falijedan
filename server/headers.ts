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
  /** Google AdSense uključen (ADSENSE_CLIENT) — dozvoljava Googleove skripte, iframe-ove reklama i mjerenja */
  ads?: boolean;
}

const TURNSTILE = 'https://challenges.cloudflare.com';

/** Ispravan AdSense publisher ID (ca-pub-…) — inače reklame ostaju isključene. */
export const isAdsenseClient = (v: string | undefined): v is string => /^ca-pub-\d{10,20}$/.test(v?.trim() ?? '');

/** Google AdSense: loader i njegove skripte, iframe-ovi reklama, pikseli/mjerenja i poruka o pristanku (Funding Choices). */
const ADSENSE = {
  script: 'https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.adtrafficquality.google https://fundingchoicesmessages.google.com https://www.googletagservices.com',
  frame: 'https://*.googlesyndication.com https://*.doubleclick.net https://www.google.com https://*.adtrafficquality.google https://fundingchoicesmessages.google.com',
  img: 'https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.google.ba https://*.gstatic.com https://*.adtrafficquality.google',
  connect: 'https://*.googlesyndication.com https://*.doubleclick.net https://*.google.com https://*.google.ba https://*.adtrafficquality.google https://fundingchoicesmessages.google.com',
};

/** Content-Security-Policy za aplikaciju (HTML, JS, service worker). */
export function contentSecurityPolicy(o: HeaderOptions): string {
  const tiles = 'https://server.arcgisonline.com';
  const fonts = 'https://fonts.googleapis.com https://fonts.gstatic.com';
  const extra = (...xs: (string | false | undefined)[]) => xs.filter(Boolean).map((x) => ` ${x}`).join('');
  const frames = [o.turnstile && TURNSTILE, o.ads && ADSENSE.frame].filter(Boolean).join(' ');
  return [
    "default-src 'self'",
    `script-src 'self'${extra(o.turnstile && TURNSTILE, o.ads && ADSENSE.script)}`,
    // framer-motion i Leaflet postavljaju inline style atribute; skripte ostaju striktne
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${tiles}${extra(o.ads && ADSENSE.img)}`,
    // service worker keširá fontove i tile-ove mape (fetch iz SW-a)
    `connect-src 'self' ${tiles} ${fonts}${extra(o.turnstile && TURNSTILE, o.ads && ADSENSE.connect)}`,
    `frame-src ${frames || "'none'"}`,
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
