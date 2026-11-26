import { useEffect, useRef, useState } from 'react';
import { useMe } from '../../lib/hooks';
import { cn } from '../../lib/utils';

const ADS = __ADSENSE__;

let scriptRequested = false;
function loadAdsenseScript(client: string) {
  if (scriptRequested) return;
  scriptRequested = true;
  const s = document.createElement('script');
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  document.head.appendChild(s);
}

/**
 * Mjesto za Google AdSense reklamu (ADSENSE_CLIENT + ADSENSE_SLOT pri buildu).
 * - Kartica sa oznakom "Reklama" se pojavljuje tek kad Google popuni mjesto: prije odobrenja sajta,
 *   bez reklame za korisnika ili uz blokator reklama ne ostaje prazna kutija.
 * - Adminu se ne prikazuje — klikovi na vlastite reklame krše pravila AdSense-a.
 * `className` (npr. razmak) važi samo za popunjenu reklamu; `span` = preko cijelog reda u gridu.
 */
export function AdSlot({ className, span }: { className?: string; span?: boolean }) {
  const me = useMe();
  const ref = useRef<HTMLModElement>(null);
  const [status, setStatus] = useState<'pending' | 'filled' | 'unfilled'>('pending');
  const enabled = !!ADS && !me?.admin;

  useEffect(() => {
    const ins = ref.current;
    if (!ADS || !enabled || !ins) return;
    loadAdsenseScript(ADS.client);
    const read = () => {
      const s = ins.getAttribute('data-ad-status');
      if (s === 'filled' || s === 'unfilled') setStatus(s);
    };
    const observer = new MutationObserver(read);
    observer.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
    // Svaki <ins> se prijavljuje tačno jednom (AdSense ga označi sa data-adsbygoogle-status)
    if (!ins.hasAttribute('data-adsbygoogle-status')) {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        setStatus('unfilled');
      }
    }
    read();
    return () => observer.disconnect();
  }, [enabled]);

  if (!ADS || !enabled || status === 'unfilled') return null;
  const filled = status === 'filled';
  const format = ADS.layoutKey
    ? { 'data-ad-format': 'fluid', 'data-ad-layout-key': ADS.layoutKey }
    : { 'data-ad-format': 'auto', 'data-full-width-responsive': 'false' };

  return (
    <aside aria-label="Reklama" className={cn(span && 'col-span-full', filled && 'glass-low overflow-hidden rounded-card p-3', filled && className)}>
      {filled && <p className="label-caps mb-2 text-[10px] text-fj-muted">Reklama</p>}
      <ins ref={ref} className="adsbygoogle" style={{ display: 'block', width: '100%' }} data-ad-client={ADS.client} data-ad-slot={ADS.slot} {...format} />
    </aside>
  );
}
