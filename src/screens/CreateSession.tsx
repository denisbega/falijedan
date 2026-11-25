import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronLeft, MapPin, Plus, Search, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useMe, useNow } from '../lib/hooks';
import { createSession, ApiError, validateSessionInput, type CreateSessionInput } from '../lib/api';
import { ANY_POSITION, LEVELS, SPORTS, getSport, isSportId } from '../lib/sports';
import { VENUES } from '../lib/seed';
import { dayShortUpper, igraci, timeHM } from '../lib/format';
import { sessionView } from '../lib/selectors';
import { store } from '../lib/store';
import type { Level, SportId } from '../lib/types';
import { GlassButton, GlassChip, GlassInput, GlassStepper, GlassTabs, IconButton, LevelBars, SportIcon, useToast } from '../components/ui';
import { SessionCard } from '../components/session/SessionCard';

const DRAFT_KEY = 'falijedan:draft';
const STEPS = 4;

interface Draft {
  sport: SportId | null;
  venue: string;
  venueIdx: number | null;
  dayOffset: number;
  time: string | null;
  duration: 60 | 90 | 120;
  total: number;
  present: number;
  positions: string[];
  level: Level | null;
  price: string;
}

const emptyDraft = (sport: SportId | null): Draft => ({
  sport,
  venue: '',
  venueIdx: null,
  dayOffset: 0,
  time: null,
  duration: 60,
  total: sport ? getSport(sport).defaultTotal : 10,
  present: sport ? Math.max(1, getSport(sport).defaultTotal - 2) : 8,
  positions: [],
  level: 'srednji',
  price: '',
});

const TIMES = Array.from({ length: 16 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`).concat(['17:30', '18:30', '19:30', '20:30', '21:30']).sort();

function startsAtFor(d: Draft): string | null {
  if (!d.time) return null;
  const [h, m] = d.time.split(':').map(Number);
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + d.dayOffset);
  date.setHours(h, m, 0, 0);
  return date.toISOString();
}

export function CreateSession() {
  const me = useMe()!;
  const now = useNow(60000);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { error } = useToast();
  const presetSport = params.get('sport');

  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved && !presetSport) return { ...emptyDraft(null), ...(JSON.parse(saved) as Draft) };
    } catch {
      /* ignoriši */
    }
    return emptyDraft(isSportId(presetSport) ? presetSport : null);
  });
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState(1);
  const [venueOpen, setVenueOpen] = useState(false);
  const [done, setDone] = useState<{ id: string; missing: number; notified: number } | null>(null);
  const [touched, setTouched] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* ignoriši */
    }
  }, [draft]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const sportDef = draft.sport ? getSport(draft.sport) : null;
  const missing = draft.total - draft.present;
  const startsAt = startsAtFor(draft);
  const venue = draft.venueIdx != null ? VENUES[draft.venueIdx] : null;

  const input: Partial<CreateSessionInput> = {
    sport: draft.sport ?? undefined,
    venueName: venue?.name ?? draft.venue,
    address: venue?.address,
    city: venue?.city ?? me.city,
    lat: venue?.lat,
    lng: venue?.lng,
    startsAt: startsAt ?? undefined,
    durationMin: draft.duration,
    totalPlayers: draft.total,
    baseCount: draft.present,
    priceKM: draft.price.trim() ? Number(draft.price.replace(',', '.')) : null,
    level: draft.level ?? undefined,
    neededPositions: draft.positions,
  };

  const stepError = (() => {
    if (step === 1) {
      if (!draft.sport) return 'Izaberi sport.';
      if ((venue?.name ?? draft.venue).trim().length < 3) return 'Unesi lokaciju termina.';
    }
    if (step === 2) {
      if (!draft.time) return 'Izaberi vrijeme početka.';
      if (startsAt && Date.parse(startsAt) < now + 10 * 60000) return 'To vrijeme je prošlo — izaberi kasnije.';
    }
    if (step === 3 && missing <= 0) return 'Ekipa je puna — smanji broj prisutnih.';
    if (step === 4) {
      if (!draft.level) return 'Izaberi nivo igre.';
      const p = input.priceKM;
      if (p != null && (Number.isNaN(p) || p < 0 || p > 200)) return 'Unesi ispravnu cijenu (0–200 KM).';
    }
    return null;
  })();

  const go = (next: number) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
    setTouched(false);
    window.scrollTo({ top: 0 });
  };

  const submit = async () => {
    const err = validateSessionInput(input);
    if (err) {
      setTouched(true);
      return;
    }
    setPublishing(true);
    try {
      const res = await createSession(input as CreateSessionInput);
      sessionStorage.removeItem(DRAFT_KEY);
      setDone({ id: res.id, missing, notified: res.notified });
    } catch (e) {
      if (e instanceof ApiError) error(e);
      else error(new Error('Objava nije uspjela. Pokušaj ponovo.'));
    } finally {
      setPublishing(false);
    }
  };

  const venueMatches = useMemo(() => {
    const q = draft.venue.trim().toLowerCase();
    return VENUES.map((v, i) => ({ v, i }))
      .filter(({ v }) => (!draft.sport || v.sports.includes(draft.sport)) && (!q || `${v.name} ${v.address}`.toLowerCase().includes(q)))
      .slice(0, 5);
  }, [draft.venue, draft.sport]);

  const previewSession = useMemo(() => {
    if (!draft.sport) return null;
    const s = {
      id: 'preview',
      organizerId: me.id,
      sport: draft.sport,
      venueName: venue?.name ?? (draft.venue || 'Tvoja dvorana'),
      address: venue?.address ?? me.city,
      city: venue?.city ?? me.city,
      lat: venue?.lat ?? me.lat,
      lng: venue?.lng ?? me.lng,
      startsAt: startsAt ?? new Date(now + 3600000).toISOString(),
      durationMin: draft.duration,
      totalPlayers: draft.total,
      baseCount: draft.present,
      priceKM: input.priceKM && input.priceKM > 0 ? input.priceKM : null,
      level: draft.level ?? 'srednji',
      neededPositions: draft.positions.length ? draft.positions : [ANY_POSITION],
      status: 'open' as const,
      createdAt: new Date(now).toISOString(),
    };
    const db = store.get();
    return sessionView({ ...db, sessions: [...db.sessions, s], sessionPlayers: [...db.sessionPlayers, { sessionId: 'preview', userId: me.id, role: 'organizer', status: 'confirmed', joinedAt: s.createdAt }] }, s, now);
  }, [draft, venue, startsAt, now, me, input.priceKM]);

  /* ---------- Uspjeh ---------- */
  if (done) {
    return (
      <div className="mx-auto grid grid-cols-1 min-h-dvh max-w-lg place-items-center px-5 pb-[calc(40px+var(--safe-bottom))] pt-[calc(24px+var(--safe-top))] text-center">
        <div>
          <motion.div
            initial={{ scale: 0.3, rotate: -12, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 15 }}
            className="mx-auto grid grid-cols-1 size-28 place-items-center rounded-[32px] bg-fj-green text-fj-on-green shadow-[0_18px_50px_rgba(32,196,90,0.5)]"
          >
            <motion.span initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 14 }}>
              <Check className="size-14" strokeWidth={3.2} aria-hidden />
            </motion.span>
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-8 text-[32px] font-extrabold tracking-[-0.025em]">
            Termin je objavljen!
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mx-auto mt-3 max-w-sm text-[15px] text-fj-text-2">
            Javljamo igračima u blizini da vam {done.missing === 1 ? 'fali jedan igrač' : `fali ${done.missing} ${igraci(done.missing)}`}…
            {done.notified > 0 && <span className="mt-1 block text-fj-green">Obaviješteno igrača: {done.notified}</span>}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="mt-9 flex flex-col gap-3">
            <GlassButton to={`/termin/${done.id}`} replace full>
              Pogledaj termin
            </GlassButton>
            <GlassButton
              variant="secondary"
              full
              icon={Plus}
              onClick={() => {
                setDraft(emptyDraft(null));
                setDone(null);
                setStep(1);
              }}
            >
              Novi termin
            </GlassButton>
          </motion.div>
        </div>
      </div>
    );
  }

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return { offset: i, label: i === 0 ? 'Danas' : i === 1 ? 'Sutra' : dayShortUpper(d), day: d.getDate() };
  });

  return (
    <div className="mx-auto min-h-dvh w-full max-w-2xl px-5 pb-[calc(130px+var(--safe-bottom))] pt-[calc(12px+var(--safe-top))] md:px-8 md:pt-8">
      {/* Zaglavlje */}
      <header className="sticky top-0 z-30 -mx-5 bg-[linear-gradient(180deg,#080A09_70%,rgba(8,10,9,0))] px-5 pb-4 pt-2 md:static md:mx-0 md:bg-none md:px-0">
        <div className="flex items-center justify-between">
          <IconButton icon={X} label="Zatvori" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} />
          <p className="text-[16px] font-extrabold">Organizuj termin</p>
          <span className="num w-11 text-right text-[15px] text-fj-text-2" aria-label={`Korak ${step} od ${STEPS}`}>
            {step}/{STEPS}
          </span>
        </div>
        <div className="mt-4 flex gap-1.5" aria-hidden>
          {Array.from({ length: STEPS }).map((_, i) => (
            <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <motion.span className="block h-full rounded-full bg-fj-green" initial={false} animate={{ width: i < step ? '100%' : '0%' }} transition={{ duration: 0.35 }} />
            </span>
          ))}
        </div>
      </header>

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.section
          key={step}
          custom={dir}
          initial={{ x: dir * 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: dir * -40, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
          className="mt-4"
        >
          {step === 1 && (
            <>
              <h1 className="text-[30px] font-extrabold tracking-[-0.025em]">Šta igrate?</h1>
              <p className="mt-1 text-fj-text-2">Izaberi sport i mjesto termina.</p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {SPORTS.map((s) => {
                  const on = draft.sport === s.id;
                  return (
                    <motion.button
                      key={s.id}
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      aria-pressed={on}
                      onClick={() =>
                        set({
                          sport: s.id,
                          total: s.defaultTotal,
                          present: Math.max(1, s.defaultTotal - 2),
                          positions: [],
                          venueIdx: draft.venueIdx != null && VENUES[draft.venueIdx].sports.includes(s.id) ? draft.venueIdx : null,
                        })
                      }
                      className={cn(
                        'flex min-h-[112px] flex-col items-start justify-between rounded-card border p-4 text-left transition-colors',
                        on ? 'border-[rgba(32,196,90,0.55)] bg-[rgba(32,196,90,0.14)]' : 'glass hover:bg-white/[0.08]',
                      )}
                    >
                      <span className={cn('grid size-11 place-items-center rounded-[14px]', on ? 'bg-fj-green text-fj-on-green' : 'bg-white/[0.07] text-fj-green')}>
                        <SportIcon sport={s.id} className="size-6" />
                      </span>
                      <span>
                        <span className={cn('block text-[15px] font-extrabold', on && 'text-fj-green')}>{s.name}</span>
                        <span className="text-[12px] font-semibold text-fj-text-2">obično {s.defaultTotal} {igraci(s.defaultTotal)}</span>
                      </span>
                    </motion.button>
                  );
                })}
              </div>

              <div className="relative mt-6">
                {venue ? (
                  <div>
                    <p className="label-caps mb-2 text-fj-text-2">Lokacija</p>
                    <div className="glass flex items-center gap-3 rounded-control p-3 pl-4">
                      <MapPin className="size-5 shrink-0 text-fj-green" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-extrabold">{venue.name}</p>
                        <p className="truncate text-[13px] text-fj-text-2">{venue.address}, {venue.city}</p>
                      </div>
                      <IconButton icon={X} label="Promijeni lokaciju" onClick={() => set({ venueIdx: null, venue: '' })} />
                    </div>
                  </div>
                ) : (
                  <>
                    <GlassInput
                      label="Lokacija"
                      icon={Search}
                      placeholder="Dvorana, balon, teren…"
                      value={draft.venue}
                      autoComplete="off"
                      role="combobox"
                      aria-expanded={venueOpen && venueMatches.length > 0}
                      aria-controls="venue-list"
                      onFocus={() => setVenueOpen(true)}
                      onBlur={() => window.setTimeout(() => setVenueOpen(false), 150)}
                      onChange={(e) => set({ venue: e.target.value, venueIdx: null })}
                      hint="Izaberi iz liste ili upiši svoju lokaciju."
                    />
                    <AnimatePresence>
                      {venueOpen && venueMatches.length > 0 && (
                        <motion.ul
                          id="venue-list"
                          role="listbox"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="glass-high absolute inset-x-0 top-[86px] z-20 overflow-hidden rounded-card bg-[rgba(16,20,17,0.95)] p-1.5"
                        >
                          {venueMatches.map(({ v, i }) => (
                            <li key={v.name} role="option" aria-selected={false}>
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  set({ venueIdx: i, venue: v.name });
                                  setVenueOpen(false);
                                }}
                                className="flex min-h-12 w-full items-center gap-3 rounded-[14px] px-3 text-left hover:bg-white/[0.07]"
                              >
                                <MapPin className="size-4 shrink-0 text-fj-green" aria-hidden />
                                <span className="min-w-0">
                                  <span className="block truncate text-[14px] font-bold">{v.name}</span>
                                  <span className="block truncate text-[12px] text-fj-text-2">{v.address}</span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-[30px] font-extrabold tracking-[-0.025em]">Kada igrate?</h1>
              <p className="mt-1 text-fj-text-2">Dan, vrijeme početka i trajanje.</p>
              <div className="no-scrollbar -mx-5 mt-6 flex gap-2 overflow-x-auto px-5 md:mx-0 md:px-0" role="radiogroup" aria-label="Dan">
                {days.map((d) => {
                  const on = draft.dayOffset === d.offset;
                  return (
                    <button
                      key={d.offset}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => set({ dayOffset: d.offset, time: null })}
                      className={cn('flex h-[74px] w-[64px] shrink-0 flex-col items-center justify-center rounded-[18px] border transition-colors', on ? 'border-[rgba(32,196,90,0.55)] bg-[rgba(32,196,90,0.14)] text-fj-green' : 'glass text-white')}
                    >
                      <span className="text-[10px] font-extrabold uppercase tracking-[1px]">{d.label}</span>
                      <span className="num mt-1 text-[24px]">{d.day}</span>
                    </button>
                  );
                })}
              </div>
              <p className="label-caps mb-2.5 mt-7 text-fj-text-2">Početak</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Vrijeme početka">
                {TIMES.map((t) => {
                  const [h, m] = t.split(':').map(Number);
                  const d = new Date(now);
                  d.setHours(0, 0, 0, 0);
                  d.setDate(d.getDate() + draft.dayOffset);
                  d.setHours(h, m);
                  const past = d.getTime() < now + 10 * 60000;
                  const on = draft.time === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={past}
                      onClick={() => set({ time: t })}
                      className={cn(
                        'num h-12 rounded-control border text-[17px] transition-colors',
                        on ? 'border-[rgba(32,196,90,0.55)] bg-[rgba(32,196,90,0.14)] text-fj-green' : 'border-white/10 bg-white/[0.045] hover:bg-white/[0.08]',
                        past && 'cursor-not-allowed text-fj-muted line-through opacity-50 hover:bg-white/[0.045]',
                      )}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <p className="label-caps mb-2.5 mt-7 text-fj-text-2">Trajanje</p>
              <GlassTabs
                ariaLabel="Trajanje"
                value={String(draft.duration) as '60' | '90' | '120'}
                onChange={(v) => set({ duration: Number(v) as 60 | 90 | 120 })}
                tabs={[
                  { value: '60', label: '60 min' },
                  { value: '90', label: '90 min' },
                  { value: '120', label: '120 min' },
                ]}
              />
            </>
          )}

          {step === 3 && sportDef && (
            <>
              <h1 className="text-[30px] font-extrabold tracking-[-0.025em]">Koliko vas je?</h1>
              <p className="mt-1 text-fj-text-2">Računamo koliko igrača vam fali.</p>
              <div className="mt-6 space-y-3">
                <GlassStepper
                  label="Ukupno igrača"
                  description="Koliko vas treba biti na terenu"
                  value={draft.total}
                  min={2}
                  max={sportDef.maxTotal}
                  onChange={(total) => set({ total, present: Math.min(draft.present, total) })}
                />
                <GlassStepper label="Već vas je" description="Uključujući tebe" value={draft.present} min={1} max={draft.total} onChange={(present) => set({ present })} />
              </div>
              <motion.div
                layout
                className={cn(
                  'relative mt-4 flex items-center justify-between overflow-hidden rounded-hero border p-6',
                  missing > 0 ? 'border-[rgba(32,196,90,0.45)] bg-[linear-gradient(150deg,rgba(32,196,90,0.22),rgba(32,196,90,0.05))]' : 'border-white/10 bg-white/[0.04]',
                )}
              >
                <div>
                  <p className={cn('label-caps', missing > 0 ? 'text-fj-green' : 'text-fj-text-2')}>Fali igrača</p>
                  <p className="mt-1 text-[14px] text-fj-text-2">{missing > 0 ? `${draft.present} od ${draft.total} — tražimo ostale` : 'Ekipa je puna — smanji broj prisutnih.'}</p>
                </div>
                <div className="relative h-[72px] w-24 overflow-hidden text-right">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={missing}
                      initial={{ y: 30, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -30, opacity: 0 }}
                      className={cn('num block text-[72px]', missing > 0 ? 'text-glow text-fj-green' : 'text-fj-muted')}
                    >
                      {Math.max(0, missing)}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </motion.div>

              <p className="label-caps mb-2.5 mt-7 text-fj-text-2">Koje pozicije tražite?</p>
              <div className="flex flex-wrap gap-2">
                {[...sportDef.positions, ANY_POSITION].map((p) => {
                  const on = draft.positions.includes(p);
                  return (
                    <GlassChip
                      key={p}
                      selected={on}
                      onClick={() => {
                        if (p === ANY_POSITION) return set({ positions: on ? [] : [ANY_POSITION] });
                        const rest = draft.positions.filter((x) => x !== ANY_POSITION);
                        set({ positions: on ? rest.filter((x) => x !== p) : [...rest, p] });
                      }}
                    >
                      {on && <Check className="size-4" strokeWidth={3} aria-hidden />}
                      {p}
                    </GlassChip>
                  );
                })}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h1 className="text-[30px] font-extrabold tracking-[-0.025em]">Još samo detalji</h1>
              <p className="mt-1 text-fj-text-2">Nivo igre i cijena po igraču.</p>
              <p className="label-caps mb-2.5 mt-6 text-fj-text-2">Nivo</p>
              <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Nivo igre">
                {LEVELS.map((l) => {
                  const on = draft.level === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => set({ level: l.id })}
                      className={cn('flex min-h-[104px] flex-col justify-between rounded-card border p-3.5 text-left transition-colors', on ? 'border-[rgba(32,196,90,0.55)] bg-[rgba(32,196,90,0.14)]' : 'glass')}
                    >
                      <LevelBars bars={l.bars} />
                      <span>
                        <span className={cn('block text-[15px] font-extrabold', on && 'text-fj-green')}>{l.label}</span>
                        <span className="block text-[11px] font-semibold leading-tight text-fj-text-2">{l.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <GlassInput
                className="mt-6"
                label="Cijena po igraču"
                inputMode="decimal"
                placeholder="0"
                value={draft.price}
                onChange={(e) => set({ price: e.target.value.replace(/[^\d.,]/g, '').slice(0, 6) })}
                suffix={<span className="text-[14px] font-extrabold text-fj-text-2">KM</span>}
                hint={!draft.price.trim() || Number(draft.price.replace(',', '.')) === 0 ? 'Prazno ili 0 = Besplatno' : 'Plaća se na licu mjesta'}
              />
              <p className="label-caps mb-3 mt-7 text-fj-text-2">Pregled kartice</p>
              {previewSession && <SessionCard s={previewSession} preview />}
            </>
          )}

          {stepError && !(step === 3 && missing <= 0) && (
            <p role={touched ? 'alert' : 'status'} className={cn('mt-5 text-[14px] font-semibold', touched ? 'text-fj-error' : 'text-fj-text-2')}>
              {stepError}
            </p>
          )}
        </motion.section>
      </AnimatePresence>

      {/* Donji stakleni bar */}
      <div className="fixed inset-x-4 bottom-[calc(16px+var(--safe-bottom))] z-40 md:sticky md:inset-x-auto md:bottom-6 md:mt-10">
        <div className="glass-bar flex gap-3 rounded-[24px] p-3">
          {step > 1 && (
            <GlassButton variant="secondary" icon={ChevronLeft} onClick={() => go(step - 1)} className="flex-1">
              Nazad
            </GlassButton>
          )}
          {step < STEPS ? (
            <GlassButton
              className="flex-[2]"
              disabled={!!stepError}
              onClick={() => (stepError ? setTouched(true) : go(step + 1))}
              aria-describedby={stepError ? 'step-error' : undefined}
            >
              Dalje
            </GlassButton>
          ) : (
            <GlassButton className="flex-[2]" disabled={!!stepError} loading={publishing} onClick={submit}>
              Objavi termin
            </GlassButton>
          )}
        </div>
        {stepError && (
          <p id="step-error" className="sr-only">
            {stepError}
          </p>
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        Korak {step} od {STEPS}. {startsAt ? `Početak ${timeHM(startsAt)}.` : ''}
      </span>
    </div>
  );
}
