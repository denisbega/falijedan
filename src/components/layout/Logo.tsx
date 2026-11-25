import { Link } from 'react-router';
import { cn } from '../../lib/utils';

/** Horizontalni lockup: znak (F + 1) + "FaliJedan" wordmark iz priloženog logotipa. */
export function Logo({ compact, className, to = '/' }: { compact?: boolean; className?: string; to?: string }) {
  return (
    <Link to={to} aria-label="FaliJedan — početna" className={cn('inline-flex min-h-11 items-center gap-2.5', className)}>
      <img src="/brand/znak.png" alt="" width={259} height={200} className="h-8 w-auto drop-shadow-[0_4px_14px_rgba(32,196,90,0.25)]" />
      {!compact && <img src="/brand/wordmark.png" alt="" width={722} height={96} className="h-[17px] w-auto" />}
    </Link>
  );
}

/** Puni logotip (znak + natpis + potez) za splash, prijavu i onboarding. */
export function FullLogo({ className }: { className?: string }) {
  return <img src="/brand/logo.png" alt="FaliJedan" width={720} height={495} className={cn('h-auto', className)} />;
}
