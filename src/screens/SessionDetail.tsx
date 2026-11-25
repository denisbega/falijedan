import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Ban,
  CalendarDays,
  Check,
  ChevronLeft,
  Clock,
  Hourglass,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Navigation,
  Share2,
  ShieldCheck,
  Star,
  UserMinus,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useDB, useMe, useOnline, useSessionView } from '../lib/hooks';
import { faliVerb, formatDistance, formatPrice, formatRating, fullName, igraci, longDate, ocjene, timeHM, untilLabel } from '../lib/format';
import { ANY_POSITION, getLevel, getSport } from '../lib/sports';
import { canRate, hasRated } from '../lib/selectors';
import { cancelSession, openDirectThread, removePlayer } from '../lib/api';
import { mapsUrl } from '../lib/utils';
import type { SessionView, TeamMember } from '../lib/types';
import {
  CapacityRing,
  EmptyState,
  GlassAvatar,
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassModal,
  IconButton,
  LevelBars,
  Page,
  SessionBadge,
  SportIcon,
  useToast,
} from '../components/ui';
import { useSessionActions } from '../components/session/useSessionActions';

const SessionMap = lazy(() => import('../components/session/SessionMap'));

function InfoTile({ icon: Icon, label, value, sub, children }: { icon: typeof Clock; label: string; value: string; sub?: string; children?: ReactNode }) {
  return (
    <GlassCard className="p-4">
      <span className="label-caps flex items-center gap-1.5 text-fj-text-2">
        <Icon className="size-3.5 text-fj-green" strokeWidth={2.6} aria-hidden />
        {label}
      </span>
      <p className="mt-2 flex items-center gap-2 text-[17px] font-extrabold leading-tight">
        {value}
        {children}
      </p>
      {sub && <p className="mt-0.5 text-[13px] text-fj-text-2">{sub}</p>}
    </GlassCard>
  );
}

function TeamGrid({ s, manage, onRemove }: { s: SessionView; manage: boolean; onRemove: (m: TeamMember) => void }) {
  const me = useMe();
  const guests = Math.max(0, s.baseCount - 1);
  const empties = Math.max(0, s.missing);
  const openLabels = s.openPositions.filter((p) => p !== ANY_POSITION);
  const cell = 'flex min-w-0 flex-col items-center gap-1.5 text-center';
  const name = 'w-full truncate text-[11px] font-bold tracking-[-0.01em]';
  const sub = '-mt-1.5 w-full truncate text-[9px] font-extrabold uppercase tracking-[0.4px]';

  return (
    <motion.div layout className="grid grid-cols-5 gap-x-2 gap-y-4 sm:grid-cols-6 md:grid-cols-8">
      <AnimatePresence initial={false}>
        {s.members.map((m) => {
          const isOrg = m.role === 'organizer';
          const isMe = m.userId === me?.id;
          return (
            <motion.div key={m.userId} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ type: 'spring', stiffness: 400, damping: 26 }} className={cn(cell, 'relative')}>
              <Link to={isMe ? '/profil' : `/igrac/${m.userId}`} className="rounded-full" aria-label={`${fullName(m.user)}${isOrg ? ', organizator' : ''}`}>
                <GlassAvatar user={m.user} size={52} ring={isOrg || isMe} />
              </Link>
              {manage && !isOrg && (
                <button
                  type="button"
                  onClick={() => onRemove(m)}
                  aria-label={`Ukloni: ${fullName(m.user)}`}
                  className="absolute -right-1 -top-1 grid grid-cols-1 size-7 place-items-center rounded-full border border-[rgba(240,96,90,0.5)] bg-[#2a1413] text-fj-error"
                >
                  <X className="size-3.5" strokeWidth={3} />
                </button>
              )}
              <span className={cn(name, isMe && 'text-fj-green')}>{isMe ? 'Ti' : m.user.firstName}</span>
              <span className={cn(sub, isOrg ? 'text-fj-green' : 'text-fj-text-2')} title={isOrg ? 'Organizator' : undefined}>
                {isOrg ? 'Org.' : m.status === 'no_show' ? 'Izostao' : m.position ?? 'Igrač'}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {Array.from({ length: guests }).map((_, i) => (
        <div key={`g${i}`} className={cell}>
          <GlassAvatar guest size={52} />
          <span className={cn(name, 'text-fj-text-2')}>Ekipa</span>
          <span className={cn(sub, 'text-fj-muted')} title="Član ekipe bez FaliJedan profila">
            Gost
          </span>
        </div>
      ))}
      {Array.from({ length: empties }).map((_, i) => (
        <motion.div key={`e${i}`} layout className={cell}>
          <GlassAvatar empty size={52} />
          <span className={cn(name, 'text-fj-green')}>Slobodno</span>
          <span className={cn(sub, 'text-fj-text-2')}>{openLabels[i] ?? 'Bilo koja'}</span>
        </motion.div>
      ))}
    </motion.div>
  );
}

export function SessionDetail() {
  const { id } = useParams();
  const s = useSessionView(id);
  const db = useDB();
  const me = useMe()!;
  const online = useOnline();
  const navigate = useNavigate();
  const { toast, error } = useToast();
  const { join, leave } = useSessionActions();
  const [confirm, setConfirm] = useState<null | 'leave' | 'cancel' | { remove: TeamMember }>(null);
  const [manage, setManage] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!s) {
    return (
      <Page>
        <div className="mb-6">
          <IconButton icon={ChevronLeft} label="Nazad" onClick={() => navigate('/')} />
        </div>
        <EmptyState icon={Ban} title="Termin ne postoji" text="Možda je uklonjen ili je link pogrešan." action={<GlassButton to="/istrazi" size="md">Pronađi termin</GlassButton>} />
      </Page>
    );
  }

  const sport = getSport(s.sport);
  const level = getLevel(s.level);
  const rateable = canRate(s, me.id);
  const rated = hasRated(db, s.id, me.id);
  const isPlayer = s.myStatus === 'confirmed' || s.isMine;
  const free = !s.priceKM;

  const share = async () => {
    const url = `${window.location.origin}/termin/${s.id}`;
    const text = `${sport.name} — ${s.venueName}, ${longDate(s.startsAt).toLowerCase()} u ${timeHM(s.startsAt)}. ${s.missing > 0 ? `${faliVerb(s.missing) === 'fali' ? 'Fali' : 'Fale'} još ${s.missing}!` : ''}`;
    try {
      if (navigator.share) await navigator.share({ title: 'FaliJedan', text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast({ title: 'Link je kopiran', description: 'Podijeli ga sa ekipom.' });
      }
    } catch {
      /* korisnik je odustao */
    }
  };

  const message = async (userId: string) => {
    try {
      navigate(`/poruke/${await openDirectThread(userId)}`);
    } catch (e) {
      error(e);
    }
  };

  const runJoin = async (waitlist: boolean) => {
    setBusy(true);
    await join(s, waitlist);
    setBusy(false);
  };
  const doConfirm = async () => {
    setBusy(true);
    try {
      if (confirm === 'leave') await leave(s);
      else if (confirm === 'cancel') {
        await cancelSession(s.id);
        toast({ tone: 'info', title: 'Termin je otkazan', description: 'Svi prijavljeni igrači su obaviješteni.' });
      } else if (confirm && 'remove' in confirm) {
        await removePlayer(s.id, confirm.remove.userId);
        toast({ tone: 'info', title: `${confirm.remove.user.firstName} je uklonjen iz termina` });
      }
    } catch (e) {
      error(e);
    }
    setBusy(false);
    setConfirm(null);
  };

  /* ---------- Donji bar: cijena + glavna akcija ---------- */
  let action: ReactNode;
  if (s.status === 'cancelled') action = <GlassButton disabled className="flex-1">Termin je otkazan</GlassButton>;
  else if (s.status === 'finished')
    action = rateable && !rated ? (
      <GlassButton to={`/termin/${s.id}/ocijeni`} icon={Star} className="flex-1">
        Ocijeni saigrače
      </GlassButton>
    ) : (
      <GlassButton disabled className="flex-1">{rated ? 'Ocijenjeno — hvala!' : 'Termin je završen'}</GlassButton>
    );
  else if (s.isMine)
    action = (
      <GlassButton to={`/igraci?termin=${s.id}`} icon={UserPlus} className="flex-1">
        Pozovi igrače
      </GlassButton>
    );
  else if (s.myStatus === 'confirmed')
    action = (
      <motion.button
        type="button"
        initial={{ scale: 0.94 }}
        animate={{ scale: 1 }}
        whileTap={{ scale: 0.97 }}
        disabled={s.started}
        onClick={() => setConfirm('leave')}
        className="flex h-[54px] flex-1 items-center justify-center gap-2 rounded-control border border-[rgba(32,196,90,0.55)] bg-[rgba(32,196,90,0.14)] px-4 text-[14px] font-extrabold uppercase tracking-[0.8px] text-fj-green disabled:opacity-60"
      >
        <Check className="size-[18px]" strokeWidth={3} aria-hidden />
        Prijavljen si
        <span className="font-bold normal-case tracking-normal text-fj-text-2">· Otkaži</span>
      </motion.button>
    );
  else if (s.myStatus === 'waitlist')
    action = (
      <GlassButton variant="secondary" icon={Hourglass} onClick={() => setConfirm('leave')} className="flex-1">
        Lista čekanja #{s.waitlistPosition} · Izađi
      </GlassButton>
    );
  else if (s.started) action = <GlassButton disabled className="flex-1">Termin je počeo</GlassButton>;
  else if (s.status === 'full')
    action = (
      <GlassButton variant="secondary" icon={Hourglass} loading={busy} onClick={() => runJoin(true)} className="flex-1">
        Lista čekanja
      </GlassButton>
    );
  else
    action = (
      <GlassButton onClick={() => runJoin(false)} loading={busy} className="flex-1">
        Pridruži se
      </GlassButton>
    );

  return (
    <Page className="pb-[calc(140px+var(--safe-bottom))] md:pb-36">
      {/* Gornja dugmad */}
      <div className="mb-5 flex items-center justify-between">
        <IconButton icon={ChevronLeft} label="Nazad" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} />
        <div className="flex gap-2.5">
          {isPlayer && s.threadId && <IconButton icon={MessagesSquare} label="Grupni chat termina" onClick={() => navigate(`/poruke/${s.threadId}`)} />}
          <IconButton icon={Share2} label="Podijeli termin" onClick={share} />
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6">
        <div className="min-w-0">
          {/* Naslov */}
          <span className="label-caps inline-flex items-center gap-2 text-fj-green">
            <SportIcon sport={s.sport} className="size-4" strokeWidth={2.3} />
            {sport.name}
          </span>
          <h1 className="mt-2 text-[30px] font-extrabold leading-[1.08] tracking-[-0.025em] md:text-[40px]">{s.venueName}</h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-[14px] font-medium text-fj-text-2">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {s.address} · {s.city}
            {s.distanceKm != null && ` · ${formatDistance(s.distanceKm)}`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <SessionBadge s={s} personal />
            {s.startsSoon && s.status === 'open' && !isPlayer && <GlassBadge tone="amber" dot>Počinje za {untilLabel(s.startsAtMs - Date.now())}</GlassBadge>}
          </div>

          {/* Glavni panel: koliko fali + prsten */}
          <GlassCard tone="high" glow className="mt-6 overflow-hidden rounded-hero p-6 md:p-8">
            <div className="relative flex items-center justify-between gap-4">
              <div className="min-w-0">
                {s.status === 'cancelled' ? (
                  <>
                    <p className="label-caps text-fj-error">Otkazano</p>
                    <p className="mt-2 text-[22px] font-extrabold">Termin se ne igra</p>
                    <p className="mt-1 text-[14px] text-fj-text-2">Organizator je otkazao termin.</p>
                  </>
                ) : s.status === 'finished' ? (
                  <>
                    <p className="label-caps text-fj-text-2">Završeno</p>
                    <p className="mt-2 text-[22px] font-extrabold">Kako je bilo?</p>
                    <p className="mt-1 text-[14px] text-fj-text-2">{rateable && !rated ? 'Ocijeni saigrače — traje manje od 30 sekundi.' : 'Hvala što igraš fer.'}</p>
                  </>
                ) : s.missing > 0 ? (
                  <>
                    <p className="label-caps text-fj-text-2">{s.missing === 1 ? 'Fali još' : 'Fale još'}</p>
                    <div className="relative h-[92px] overflow-hidden">
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.p
                          key={s.missing}
                          initial={{ y: 40, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -40, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                          className="num text-glow text-[92px] text-fj-green"
                        >
                          {s.missing}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                    <p className="text-[14px] font-semibold text-fj-text-2">{igraci(s.missing)} do pune ekipe</p>
                  </>
                ) : (
                  <>
                    <p className="label-caps text-fj-text-2">Ekipa je</p>
                    <motion.p initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-1 text-[34px] font-extrabold leading-none text-white md:text-[40px]">
                      Popunjena
                    </motion.p>
                    <p className="mt-2 text-[14px] text-fj-text-2">{s.waitlist.length ? `Na listi čekanja: ${s.waitlist.length}` : 'Lista čekanja je otvorena.'}</p>
                  </>
                )}
              </div>
              <CapacityRing filled={s.confirmedCount} total={s.totalPlayers} size={128} />
            </div>
          </GlassCard>

          {/* 2×2 info */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <InfoTile icon={CalendarDays} label="Datum" value={longDate(s.startsAt).split(',')[0]} sub={longDate(s.startsAt).split(', ')[1]} />
            <InfoTile icon={Clock} label="Početak" value={timeHM(s.startsAt)} sub={`Trajanje ${s.durationMin} min`} />
            <InfoTile icon={Wallet} label="Cijena" value={free ? 'Besplatno' : formatPrice(s.priceKM)} sub={free ? 'Bez kotizacije' : 'po igraču, na licu mjesta'} />
            <InfoTile icon={ShieldCheck} label="Nivo igre" value={level.label} sub={level.desc}>
              <LevelBars bars={level.bars} />
            </InfoTile>
          </div>

          {s.openPositions.length > 0 && s.missing > 0 && s.status === 'open' && (
            <div className="mt-6">
              <p className="label-caps mb-2.5 text-fj-text-2">Traže se</p>
              <div className="flex flex-wrap gap-2">
                {s.openPositions.map((p, i) => (
                  <GlassBadge key={`${p}${i}`} tone="green">
                    {p}
                  </GlassBadge>
                ))}
              </div>
            </div>
          )}

          {/* Ekipa */}
          <section className="mt-8" aria-labelledby="ekipa">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="ekipa" className="text-[19px] font-extrabold">
                Ekipa <span className="num ml-1 text-[15px] text-fj-text-2">{s.confirmedCount}/{s.totalPlayers}</span>
              </h2>
              {s.isMine && s.status !== 'cancelled' && s.status !== 'finished' && s.members.length > 1 && (
                <button type="button" onClick={() => setManage(!manage)} className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-[12px] px-3 text-[13px] font-extrabold', manage ? 'text-fj-green' : 'text-fj-text-2 hover:text-white')}>
                  <UserMinus className="size-4" aria-hidden />
                  {manage ? 'Gotovo' : 'Uredi ekipu'}
                </button>
              )}
            </div>
            <GlassCard className="p-5">
              <TeamGrid s={s} manage={manage} onRemove={(m) => setConfirm({ remove: m })} />
              {s.waitlist.length > 0 && (
                <p className="mt-5 border-t border-white/[0.08] pt-4 text-[13px] text-fj-text-2">
                  Lista čekanja: <span className="font-bold text-white">{s.waitlist.map((w) => w.user.firstName).join(', ')}</span>
                </p>
              )}
            </GlassCard>
          </section>
        </div>

        <aside className="min-w-0">
          {/* Organizator */}
          <section className="mt-8 lg:mt-[84px]" aria-label="Organizator">
            <GlassCard interactive className="p-4">
              <div className="flex items-center gap-3.5">
                <Link to={s.isMine ? '/profil' : `/igrac/${s.organizer.id}`} className="flex min-w-0 flex-1 items-center gap-3.5 rounded-[14px]">
                  <GlassAvatar user={s.organizer} size={52} ring verified={s.organizer.verified} />
                  <div className="min-w-0">
                    <p className="label-caps text-fj-text-2">Organizator</p>
                    <p className="truncate text-[16px] font-extrabold">{s.isMine ? 'Ti' : fullName(s.organizer)}</p>
                    <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] font-semibold text-fj-text-2">
                      <Star className="size-3 fill-fj-green text-fj-green" aria-hidden />
                      <span className="text-white">{formatRating(s.organizerRating)}</span>
                      <span>({s.organizerRatingCount} {ocjene(s.organizerRatingCount)})</span>
                      {s.organizerReliability != null && (
                        <span>
                          · <span className="text-fj-green">{s.organizerReliability}%</span> pouzdan
                        </span>
                      )}
                    </p>
                  </div>
                </Link>
                {!s.isMine && <IconButton icon={MessageCircle} label={`Poruka: ${s.organizer.firstName}`} onClick={() => message(s.organizer.id)} />}
              </div>
            </GlassCard>
          </section>

          {/* Lokacija */}
          <section className="mt-4" aria-label="Lokacija">
            <GlassCard className="overflow-hidden p-0">
              <div className="h-44">
                {online ? (
                  <Suspense fallback={<div className="shimmer size-full bg-white/[0.03]" />}>
                    <SessionMap sessions={[s]} interactive={false} className="size-full" />
                  </Suspense>
                ) : (
                  <div className="grid grid-cols-1 size-full place-items-center text-[13px] text-fj-text-2">Mapa nije dostupna offline</div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-extrabold">{s.venueName}</p>
                  <p className="truncate text-[13px] text-fj-text-2">{s.address}</p>
                </div>
                <a
                  href={mapsUrl(s.lat, s.lng, s.venueName)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-control border border-[rgba(32,196,90,0.45)] bg-[rgba(32,196,90,0.12)] px-4 text-[12px] font-extrabold uppercase tracking-[0.8px] text-fj-green"
                >
                  <Navigation className="size-4" aria-hidden /> Navigacija
                </a>
              </div>
            </GlassCard>
          </section>

          {isPlayer && s.threadId && s.status !== 'cancelled' && (
            <GlassButton to={`/poruke/${s.threadId}`} variant="secondary" icon={MessagesSquare} full className="mt-4">
              Grupni chat termina
            </GlassButton>
          )}
          {s.isMine && s.status !== 'cancelled' && s.status !== 'finished' && (
            <GlassButton variant="danger" icon={Ban} full className="mt-3" onClick={() => setConfirm('cancel')}>
              Otkaži termin
            </GlassButton>
          )}
        </aside>
      </div>

      {/* Plutajući donji bar */}
      <div className="fixed inset-x-4 bottom-[calc(16px+var(--safe-bottom))] z-50 md:bottom-6 md:left-auto md:right-8 md:w-[460px]">
        <div className="glass-bar flex items-center gap-4 rounded-[24px] p-3 pl-5">
          <div className="shrink-0">
            <p className="label-caps text-[10px] text-fj-text-2">Cijena</p>
            <p className={cn('num text-[20px]', free && 'text-fj-green')}>{free ? 'Besplatno' : formatPrice(s.priceKM)}</p>
            {!free && <p className="-mt-0.5 text-[11px] font-semibold text-fj-text-2">po igraču</p>}
          </div>
          <div className="flex min-w-0 flex-1">{action}</div>
        </div>
      </div>

      <GlassModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm === 'leave' ? (s.myStatus === 'waitlist' ? 'Izaći sa liste čekanja?' : 'Otkazati prijavu?') : confirm === 'cancel' ? 'Otkazati termin?' : 'Ukloniti igrača?'}
        description={
          confirm === 'leave'
            ? 'Mjesto se oslobađa i prvi sa liste čekanja ulazi u ekipu. Česte odjave utiču na pouzdanost.'
            : confirm === 'cancel'
              ? 'Svi prijavljeni igrači dobiće obavještenje. Ovo se ne može poništiti.'
              : confirm && typeof confirm === 'object'
                ? `${fullName(confirm.remove.user)} će dobiti obavještenje da je uklonjen iz termina.`
                : undefined
        }
        footer={
          <div className="flex gap-3">
            <GlassButton variant="secondary" className="flex-1" onClick={() => setConfirm(null)}>
              Nazad
            </GlassButton>
            <GlassButton variant="danger" className="flex-1" loading={busy} onClick={doConfirm}>
              {confirm === 'leave' ? 'Otkaži prijavu' : confirm === 'cancel' ? 'Otkaži termin' : 'Ukloni'}
            </GlassButton>
          </div>
        }
      >
        <span className="sr-only">Potvrda radnje</span>
      </GlassModal>
    </Page>
  );
}
