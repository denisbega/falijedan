/** Google AdSense (vite.config.ts → define, iz ADSENSE_* pri buildu); null = reklame su isključene. */
declare const __ADSENSE__: { client: string; slot: string; layoutKey: string | null } | null;

interface Window {
  adsbygoogle?: unknown[];
}
