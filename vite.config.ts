import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { isAdsenseClient } from './server/headers.ts';

const API = process.env.API_URL ?? 'http://localhost:8787';

interface AdsenseConfig {
  client: string;
  slot: string;
  layoutKey: string | null;
}

/**
 * Google AdSense iz env-a (Vercel → Environment Variables, ili .env):
 * - ADSENSE_CLIENT sam → meta tag i ads.txt (Google potvrđuje sajt), reklama još nema;
 * - ADSENSE_CLIENT + ADSENSE_SLOT → i mjesta za reklame u aplikaciji.
 */
function adsenseFromEnv(env: Record<string, string>): { client: string | null; ads: AdsenseConfig | null } {
  const rawClient = env.ADSENSE_CLIENT?.trim();
  const slot = env.ADSENSE_SLOT?.trim();
  const client = isAdsenseClient(rawClient) ? rawClient : null;
  if (rawClient && !client) console.warn('⚠ AdSense je isključen: ADSENSE_CLIENT mora biti Publisher ID oblika "ca-pub-1234567890123456".');
  if (slot && !/^\d{6,20}$/.test(slot)) console.warn('⚠ Reklame su isključene: ADSENSE_SLOT mora biti broj ad unita (AdSense → Ads → By ad unit → data-ad-slot).');
  const ads = client && slot && /^\d{6,20}$/.test(slot) ? { client, slot, layoutKey: env.ADSENSE_LAYOUT_KEY?.trim() || null } : null;
  return { client, ads };
}

/** Meta tag za potvrdu sajta u AdSense-u + ads.txt (Google traži /ads.txt na korijenu domene). */
function adsense(client: string | null): Plugin {
  return {
    name: 'falijedan:adsense',
    transformIndexHtml(html) {
      return client ? html.replace('</head>', `  <meta name="google-adsense-account" content="${client}" />\n  </head>`) : html;
    },
    generateBundle() {
      if (client) this.emitFile({ type: 'asset', fileName: 'ads.txt', source: `google.com, ${client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n` });
    },
  };
}

export default defineConfig(({ mode }) => {
  const { client, ads } = adsenseFromEnv({ ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>);
  return {
    plugins: [react(), tailwindcss(), adsense(client)],
    define: { __ADSENSE__: JSON.stringify(ads) },
    server: {
      host: true,
      port: 5173,
      // API i realtime (SSE) idu na Node server; kolačići ostaju na istoj adresi
      proxy: { '/api': { target: API, changeOrigin: false } },
    },
    build: { chunkSizeWarningLimit: 900 },
  };
});
