import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { CalendarCheck, CalendarX2, Flame, MapPinned, Search, Users, Zap } from 'lucide-react';
import { useDB, useFirstLoad, useMe, useNow, useSessionViews } from '../lib/hooks';
import { dayDiff, greeting, termini } from '../lib/format';
import { SPORTS } from '../lib/sports';
import { isActiveForMe, playerList, type PlayerListItem } from '../lib/selectors';
import type { SportId } from '../lib/types';
import {
  AmbientGlow,
  EmptyState,
  GlassButton,
  GlassCard,
  GlassChip,
  GlassSearch,
  GlassStatCard,
  HScroll,
  Page,
  RowSkeleton,
  SectionHeader,
  SessionCardSkeleton,
  SportIcon,
} from '../components/ui';
import { Logo } from '../components/layout/Logo';
import { TopActions } from '../components/layout/TopActions';
import { SessionCard } from '../components/session/SessionCard';
import { SessionRow } from '../components/session/SessionRow';
import { InviteModal, PlayerCard } from '../components/player/PlayerCard';

export function Home() {
  const me = useMe()!;
  const db = useDB();
  const views = useSessionViews();
  const now = useNow();
  const loading = useFirstLoad();
  const navigate = useNavigate();
  const [sport, setSport] = useState<SportId | 'all'>('all');
  const [query, setQuery] = useState('');
  const [invitee, setInvitee] = useState<PlayerListItem | null>(null);

  const radius = me.radiusKm;
  const upcoming = useMemo(() => views.filter((v) => v.status !== 'finished' && v.status !== 'cancelled' && !v.started), [views]);
  const nearby = useMemo(() => upcoming.filter((v) => (v.distanceKm ?? 0) <= Math.max(radius, 5)), [upcoming, radius]);
  const bySport = (v: { sport: SportId }) => sport === 'all' || v.sport === sport;

  const urgent = useMemo(
    () => nearby.filter((v) => v.status === 'open' && !v.isMine && bySport(v)).sort((a, b) => a.startsAtMs - b.startsAtMs).slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nearby, sport],
  );
  const mine = useMemo(
    () => views.filter((v) => isActiveForMe(v) && v.status !== 'finished' && (v.status !== 'cancelled' || v.startsAtMs > now)).sort((a, b) => a.startsAtMs - b.startsAtMs).slice(0, 4),
    [views, now],
  );
  const around = useMemo(
    () => nearby.filter((v) => bySport(v) && !isActiveForMe(v)).sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0)).slice(0, 6),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nearby, sport],
  );
  const todayCount = nearby.filter((v) => dayDiff(v.startsAtMs, now) === 0).length;
  const seekingNow = nearby.filter((v) => v.status === 'open' && v.startsAtMs - now <= 4 * 3600000).length;

  const mySports = new Set(db.playerSports.filter((p) => p.userId === me.id).map((p) => p.sport));
  const players = useMemo(
    () =>
      playerList(db)
        .filter((p) => p.sports.some((s) => mySports.has(s.sport)))
        .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
        .slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db],
  );

  const searchGo = () => navigate(`/istrazi${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);

  return (
    <Page wide>
      {/* Zaglavlje — mobilni */}
      <header className="mb-5 flex items-center justify-between lg:hidden">
        <Logo className="md:hidden" />
        <div className="md:ml-auto">
          <TopActions />
        </div>
      </header>
      {/* Zaglavlje — desktop */}
      <header className="mb-6 hidden items-center gap-4 lg:flex">
        <GlassSearch value={query} onChange={setQuery} onSubmit={searchGo} city={me.city} onCityClick={() => navigate('/profil/uredi')} className="max-w-xl flex-1" />
        <div className="ml-auto">
          <TopActions />
        </div>
      </header>

      {/* Hero */}
      <GlassCard tone="high" glow className="overflow-hidden rounded-hero p-6 md:p-10">
        <AmbientGlow className="-bottom-40 -left-24 size-96" strength={0.12} />
        <div className="relative grid grid-cols-1 items-end gap-8 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="text-[15px] font-bold text-fj-text-2">
              {greeting(new Date(now))}, <span className="text-white">{me.firstName}</span>
            </p>
            <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-[rgba(32,196,90,0.38)] bg-[rgba(32,196,90,0.12)] px-3 py-1.5 text-[12px] font-extrabold text-fj-green">
              <span className="pulse-dot size-2 rounded-full bg-fj-green" aria-hidden />
              {todayCount} {termini(todayCount)} danas u blizini
            </span>
            <h1 className="mt-4 max-w-[14ch] text-[36px] font-extrabold leading-[1.02] tracking-[-0.035em] md:text-[56px]">Pronađi svoj sljedeći termin.</h1>
            <p className="mt-3 max-w-md text-[15px] text-fj-text-2 md:text-[16px]">Priključi se ekipi ili pronađi igrače koji nedostaju.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <GlassButton to="/istrazi" icon={Search}>
                Pronađi termin
              </GlassButton>
              <GlassButton to="/organizuj" variant="secondary">
                Organizuj termin
              </GlassButton>
            </div>
          </div>
          <div className="hidden text-right lg:block" aria-hidden>
            <p className="label-caps text-fj-text-2">Traže igrače odmah</p>
            <p className="num text-glow text-[92px] text-fj-green">{seekingNow}</p>
          </div>
        </div>
      </GlassCard>

      {/* Stat kartice — desktop */}
      <div className="mt-5 hidden gap-4 md:grid md:grid-cols-3">
        <GlassStatCard label="Termina danas" value={todayCount} hint={`U krugu od ${radius} km`} icon={MapPinned} />
        <GlassStatCard label="Traže igrače odmah" value={seekingNow} hint="Počinju u naredna 4 sata" icon={Zap} accent />
        <GlassStatCard label="Tvoji naredni" value={mine.filter((m) => m.status !== 'cancelled').length} hint="Potvrđeni i organizovani" icon={CalendarCheck} />
      </div>

      {/* Filteri po sportu */}
      <HScroll className="mt-7">
        <GlassChip selected={sport === 'all'} onClick={() => setSport('all')}>
          Svi sportovi
        </GlassChip>
        {SPORTS.map((s) => (
          <GlassChip key={s.id} selected={sport === s.id} onClick={() => setSport(s.id)} icon={<SportIcon sport={s.id} className="size-4" />}>
            {s.name}
          </GlassChip>
        ))}
      </HScroll>

      {/* Hitno */}
      <section className="mt-8" aria-labelledby="hitno">
        <SectionHeader
          title={
            <span id="hitno" className="flex items-center gap-2">
              <Flame className="size-5 text-fj-green" aria-hidden /> Fali igrača — hitno
            </span>
          }
          action="Sve"
          to="/istrazi"
        />
        {loading ? (
          <div className="no-scrollbar -mx-5 flex gap-4 overflow-hidden px-5 md:mx-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] md:px-0">
            <SessionCardSkeleton className="w-[300px] shrink-0 md:w-auto" />
            <SessionCardSkeleton className="w-[300px] shrink-0 md:w-auto" />
            <SessionCardSkeleton className="hidden md:block" />
          </div>
        ) : urgent.length ? (
          <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] md:overflow-visible md:px-0">
            {urgent.map((v, i) => (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 6) * 0.05, duration: 0.3 }}
                className="w-[300px] shrink-0 snap-start md:w-auto"
              >
                <SessionCard s={v} className="h-full" />
              </motion.div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="Trenutno niko ne traži igrače"
            text={sport === 'all' ? 'Sve ekipe u blizini su popunjene. Budi prvi — organizuj termin.' : 'Nema hitnih termina za ovaj sport. Budi prvi — organizuj termin.'}
            action={
              <GlassButton to={`/organizuj${sport !== 'all' ? `?sport=${sport}` : ''}`} size="md">
                Organizuj termin
              </GlassButton>
            }
          />
        )}
      </section>

      <div className="mt-9 grid grid-cols-1 gap-9 lg:grid-cols-2 lg:gap-6">
        {/* Tvoji naredni termini */}
        <section aria-labelledby="naredni">
          <SectionHeader title={<span id="naredni">Tvoji naredni termini</span>} action="Moji termini" to="/moji-termini" />
          {loading ? (
            <div className="space-y-2.5">
              <RowSkeleton />
              <RowSkeleton />
            </div>
          ) : mine.length ? (
            <div className="space-y-2.5">
              {mine.map((v) => (
                <SessionRow key={v.id} s={v} leading="date" personal />
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              icon={CalendarX2}
              title="Nemaš zakazanih termina"
              text="Pridruži se ekipi kojoj fali igrač — traje par sekundi."
              action={
                <GlassButton to="/istrazi" size="md">
                  Pronađi termin
                </GlassButton>
              }
            />
          )}
        </section>

        {/* Igrači u blizini — desktop / tablet */}
        <section aria-labelledby="igraci" className="hidden md:block">
          <SectionHeader title={<span id="igraci">Igrači u blizini</span>} action="Svi igrači" to="/igraci" />
          {players.length ? (
            <div className="space-y-2.5">
              {players.map((p) => (
                <PlayerCard key={p.user.id} p={p} onInvite={setInvitee} compact />
              ))}
            </div>
          ) : (
            <EmptyState compact icon={Users} title="Nema igrača u blizini" text="Povećaj radijus pretrage u profilu." />
          )}
        </section>
      </div>

      {/* Termini u blizini */}
      <section className="mt-9" aria-labelledby="blizina">
        <SectionHeader title={<span id="blizina">Termini u tvojoj blizini</span>} action="Prikaži sve" to="/istrazi" />
        {loading ? (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </div>
        ) : around.length ? (
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {around.map((v) => (
              <SessionRow key={v.id} s={v} />
            ))}
          </div>
        ) : (
          <EmptyState compact icon={MapPinned} title="Nema termina u blizini" text={`U krugu od ${radius} km trenutno nema termina za izabrani sport.`} />
        )}
      </section>

      <InviteModal player={invitee} onClose={() => setInvitee(null)} />
    </Page>
  );
}
