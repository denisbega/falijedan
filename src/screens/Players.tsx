import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import { UsersRound } from 'lucide-react';
import { useDB, useMe, useSessionView } from '../lib/hooks';
import { playerList, type PlayerListItem } from '../lib/selectors';
import { LEVELS, SPORTS, getSport, isSportId } from '../lib/sports';
import { igraci, relativeDay, timeHM } from '../lib/format';
import type { Level, SportId } from '../lib/types';
import { EmptyState, GlassChip, GlassSearch, HScroll, LevelBars, Page, PageHeader, SportIcon } from '../components/ui';
import { InviteModal, PlayerCard } from '../components/player/PlayerCard';

export function Players() {
  const me = useMe()!;
  const db = useDB();
  const [params] = useSearchParams();
  const forSession = useSessionView(params.get('termin') ?? undefined);
  const [q, setQ] = useState('');
  const [sport, setSport] = useState<SportId | 'all'>(forSession?.sport ?? (isSportId(params.get('sport')) ? (params.get('sport') as SportId) : 'all'));
  const [level, setLevel] = useState<Level | null>(null);
  const [invitee, setInvitee] = useState<PlayerListItem | null>(null);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    const taken = forSession ? new Set([...forSession.members.map((m) => m.userId), ...forSession.waitlist.map((w) => w.userId)]) : new Set<string>();
    return playerList(db)
      .filter((p) => !taken.has(p.user.id))
      .filter((p) => sport === 'all' || p.sports.some((s) => s.sport === sport))
      .filter((p) => !level || p.sports.some((s) => (sport === 'all' || s.sport === sport) && s.level === level))
      .filter((p) => !query || `${p.user.firstName} ${p.user.lastName}`.toLowerCase().includes(query))
      .filter((p) => (p.distanceKm ?? 0) <= Math.max(me.radiusKm, 5) * 2)
      .map((p) => (sport === 'all' ? p : { ...p, sports: [...p.sports].sort((a) => (a.sport === sport ? -1 : 1)) }))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  }, [db, sport, level, q, forSession, me.radiusKm]);

  return (
    <Page>
      <PageHeader
        back={!!forSession}
        title="Pronađi igrače"
        subtitle={
          forSession
            ? `Pozovi igrače na ${getSport(forSession.sport).name.toLowerCase()}, ${relativeDay(forSession.startsAt).toLowerCase()} u ${timeHM(forSession.startsAt)} — ${forSession.missing === 1 ? 'fali jedan' : `fali ${forSession.missing} ${igraci(forSession.missing)}`}.`
            : 'Rekreativci iz tvoje okoline, sortirani po ocjeni saigrača.'
        }
      />
      <GlassSearch value={q} onChange={setQ} placeholder="Ime igrača…" city={me.city} />
      <HScroll className="mt-4">
        <GlassChip selected={sport === 'all'} onClick={() => setSport('all')}>
          Svi sportovi
        </GlassChip>
        {SPORTS.map((s) => (
          <GlassChip key={s.id} selected={sport === s.id} onClick={() => setSport(s.id)} icon={<SportIcon sport={s.id} className="size-4" />}>
            {s.name}
          </GlassChip>
        ))}
      </HScroll>
      <HScroll className="mt-2.5">
        {LEVELS.map((l) => (
          <GlassChip key={l.id} selected={level === l.id} onClick={() => setLevel(level === l.id ? null : l.id)} icon={<LevelBars bars={l.bars} size="sm" />}>
            {l.label}
          </GlassChip>
        ))}
      </HScroll>

      <p className="label-caps mb-4 mt-6 text-fj-text-2">
        {list.length} {igraci(list.length)} u blizini
      </p>
      {list.length ? (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {list.map((p, i) => (
            <motion.div key={p.user.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
              <PlayerCard p={p} onInvite={setInvitee} />
            </motion.div>
          ))}
        </div>
      ) : (
        <EmptyState icon={UsersRound} title="Nema igrača" text="Nema igrača za izabrane filtere. Proširi radijus ili promijeni sport." />
      )}
      <InviteModal player={invitee} onClose={() => setInvitee(null)} preselect={forSession?.id} />
    </Page>
  );
}
