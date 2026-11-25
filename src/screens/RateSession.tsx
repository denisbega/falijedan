import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Star, UserX, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useDB, useMe, useSessionView } from '../lib/hooks';
import { canRate, hasRated, rateableTeammates } from '../lib/selectors';
import { submitRatings, type RatingEntry } from '../lib/api';
import { RATING_KEYS, getSport, ratingLabel } from '../lib/sports';
import { fullName, relativeDay, timeHM } from '../lib/format';
import type { RatingKey } from '../lib/types';
import { EmptyState, GlassAvatar, GlassButton, GlassCard, IconButton, Page, useToast } from '../components/ui';

const LABELS = ['', 'Loše', 'Može bolje', 'Solidno', 'Odlično', 'Vrhunski'];

function StarInput({ value, onChange, size = 'lg', label }: { value: number; onChange: (v: number) => void; size?: 'lg' | 'sm'; label: string }) {
  return (
    <div className="flex items-center" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <motion.button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} od 5 — ${LABELS[n]}`}
          whileTap={{ scale: 0.8 }}
          onClick={() => onChange(n)}
          className={cn('grid place-items-center', size === 'lg' ? 'size-11' : 'size-9')}
        >
          <Star className={cn(size === 'lg' ? 'size-8' : 'size-6', n <= value ? 'fill-fj-green text-fj-green drop-shadow-[0_0_8px_rgba(32,196,90,0.5)]' : 'fill-white/[0.08] text-white/20')} strokeWidth={1.5} />
        </motion.button>
      ))}
    </div>
  );
}

interface Entry {
  scores: Record<RatingKey, number>;
  overall: number;
  noShow: boolean;
  comment: string;
  open: boolean;
}

export function RateSession() {
  const { id } = useParams();
  const s = useSessionView(id);
  const db = useDB();
  const me = useMe()!;
  const navigate = useNavigate();
  const { toast, error } = useToast();
  const teammates = useMemo(() => (s ? rateableTeammates(s, me.id) : []), [s, me.id]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!s) return <Page><EmptyState icon={UserX} title="Termin ne postoji" text="Link za ocjenjivanje nije ispravan." action={<GlassButton to="/moji-termini" size="md">Moji termini</GlassButton>} /></Page>;

  const already = hasRated(db, s.id, me.id);
  const allowed = canRate(s, me.id);
  const get = (uid: string): Entry => entries[uid] ?? { scores: { fairPlay: 0, teamwork: 0, punctuality: 0, skill: 0, fitness: 0 }, overall: 0, noShow: false, comment: '', open: false };
  const set = (uid: string, patch: Partial<Entry>) => setEntries((e) => ({ ...e, [uid]: { ...get(uid), ...patch } }));
  const isDone = (uid: string) => {
    const e = get(uid);
    return e.noShow || RATING_KEYS.every((k) => e.scores[k] > 0);
  };
  const doneCount = teammates.filter((t) => isDone(t.userId)).length;

  const submit = async () => {
    const payload: RatingEntry[] = teammates
      .filter((t) => isDone(t.userId))
      .map((t) => {
        const e = get(t.userId);
        return { toUserId: t.userId, scores: e.scores, comment: e.comment, noShow: e.noShow };
      });
    setBusy(true);
    try {
      await submitRatings(s.id, payload);
      setSent(true);
      window.setTimeout(() => {
        toast({ title: 'Hvala! Ocjene su poslane.', description: 'Pomažeš da ekipe budu fer i pouzdane.' });
        navigate('/moji-termini', { replace: true });
      }, 1100);
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="grid grid-cols-1 min-h-dvh place-items-center px-5 text-center">
        <div>
          <motion.div initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} className="mx-auto grid grid-cols-1 size-24 place-items-center rounded-[28px] bg-fj-green text-fj-on-green shadow-[0_18px_50px_rgba(32,196,90,0.5)]">
            <Check className="size-12" strokeWidth={3.2} aria-hidden />
          </motion.div>
          <h1 className="mt-6 text-[26px] font-extrabold">Ocjene su poslane</h1>
        </div>
      </div>
    );
  }

  if (already || !allowed) {
    return (
      <Page>
        <div className="mb-6">
          <IconButton icon={X} label="Zatvori" onClick={() => navigate(-1)} />
        </div>
        <EmptyState
          icon={already ? Check : Star}
          title={already ? 'Saigrači su već ocijenjeni' : 'Ocjenjivanje nije dostupno'}
          text={already ? 'Hvala — tvoje ocjene su sačuvane za ovaj termin.' : s.status !== 'finished' ? 'Saigrače možeš ocijeniti nakon završetka termina.' : 'Ocjenjivati mogu samo igrači koji su bili na terminu.'}
          action={<GlassButton to={`/termin/${s.id}`} size="md" variant="secondary">Nazad na termin</GlassButton>}
        />
      </Page>
    );
  }

  return (
    <Page className="max-w-2xl pb-[calc(130px+var(--safe-bottom))]">
      <header className="mb-6 flex items-start gap-3">
        <IconButton icon={X} label="Zatvori" onClick={() => navigate(-1)} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em]">Ocijeni saigrače</h1>
          <p className="mt-1 truncate text-[14px] text-fj-text-2">
            {getSport(s.sport).name} · {s.venueName} · {relativeDay(s.startsAt)} u {timeHM(s.startsAt)}
          </p>
        </div>
        <span className="num mt-2 text-[15px] text-fj-text-2" aria-live="polite">
          {doneCount}/{teammates.length}
        </span>
      </header>
      <p className="mb-5 rounded-card border border-white/[0.08] bg-white/[0.03] p-3.5 text-[13px] text-fj-text-2">
        Jedan dodir zvjezdice ocjenjuje sve kategorije odjednom. Za detalje otvori <span className="font-bold text-white">Detaljno</span>.
      </p>

      <div className="space-y-3">
        {teammates.map((t, i) => {
          const e = get(t.userId);
          const done = isDone(t.userId);
          return (
            <motion.div key={t.userId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <GlassCard className={cn('p-4 transition-colors', done && 'border-[rgba(32,196,90,0.4)]')}>
                <div className="flex items-center gap-3">
                  <GlassAvatar user={t.user} size={46} ring={t.role === 'organizer'} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-extrabold">{fullName(t.user)}</p>
                    <p className="text-[12px] font-semibold text-fj-text-2">{t.role === 'organizer' ? 'Organizator' : t.position ?? 'Igrač'}</p>
                  </div>
                  <button
                    type="button"
                    aria-pressed={e.noShow}
                    onClick={() => set(t.userId, { noShow: !e.noShow, open: false })}
                    className={cn('inline-flex h-11 items-center gap-1.5 rounded-[12px] border px-3 text-[12px] font-extrabold', e.noShow ? 'border-[rgba(240,96,90,0.5)] bg-[rgba(240,96,90,0.12)] text-fj-error' : 'border-white/10 text-fj-text-2 hover:text-white')}
                  >
                    <UserX className="size-4" aria-hidden />
                    Nije došao
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {!e.noShow && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <StarInput
                          label={`Ukupna ocjena — ${t.user.firstName}`}
                          value={e.overall}
                          onChange={(v) => set(t.userId, { overall: v, scores: { fairPlay: v, teamwork: v, punctuality: v, skill: v, fitness: v } })}
                        />
                        <button
                          type="button"
                          aria-expanded={e.open}
                          onClick={() => set(t.userId, { open: !e.open })}
                          className="inline-flex min-h-11 items-center gap-1 rounded-[12px] px-2 text-[13px] font-extrabold text-fj-text-2 hover:text-white"
                        >
                          Detaljno <ChevronDown className={cn('size-4 transition-transform', e.open && 'rotate-180')} aria-hidden />
                        </button>
                      </div>
                      {e.overall > 0 && !e.open && <p className="text-[12px] font-bold text-fj-green">{LABELS[e.overall]}</p>}
                      <AnimatePresence initial={false}>
                        {e.open && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="mt-2 space-y-1 border-t border-white/[0.08] pt-3">
                              {RATING_KEYS.map((k) => (
                                <div key={k} className="flex items-center justify-between gap-2">
                                  <span className="text-[13px] font-semibold text-fj-text-2">{ratingLabel(k, s.sport)}</span>
                                  <StarInput size="sm" label={`${ratingLabel(k, s.sport)} — ${t.user.firstName}`} value={e.scores[k]} onChange={(v) => set(t.userId, { scores: { ...e.scores, [k]: v } })} />
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <input
                        value={e.comment}
                        onChange={(ev) => set(t.userId, { comment: ev.target.value })}
                        maxLength={240}
                        placeholder="Kratak komentar (opcionalno)"
                        aria-label={`Komentar za ${t.user.firstName}`}
                        className="mt-3 h-11 w-full rounded-[14px] border border-white/10 bg-white/[0.04] px-3.5 text-[14px] outline-none placeholder:text-fj-muted focus:border-[rgba(32,196,90,0.55)]"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                {e.noShow && <p className="mt-3 text-[13px] text-fj-text-2">Izostanak utiče na pouzdanost igrača kad ga potvrdi organizator ili više saigrača.</p>}
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      <div className="fixed inset-x-4 bottom-[calc(16px+var(--safe-bottom))] z-40 md:sticky md:inset-x-auto md:bottom-6 md:mt-8">
        <div className="glass-bar flex items-center gap-3 rounded-[24px] p-3 pl-5">
          <p className="flex-1 text-[13px] font-semibold text-fj-text-2">
            {doneCount === teammates.length ? 'Sve spremno!' : `Ocijenjeno ${doneCount} od ${teammates.length}`}
          </p>
          <GlassButton onClick={submit} disabled={doneCount === 0} loading={busy} className="flex-[1.4]">
            Pošalji ocjene
          </GlassButton>
        </div>
      </div>
    </Page>
  );
}
