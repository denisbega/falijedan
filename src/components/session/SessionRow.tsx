import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { dateBlock, formatDistance, relativeDay, timeHM } from '../../lib/format';
import { getSport } from '../../lib/sports';
import type { SessionView } from '../../lib/types';
import { SessionBadge, SportIcon } from '../ui';

export function DateBlock({ iso, className }: { iso: string; className?: string }) {
  const { dow, day } = dateBlock(iso);
  return (
    <span className={cn('grid h-14 w-[52px] shrink-0 place-content-center rounded-[14px] border border-white/10 bg-white/[0.06] text-center', className)} aria-hidden>
      <span className="label-caps text-[10px] text-fj-green">{dow}</span>
      <span className="num text-[22px]">{day}</span>
    </span>
  );
}

export function SportTile({ sport, className }: { sport: SessionView['sport']; className?: string }) {
  return (
    <span className={cn('grid size-12 shrink-0 place-items-center rounded-[14px] border border-[rgba(32,196,90,0.3)] bg-[rgba(32,196,90,0.12)] text-fj-green', className)} aria-hidden>
      <SportIcon sport={sport} className="size-6" />
    </span>
  );
}

/** Kompaktni red termina (liste, "u blizini", "moji termini"). */
export function SessionRow({
  s,
  leading = 'sport',
  personal,
  trailing,
  showDay = true,
  link = true,
}: {
  s: SessionView;
  leading?: 'sport' | 'date';
  personal?: boolean;
  trailing?: ReactNode;
  showDay?: boolean;
  /** false = ne renderuje link (npr. unutar dugmeta za izbor) */
  link?: boolean;
}) {
  const sport = getSport(s.sport);
  const cls =
    'glass-low group flex min-h-[76px] items-center gap-3.5 rounded-card p-3 pr-3.5 transition-[background-color,border-color] duration-200 hover:border-[rgba(32,196,90,0.35)] hover:bg-white/[0.06]';
  const content = (
    <>
      {leading === 'date' ? <DateBlock iso={s.startsAt} /> : <SportTile sport={s.sport} />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-extrabold">
          {sport.name} · <span className="num text-[15px] tracking-normal">{timeHM(s.startsAt)}</span>
          {showDay && leading !== 'date' && <span className="font-semibold text-fj-text-2"> · {relativeDay(s.startsAt)}</span>}
        </p>
        <p className="truncate text-[13px] font-medium text-fj-text-2">
          {s.venueName}
          {s.distanceKm != null && ` · ${formatDistance(s.distanceKm)}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {trailing ?? <SessionBadge s={s} personal={personal} short />}
        {link && <ChevronRight className="size-4 text-fj-muted transition-transform group-hover:translate-x-0.5" aria-hidden />}
      </div>
    </>
  );
  return link ? (
    <Link to={`/termin/${s.id}`} className={cls}>
      {content}
    </Link>
  ) : (
    <div className={cls}>{content}</div>
  );
}
