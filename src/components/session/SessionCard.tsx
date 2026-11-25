import { useState } from 'react';
import { Link } from 'react-router';
import { Check, Hourglass, MapPin, Star } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatDistance, formatPrice, formatRating, fullName, relativeDay, timeHM } from '../../lib/format';
import { ANY_POSITION, getLevel, getSport } from '../../lib/sports';
import type { SessionView } from '../../lib/types';
import { GlassAvatar, GlassButton, GlassCard, PlayerSlots, SessionBadge, SportIcon, buttonClasses } from '../ui';
import { useSessionActions } from './useSessionActions';

/** Dugme akcije na kartici — mijenja se zavisno od statusa i uloge korisnika. */
function CardAction({ s }: { s: SessionView }) {
  const { join } = useSessionActions();
  const [busy, setBusy] = useState(false);
  const run = async (waitlist: boolean) => {
    setBusy(true);
    await join(s, waitlist);
    setBusy(false);
  };
  const detail = `/termin/${s.id}`;
  if (s.status === 'cancelled') return <GlassButton full size="md" disabled>Otkazano</GlassButton>;
  if (s.status === 'finished') return <GlassButton full size="md" disabled>Završeno</GlassButton>;
  if (s.isMine) return <GlassButton to={detail} full size="md" variant="secondary">Tvoj termin</GlassButton>;
  if (s.myStatus === 'confirmed')
    return (
      <GlassButton to={detail} full size="md" variant="secondary" icon={Check} className="text-fj-green">
        Prijavljen si
      </GlassButton>
    );
  if (s.myStatus === 'waitlist')
    return (
      <GlassButton to={detail} full size="md" variant="secondary" icon={Hourglass}>
        Lista čekanja #{s.waitlistPosition}
      </GlassButton>
    );
  if (s.started) return <GlassButton full size="md" disabled>Termin je počeo</GlassButton>;
  if (s.status === 'full')
    return (
      <GlassButton full size="md" variant="secondary" loading={busy} onClick={() => run(true)}>
        Lista čekanja
      </GlassButton>
    );
  return (
    <GlassButton full size="md" loading={busy} onClick={() => run(false)}>
      Pridruži se
    </GlassButton>
  );
}

export function SessionCard({ s, className, preview }: { s: SessionView; className?: string; preview?: boolean }) {
  const sport = getSport(s.sport);
  const level = getLevel(s.level);
  const sought = s.openPositions.length ? s.openPositions : s.neededPositions;
  const free = !s.priceKM;

  return (
    <GlassCard interactive={!preview} className={cn('flex flex-col p-5', className)}>
      {!preview && (
        <Link
          to={`/termin/${s.id}`}
          className="absolute inset-0 z-0 rounded-card"
          aria-label={`${sport.name}, ${s.venueName}, ${relativeDay(s.startsAt)} u ${timeHM(s.startsAt)}`}
        />
      )}
      <div className="pointer-events-none relative z-[1] flex flex-1 flex-col">
        {/* 1. Sport + status */}
        <div className="flex items-center justify-between gap-3">
          <span className="label-caps flex min-w-0 items-center gap-2 text-fj-text-2">
            <SportIcon sport={s.sport} className="size-4 shrink-0 text-fj-green" strokeWidth={2.2} />
            <span className="truncate">{sport.name}</span>
          </span>
          <SessionBadge s={s} />
        </div>

        {/* 2. Vrijeme */}
        <div className="mt-4 flex items-baseline gap-2.5">
          <span className="num text-[44px]">{timeHM(s.startsAt)}</span>
          <span className="text-[14px] font-semibold text-fj-text-2">
            {relativeDay(s.startsAt)} · {s.durationMin} min
          </span>
        </div>

        {/* 3. Dvorana */}
        <h3 className="mt-3 truncate text-[17px] font-extrabold tracking-[-0.01em]">{s.venueName}</h3>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[13px] font-medium text-fj-text-2">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          {s.city}
          {s.distanceKm != null && ` · ${formatDistance(s.distanceKm)}`}
        </p>

        {/* 4. Popunjenost + nivo */}
        <div className="mt-4 flex items-center justify-between">
          <span className="label-caps text-white">
            {s.confirmedCount}/{s.totalPlayers} igrača
          </span>
          <span className="label-caps text-fj-text-2">
            Nivo · <span className="text-white">{level.label}</span>
          </span>
        </div>
        <PlayerSlots total={s.totalPlayers} filled={s.confirmedCount} className="mt-2.5" />

        {/* 5. Tražene pozicije */}
        <p className="mt-3 min-h-[20px] truncate text-[13px] text-fj-text-2">
          {s.missing > 0 && sought.length > 0 && (
            <>
              Traže se: <span className="font-bold text-white">{sought.filter((p) => p !== ANY_POSITION).join(', ') || 'bilo koja pozicija'}</span>
            </>
          )}
        </p>

        {/* 6. Organizator, ocjena, cijena, akcija */}
        <div className="mt-auto pt-4">
          <div className="flex items-center gap-3 border-t border-white/[0.08] pt-4">
            <GlassAvatar user={s.organizer} size={36} ring />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-bold">{fullName(s.organizer)}</p>
              <p className="flex items-center gap-1 text-[12px] font-semibold text-fj-text-2">
                {s.organizerRating != null ? (
                  <>
                    <Star className="size-3 fill-fj-green text-fj-green" aria-hidden />
                    <span className="text-white">{formatRating(s.organizerRating)}</span>
                    <span>· organizator</span>
                  </>
                ) : (
                  <span>Novi organizator</span>
                )}
              </p>
            </div>
            <div className="text-right">
              <p className={cn('num text-[18px]', free && 'text-fj-green')}>{free ? 'Besplatno' : formatPrice(s.priceKM)}</p>
              {!free && <p className="text-[11px] font-semibold text-fj-text-2">po igraču</p>}
            </div>
          </div>
          <div className="pointer-events-auto mt-4">
            {preview ? <span className={buttonClasses('primary', 'md', 'w-full')}>Pridruži se</span> : <CardAction s={s} />}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
