import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { List, Map as MapIcon, SearchX, SlidersHorizontal, Users, WifiOff, X } from 'lucide-react';
import { useFirstLoad, useMe, useNow, useOnline, useSessionViews } from '../lib/hooks';
import { dayDiff, formatPrice, sessionsSeeking, termini } from '../lib/format';
import { LEVELS, SPORTS, getSport, isSportId } from '../lib/sports';
import type { Level, SportId } from '../lib/types';
import { cn } from '../lib/utils';
import {
  AdSlot,
  EmptyState,
  GlassButton,
  GlassChip,
  GlassModal,
  GlassSearch,
  GlassSwitch,
  GlassTabs,
  HScroll,
  IconButton,
  LevelBars,
  Page,
  PageHeader,
  RangeField,
  SessionCardSkeleton,
  SportIcon,
} from '../components/ui';
import { SessionCard } from '../components/session/SessionCard';

/** Reklama u listi termina dolazi poslije ovoliko kartica */
const AD_AFTER = 6;
const SessionMap = lazy(() => import('../components/session/SessionMap'));

type TimeFilter = 'today' | 'tomorrow' | 'weekend' | null;

interface Advanced {
  maxKm: number;
  levels: Level[];
  maxPrice: number;
  freeOnly: boolean;
  showFull: boolean;
}

export function Explore() {
  const me = useMe()!;
  const views = useSessionViews();
  const now = useNow();
  const online = useOnline();
  const loading = useFirstLoad();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const initialSport = params.get('sport');
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [sport, setSport] = useState<SportId | 'all'>(isSportId(initialSport) ? initialSport : 'all');
  const [time, setTime] = useState<TimeFilter>(null);
  const [near5, setNear5] = useState(false);
  const view = params.get('prikaz') === 'mapa' ? 'map' : 'list';
  const defaults: Advanced = { maxKm: Math.max(me.radiusKm, 5), levels: [], maxPrice: 30, freeOnly: false, showFull: false };
  const [adv, setAdv] = useState<Advanced>(defaults);
  const [draft, setDraft] = useState<Advanced>(defaults);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const apply = (a: Advanced, list = views) => {
    const q = query.trim().toLowerCase();
    return list
      .filter((v) => v.status !== 'finished' && v.status !== 'cancelled' && !v.started)
      .filter((v) => a.showFull || v.status === 'open')
      .filter((v) => sport === 'all' || v.sport === sport)
      .filter((v) => (v.distanceKm ?? 0) <= (near5 ? Math.min(5, a.maxKm) : a.maxKm))
      .filter((v) => !a.levels.length || a.levels.includes(v.level))
      .filter((v) => (a.freeOnly ? !v.priceKM : (v.priceKM ?? 0) <= a.maxPrice))
      .filter((v) => {
        if (!time) return true;
        const diff = dayDiff(v.startsAtMs, now);
        if (time === 'today') return diff === 0;
        if (time === 'tomorrow') return diff === 1;
        const day = new Date(v.startsAtMs).getDay();
        return (day === 6 || day === 0) && diff <= 7;
      })
      .filter((v) => !q || `${v.venueName} ${getSport(v.sport).name} ${v.organizer.firstName} ${v.organizer.lastName} ${v.city}`.toLowerCase().includes(q))
      .sort((a, b) => a.startsAtMs - b.startsAtMs);
  };

  const results = useMemo(() => apply(adv), [views, adv, sport, time, near5, query, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const draftCount = useMemo(() => apply(draft).length, [draft, views, sport, time, near5, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const seeking = results.filter((r) => r.status === 'open').length;
  const activeAdv = (adv.maxKm !== defaults.maxKm ? 1 : 0) + (adv.levels.length ? 1 : 0) + (adv.freeOnly || adv.maxPrice < 30 ? 1 : 0) + (adv.showFull ? 1 : 0);
  const selectedSession = results.find((r) => r.id === selected) ?? null;

  const setView = (v: 'list' | 'map') => {
    const next = new URLSearchParams(params);
    if (v === 'map') next.set('prikaz', 'mapa');
    else next.delete('prikaz');
    setParams(next, { replace: true });
  };

  const emptyTitle = sport !== 'all' ? 'Nema termina za ovaj sport' : query ? 'Nema rezultata pretrage' : 'Nema termina za ove filtere';

  return (
    <Page wide>
      <PageHeader
        title="Pronađi termin"
        subtitle="Ekipe u blizini kojima fali igrač."
        actions={
          <>
            <IconButton icon={Users} label="Pronađi igrače" onClick={() => navigate('/igraci')} />
            <IconButton
              icon={SlidersHorizontal}
              label={activeAdv ? `Filteri (${activeAdv} aktivna)` : 'Filteri'}
              badge={activeAdv || undefined}
              onClick={() => {
                setDraft(adv);
                setFiltersOpen(true);
              }}
            />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_280px]">
        <GlassSearch value={query} onChange={setQuery} city={me.city} onCityClick={() => navigate('/profil/uredi')} placeholder="Dvorana, sport ili organizator…" />
        <GlassTabs
          ariaLabel="Prikaz"
          value={view}
          onChange={setView}
          tabs={[
            { value: 'list', label: <span className="inline-flex items-center gap-1.5"><List className="size-4" aria-hidden /> Lista</span> },
            { value: 'map', label: <span className="inline-flex items-center gap-1.5"><MapIcon className="size-4" aria-hidden /> Mapa</span> },
          ]}
        />
      </div>

      <HScroll className="mt-4">
        <GlassChip selected={sport === 'all'} onClick={() => setSport('all')}>
          Svi
        </GlassChip>
        {SPORTS.map((s) => (
          <GlassChip key={s.id} selected={sport === s.id} onClick={() => setSport(sport === s.id ? 'all' : s.id)} icon={<SportIcon sport={s.id} className="size-4" />}>
            {s.name}
          </GlassChip>
        ))}
      </HScroll>
      <HScroll className="mt-2.5">
        {(
          [
            ['today', 'Danas'],
            ['tomorrow', 'Sutra'],
            ['weekend', 'Vikend'],
          ] as const
        ).map(([key, label]) => (
          <GlassChip key={key} selected={time === key} onClick={() => setTime(time === key ? null : key)}>
            {label}
          </GlassChip>
        ))}
        <GlassChip selected={near5} onClick={() => setNear5(!near5)}>
          Do 5 km
        </GlassChip>
      </HScroll>

      <div className="mb-4 mt-6 flex items-center justify-between gap-3">
        <p className="label-caps text-fj-text-2" aria-live="polite">
          {loading ? 'Tražimo termine…' : sessionsSeeking(seeking)}
          {!loading && results.length > seeking && <span className="text-fj-muted"> · {results.length - seeking} popunjeno</span>}
        </p>
        {(sport !== 'all' || time || near5 || query || activeAdv > 0) && (
          <button
            type="button"
            onClick={() => {
              setSport('all');
              setTime(null);
              setNear5(false);
              setQuery('');
              setAdv(defaults);
            }}
            className="inline-flex min-h-11 items-center gap-1 rounded-[12px] px-2 text-[13px] font-extrabold text-fj-green hover:bg-white/[0.05]"
          >
            <X className="size-4" aria-hidden /> Očisti filtere
          </button>
        )}
      </div>

      {view === 'list' ? (
        loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
            {Array.from({ length: 4 }).map((_, i) => (
              <SessionCardSkeleton key={i} />
            ))}
          </div>
        ) : results.length ? (
          <>
            {/* Reklama (ako je AdSense uključen) poslije 6 termina — 6 popunjava redove sa 1, 2 i 3 kolone */}
            {[results.slice(0, AD_AFTER), results.slice(AD_AFTER)].map((part, p) =>
              part.length ? (
                <div key={p}>
                  {p === 1 && <AdSlot className="mt-4" />}
                  <motion.div layout className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]', p === 1 && 'mt-4')}>
                    <AnimatePresence mode="popLayout">
                      {part.map((v, i) => (
                        <motion.div
                          key={v.id}
                          layout
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.97 }}
                          transition={{ duration: 0.28, delay: Math.min(i + p * AD_AFTER, 8) * 0.04 }}
                        >
                          <SessionCard s={v} className="h-full" />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                </div>
              ) : null,
            )}
          </>
        ) : (
          <EmptyState
            icon={SearchX}
            title={emptyTitle}
            text="Budi prvi — organizuj termin i javljamo igračima u blizini."
            action={
              <GlassButton to={`/organizuj${sport !== 'all' ? `?sport=${sport}` : ''}`} size="md">
                Organizuj termin
              </GlassButton>
            }
          />
        )
      ) : !online ? (
        <EmptyState icon={WifiOff} title="Mapa nije dostupna offline" text="Uključi internet da učitamo mapu. Lista termina radi i bez veze." action={<GlassButton size="md" variant="secondary" onClick={() => setView('list')}>Prikaži listu</GlassButton>} />
      ) : (
        <div className="relative">
          <div className="glass relative h-[calc(100dvh-380px)] min-h-[380px] overflow-hidden rounded-hero">
            <Suspense fallback={<div className="shimmer size-full bg-white/[0.03]" />}>
              <SessionMap sessions={results} selectedId={selected} onSelect={setSelected} me={me} className="size-full" />
            </Suspense>
          </div>
          <AnimatePresence>
            {selectedSession && (
              <motion.div
                key={selectedSession.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24 }}
                className="absolute inset-x-3 bottom-3 z-[500] mx-auto max-w-sm"
              >
                <button type="button" onClick={() => setSelected(null)} aria-label="Zatvori pregled termina" className="glass absolute -top-3 right-2 z-10 grid grid-cols-1 size-9 place-items-center rounded-full">
                  <X className="size-4" />
                </button>
                <SessionCard s={selectedSession} className="bg-[rgba(16,20,17,0.9)]" />
              </motion.div>
            )}
          </AnimatePresence>
          {!results.length && (
            <div className="pointer-events-none absolute inset-x-0 top-6 z-[500] flex justify-center">
              <span className="glass-bar rounded-full px-4 py-2 text-[13px] font-bold">{emptyTitle}</span>
            </div>
          )}
        </div>
      )}

      <GlassModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filteri"
        description="Suzi izbor termina po udaljenosti, nivou i cijeni."
        footer={
          <div className="flex gap-3">
            <GlassButton variant="secondary" onClick={() => setDraft(defaults)} className="flex-1">
              Resetuj
            </GlassButton>
            <GlassButton
              className="flex-[2]"
              onClick={() => {
                setAdv(draft);
                setFiltersOpen(false);
              }}
            >
              Prikaži {draftCount} {termini(draftCount)}
            </GlassButton>
          </div>
        }
      >
        <div className="space-y-6 pb-2">
          <RangeField label="Udaljenost" value={draft.maxKm} min={1} max={50} onChange={(maxKm) => setDraft({ ...draft, maxKm })} format={(v) => `do ${v} km`} />
          <div>
            <p className="label-caps mb-2.5 text-fj-text-2">Nivo igre</p>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((l) => {
                const on = draft.levels.includes(l.id);
                return (
                  <GlassChip
                    key={l.id}
                    selected={on}
                    icon={<LevelBars bars={l.bars} size="sm" />}
                    onClick={() => setDraft({ ...draft, levels: on ? draft.levels.filter((x) => x !== l.id) : [...draft.levels, l.id] })}
                  >
                    {l.label}
                  </GlassChip>
                );
              })}
            </div>
          </div>
          <div className={draft.freeOnly ? 'pointer-events-none opacity-40' : ''}>
            <RangeField label="Maksimalna cijena" value={draft.maxPrice} min={0} max={30} onChange={(maxPrice) => setDraft({ ...draft, maxPrice })} format={(v) => (v === 30 ? 'Bilo koja' : `do ${formatPrice(v)}`)} />
          </div>
          <div className="divide-y divide-white/[0.08] rounded-card border border-white/[0.08] px-4">
            <GlassSwitch label="Samo besplatni termini" checked={draft.freeOnly} onChange={(freeOnly) => setDraft({ ...draft, freeOnly })} />
            <GlassSwitch label="Prikaži i popunjene" description="Za prijavu na listu čekanja" checked={draft.showFull} onChange={(showFull) => setDraft({ ...draft, showFull })} />
          </div>
        </div>
      </GlassModal>
    </Page>
  );
}
