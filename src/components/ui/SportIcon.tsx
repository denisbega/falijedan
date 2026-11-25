import type { ReactElement, SVGProps } from 'react';
import type { SportId } from '../../lib/types';

/**
 * Sportske ikone nacrtane u Lucide stilu (24×24, stroke 2, zaobljeni krajevi),
 * jer Lucide nema loptu za fudbal, tenis, padel i rukomet.
 */
const paths: Record<SportId, ReactElement> = {
  'mali-fudbal': (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7.2l4.4 3.2-1.7 5.1H9.3l-1.7-5.1z" />
      <path d="M12 7.2V2.3M16.4 10.4l4.6-1.5M14.7 15.5l2.9 3.9M9.3 15.5l-2.9 3.9M7.6 10.4L3 8.9" />
    </>
  ),
  kosarka: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2v20" />
      <path d="M5 4.9c2.7 2.6 2.7 11.6 0 14.2M19 4.9c-2.7 2.6-2.7 11.6 0 14.2" />
    </>
  ),
  odbojka: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M11.1 7.1a16.6 16.6 0 0 1 10.9 4" />
      <path d="M12 12a12.6 12.6 0 0 1-8.7 5" />
      <path d="M16.8 13.6a16.6 16.6 0 0 1-9 7.5" />
      <path d="M20.7 17a12.8 12.8 0 0 0-8.7-5 13.3 13.3 0 0 1 0-10" />
      <path d="M6.3 3.8a16.6 16.6 0 0 0 1.9 11.5" />
    </>
  ),
  padel: (
    <>
      <path d="M10.2 2.5c3.6 0 6.3 2.8 6.3 6.5 0 3.3-2.4 6.2-5.5 6.6l-1.3 1.7-1.5-1.1.9-1.6C6.2 14 4 11.6 4 8.7 4 5.3 6.7 2.5 10.2 2.5z" />
      <path d="M8.2 17.3L4.6 21.9" />
      <circle cx="8.5" cy="7.5" r=".6" fill="currentColor" />
      <circle cx="11.8" cy="7.5" r=".6" fill="currentColor" />
      <circle cx="10.2" cy="10.3" r=".6" fill="currentColor" />
      <circle cx="19" cy="18" r="2.4" />
    </>
  ),
  tenis: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M6 3.9c2.4 2.2 3.8 5 3.8 8.1s-1.4 5.9-3.8 8.1" />
      <path d="M18 3.9c-2.4 2.2-3.8 5-3.8 8.1s1.4 5.9 3.8 8.1" />
    </>
  ),
  rukomet: (
    <>
      <circle cx="14" cy="11" r="7.5" />
      <path d="M14 3.5c-2.2 2.7-2.2 12.3 0 15" />
      <path d="M6.9 8.6c4.6 1.6 9.6 1.6 14.2 0" />
      <path d="M2 14h3.5M3 18h4.5M5.5 21.5h4" />
    </>
  ),
};

export function SportIcon({ sport, className, strokeWidth = 2, ...rest }: { sport: SportId } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'size-5'}
      aria-hidden
      {...rest}
    >
      {paths[sport]}
    </svg>
  );
}
