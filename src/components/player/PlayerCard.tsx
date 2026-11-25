import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CalendarPlus, Send, Star } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatDistance, formatRating, fullName, relativeDay, timeHM } from '../../lib/format';
import { getLevel, getSport } from '../../lib/sports';
import type { PlayerListItem } from '../../lib/selectors';
import { inviteToSession } from '../../lib/api';
import { useSessionViews } from '../../lib/hooks';
import { EmptyState, GlassAvatar, GlassButton, GlassModal, LevelBars, useToast } from '../ui';
import { SessionRow } from '../session/SessionRow';

export function PlayerCard({ p, onInvite, compact, className }: { p: PlayerListItem; onInvite: (p: PlayerListItem) => void; compact?: boolean; className?: string }) {
  const main = p.sports[0];
  return (
    <div className={cn('glass-low flex items-center gap-3.5 rounded-card p-3.5', !compact && 'md:p-4', className)}>
      <Link to={`/igrac/${p.user.id}`} className="flex min-w-0 flex-1 items-center gap-3.5 rounded-[14px]">
        <GlassAvatar user={p.user} size={compact ? 44 : 50} verified={p.user.verified} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold">{fullName(p.user)}</p>
          <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-fj-text-2">
            {main && (
              <>
                {getSport(main.sport).name} · <LevelBars bars={getLevel(main.level).bars} size="sm" /> {getLevel(main.level).label}
              </>
            )}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-fj-text-2">
            <Star className="size-3 fill-fj-green text-fj-green" aria-hidden />
            <span className="text-white">{formatRating(p.rating)}</span>
            {p.distanceKm != null && <span>· {formatDistance(p.distanceKm)}</span>}
          </p>
        </div>
      </Link>
      <GlassButton size="sm" variant="secondary" onClick={() => onInvite(p)} className="px-3.5">
        Pozovi
      </GlassButton>
    </div>
  );
}

/** Modal za poziv igrača na jedan od mojih otvorenih termina. */
export function InviteModal({ player, onClose, preselect }: { player: PlayerListItem | null; onClose: () => void; preselect?: string | null }) {
  const views = useSessionViews();
  const navigate = useNavigate();
  const { toast, error } = useToast();
  const mine = useMemo(() => views.filter((v) => v.isMine && v.status === 'open' && !v.started).sort((a, b) => a.startsAtMs - b.startsAtMs), [views]);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? preselect ?? mine[0]?.id ?? null;

  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!player || !selected) return;
    setBusy(true);
    try {
      const threadId = await inviteToSession(player.user.id, selected);
      const s = mine.find((m) => m.id === selected);
      toast({
        title: `Poziv poslan — ${player.user.firstName}`,
        description: s ? `${getSport(s.sport).name}, ${relativeDay(s.startsAt).toLowerCase()} u ${timeHM(s.startsAt)}` : undefined,
        action: { label: 'Chat', onClick: () => navigate(`/poruke/${threadId}`) },
      });
      onClose();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassModal
      open={!!player}
      onClose={onClose}
      title={player ? `Pozovi: ${player.user.firstName}` : 'Pozovi igrača'}
      description="Izaberi termin na koji ga pozivaš. Poziv stiže kao poruka i obavještenje."
      footer={
        mine.length ? (
          <GlassButton full icon={Send} onClick={send} disabled={!selected} loading={busy}>
            Pošalji poziv
          </GlassButton>
        ) : undefined
      }
    >
      {mine.length === 0 ? (
        <EmptyState
          compact
          icon={CalendarPlus}
          title="Nemaš otvorenih termina"
          text="Organizuj termin pa pozovi igrače koji vam fale."
          action={
            <GlassButton to="/organizuj" size="md" onClick={onClose}>
              Organizuj termin
            </GlassButton>
          }
          className="bg-transparent"
        />
      ) : (
        <div className="space-y-2.5" role="radiogroup" aria-label="Moji otvoreni termini">
          {mine.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={selected === s.id}
              onClick={() => setPicked(s.id)}
              className={cn('block w-full rounded-card border text-left transition-colors', selected === s.id ? 'border-[rgba(32,196,90,0.55)] bg-[rgba(32,196,90,0.08)]' : 'border-transparent')}
            >
              <SessionRow s={s} leading="date" personal link={false} />
            </button>
          ))}
        </div>
      )}
    </GlassModal>
  );
}
