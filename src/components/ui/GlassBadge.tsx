import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { missingBadge } from '../../lib/format';
import type { SessionView } from '../../lib/types';

export type BadgeTone = 'green' | 'neutral' | 'amber' | 'red';

const tones: Record<BadgeTone, string> = {
  green: 'bg-[rgba(32,196,90,0.14)] text-fj-green border-[rgba(32,196,90,0.38)]',
  neutral: 'bg-white/[0.06] text-fj-text-2 border-white/[0.12]',
  amber: 'bg-[rgba(232,176,74,0.12)] text-fj-warning border-[rgba(232,176,74,0.38)]',
  red: 'bg-[rgba(240,96,90,0.12)] text-fj-error border-[rgba(240,96,90,0.38)]',
};

export function GlassBadge({
  tone = 'green',
  dot,
  pulse,
  icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  pulse?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-extrabold uppercase tracking-[1px]',
        tones[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full bg-current', pulse && 'pulse-dot')} />}
      {icon}
      {children}
    </span>
  );
}

/** Jedinstvena logika statusne značke termina — koristi se svuda isto. */
export function SessionBadge({ s, personal = false, short = false }: { s: SessionView; personal?: boolean; short?: boolean }) {
  if (s.status === 'cancelled') return <GlassBadge tone="red">Otkazano</GlassBadge>;
  if (s.status === 'finished') return <GlassBadge tone="neutral">Završeno</GlassBadge>;
  if (personal) {
    if (s.startsSoon && (s.myStatus === 'confirmed' || s.isMine)) return <GlassBadge tone="amber" dot>Uskoro počinje</GlassBadge>;
    if (s.myStatus === 'waitlist') return <GlassBadge tone="neutral">Lista čekanja #{s.waitlistPosition}</GlassBadge>;
    if (s.isMine && s.missing > 0) return <GlassBadge tone="green" dot pulse>{short ? missingBadge(s.missing).replace(' još', '') : missingBadge(s.missing)}</GlassBadge>;
    if (s.myStatus === 'confirmed' || s.isMine)
      return (
        <GlassBadge tone="green" icon={<Check className="size-3" strokeWidth={3} aria-hidden />}>
          Potvrđeno
        </GlassBadge>
      );
  }
  if (s.status === 'full') return <GlassBadge tone="neutral">Popunjeno</GlassBadge>;
  return (
    <GlassBadge tone="green" dot pulse>
      {short ? missingBadge(s.missing).replace(' još', '') : missingBadge(s.missing)}
    </GlassBadge>
  );
}
