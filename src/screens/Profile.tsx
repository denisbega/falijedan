import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion } from 'framer-motion';
import { CalendarCheck, ChevronLeft, Download, LogOut, MessageCircle, MessageSquareQuote, Pencil, Share2, ShieldCheck, Trophy, UserX, UserPlus } from 'lucide-react';
import { useDB, useInstallPrompt, useMe, useUserStats } from '../lib/hooks';
import { formatRating, fullName, ocjene, termini, timeAgo } from '../lib/format';
import { getLevel, getSport, RATING_KEYS, ratingLabel } from '../lib/sports';
import { indexOf, playerList, type PlayerListItem } from '../lib/selectors';
import { openDirectThread, signOut } from '../lib/api';
import type { SportId } from '../lib/types';
import {
  EmptyState,
  GlassAvatar,
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassTabs,
  IconButton,
  LevelBars,
  Page,
  RatingBar,
  SportIcon,
  Stars,
  useToast,
} from '../components/ui';
import { InviteModal } from '../components/player/PlayerCard';

export function Profile() {
  const params = useParams();
  const me = useMe()!;
  const db = useDB();
  const navigate = useNavigate();
  const { toast, error } = useToast();
  const { available: canInstall, install } = useInstallPrompt();
  const isMe = !params.id || params.id === me.id;
  const user = isMe ? me : indexOf(db).users.get(params.id!) ?? null;
  const stats = useUserStats(user?.id);
  const sports = useMemo(() => db.playerSports.filter((p) => p.userId === user?.id), [db, user?.id]);
  const [tab, setTab] = useState<SportId | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [invitee, setInvitee] = useState<PlayerListItem | null>(null);

  const reviews = useMemo(() => {
    if (!user) return [];
    const idx = indexOf(db);
    return db.ratings
      .filter((r) => r.toUserId === user.id && r.comment && !r.noShow)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ r, from: idx.users.get(r.fromUserId), session: idx.sessions.get(r.sessionId) }))
      .filter((x) => x.from && x.session);
  }, [db, user]);

  if (!user || !stats) {
    return (
      <Page>
        <EmptyState icon={UserX} title="Igrač ne postoji" text="Profil je možda uklonjen." action={<GlassButton to="/igraci" size="md">Pronađi igrače</GlassButton>} />
      </Page>
    );
  }

  const activeSport = tab ?? sports[0]?.sport ?? null;
  const sportProfile = sports.find((s) => s.sport === activeSport);
  const sportStats = activeSport ? stats.perSport[activeSport] : undefined;
  const year = new Date(user.createdAt).getFullYear();
  const maxDist = Math.max(1, ...stats.distribution.map((d) => d.count));

  const share = async () => {
    const url = `${window.location.origin}/igrac/${user.id}`;
    try {
      if (navigator.share) await navigator.share({ title: `${fullName(user)} — FaliJedan`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link profila je kopiran' });
      }
    } catch {
      /* odustao */
    }
  };

  return (
    <Page>
      <div className="mb-4 flex items-center justify-between">
        {!isMe ? <IconButton icon={ChevronLeft} label="Nazad" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} /> : <span />}
        <IconButton icon={Share2} label="Podijeli profil" onClick={share} />
      </div>

      <div className="lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* Identitet + ocjena */}
        <div className="space-y-4 lg:sticky lg:top-8">
          <GlassCard tone="high" glow className="overflow-hidden rounded-hero p-6 text-center">
            <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }} className="relative mx-auto w-fit">
              <GlassAvatar user={user} size={108} ring verified={user.verified} />
            </motion.div>
            <h1 className="mt-4 text-[28px] font-extrabold leading-tight tracking-[-0.02em]">{fullName(user)}</h1>
            <p className="mt-1 text-[14px] font-medium text-fj-text-2">
              {user.city} · član od {year}.
            </p>
            {user.bio && <p className="mx-auto mt-3 max-w-xs text-[14px] text-fj-text-2">{user.bio}</p>}
            {user.verified && (
              <div className="mt-3 flex justify-center">
                <GlassBadge tone="green" icon={<ShieldCheck className="size-3.5" aria-hidden />}>
                  Verifikovan profil
                </GlassBadge>
              </div>
            )}
            <div className="mt-6 flex gap-3">
              {isMe ? (
                <>
                  <GlassButton to="/profil/uredi" icon={Pencil} size="md" className="flex-1">
                    Uredi profil
                  </GlassButton>
                  <GlassButton variant="secondary" icon={Share2} size="md" onClick={share} className="flex-1">
                    Podijeli
                  </GlassButton>
                </>
              ) : (
                <>
                  <GlassButton
                    icon={UserPlus}
                    size="md"
                    className="flex-1"
                    onClick={() => setInvitee(playerList(db).find((p) => p.user.id === user.id) ?? null)}
                  >
                    Pozovi na termin
                  </GlassButton>
                  <GlassButton
                    variant="secondary"
                    icon={MessageCircle}
                    size="md"
                    className="flex-1"
                    onClick={async () => {
                      try {
                        navigate(`/poruke/${await openDirectThread(user.id)}`);
                      } catch (e) {
                        error(e);
                      }
                    }}
                  >
                    Poruka
                  </GlassButton>
                </>
              )}
            </div>
          </GlassCard>

          {/* Panel ocjene */}
          <GlassCard className="p-5">
            <div className="flex items-center gap-5">
              <div>
                <p className="num text-glow text-[64px] text-fj-green">{formatRating(stats.overall)}</p>
                <Stars value={stats.overall} className="mt-2" />
                <p className="mt-1.5 text-[13px] font-semibold text-fj-text-2">
                  {stats.ratingCount} {ocjene(stats.ratingCount)} saigrača
                </p>
              </div>
              <div className="flex-1 space-y-1.5">
                {stats.distribution.map((d) => (
                  <div key={d.stars} className="flex items-center gap-2 text-[12px] font-bold text-fj-text-2">
                    <span className="num w-2.5 text-[12px] tracking-normal">{d.stars}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                      <motion.span
                        className="block h-full rounded-full bg-[linear-gradient(90deg,#107C3B,#20C45A)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${(d.count / maxDist) * 100}%` }}
                        transition={{ duration: 0.8, delay: (5 - d.stars) * 0.05 }}
                      />
                    </span>
                    <span className="num w-6 text-right text-[12px] tracking-normal">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          <div className="grid grid-cols-3 gap-3">
            {[
              { value: String(stats.played), label: 'odigranih termina', accent: false },
              { value: stats.reliability != null ? `${stats.reliability}%` : '—', label: 'pouzdanost dolaska', accent: true },
              { value: String(stats.organized), label: 'organizovanih termina', accent: false },
            ].map((x) => (
              <GlassCard key={x.label} className="p-4">
                <p className={`num text-[30px] ${x.accent ? 'text-fj-green' : ''}`}>{x.value}</p>
                <p className="mt-2 text-[12px] font-semibold leading-tight text-fj-text-2">{x.label}</p>
              </GlassCard>
            ))}
          </div>
        </div>

        {/* Sportovi + utisci */}
        <div className="mt-8 min-w-0 lg:mt-0">
          {sports.length > 0 ? (
            <>
              {sports.length > 1 && (
                <GlassTabs
                  ariaLabel="Sport"
                  value={activeSport!}
                  onChange={setTab}
                  tabs={sports.map((s) => ({
                    value: s.sport,
                    label: (
                      <span className="inline-flex items-center gap-1.5">
                        <SportIcon sport={s.sport} className="size-4" /> {getSport(s.sport).name}
                      </span>
                    ),
                  }))}
                />
              )}
              {sportProfile && (
                <motion.div key={sportProfile.sport} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-4">
                  <GlassCard className="p-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="label-caps text-fj-text-2">Nivo</p>
                        <p className="mt-2 flex items-center gap-2 text-[19px] font-extrabold">
                          <LevelBars bars={getLevel(sportProfile.level).bars} />
                          {getLevel(sportProfile.level).label}
                        </p>
                      </div>
                      <div>
                        <p className="label-caps text-fj-text-2">Odigrano</p>
                        <p className="mt-2 text-[19px] font-extrabold">
                          {sportStats?.played ?? 0} <span className="text-[14px] font-semibold text-fj-text-2">{termini(sportStats?.played ?? 0)}</span>
                        </p>
                      </div>
                    </div>
                    <p className="label-caps mb-2 mt-5 text-fj-text-2">Preferirane pozicije</p>
                    <div className="flex flex-wrap gap-2">
                      {sportProfile.positions.map((p) => (
                        <GlassBadge key={p} tone="green">
                          {p}
                        </GlassBadge>
                      ))}
                    </div>
                  </GlassCard>

                  <GlassCard className="p-5">
                    <h2 className="text-[19px] font-extrabold">{isMe ? 'Kako te ocjenjuju saigrači' : 'Ocjene saigrača'}</h2>
                    <p className="mt-0.5 text-[13px] text-fj-text-2">
                      {sportStats?.count ? `Na osnovu ${sportStats.count} ${ocjene(sportStats.count)} u sportu ${getSport(sportProfile.sport).name.toLowerCase()}` : 'Još nema ocjena za ovaj sport.'}
                    </p>
                    <div className="mt-5 space-y-4">
                      {RATING_KEYS.map((k) => (
                        <RatingBar key={k} label={ratingLabel(k, sportProfile.sport)} value={sportStats?.categories[k] ?? null} />
                      ))}
                    </div>
                  </GlassCard>
                </motion.div>
              )}
            </>
          ) : (
            <EmptyState compact icon={Trophy} title="Sportovi nisu dodani" text={isMe ? 'Dodaj sportove i nivo da te ekipe lakše pronađu.' : 'Igrač još nije dodao sportove.'} action={isMe ? <GlassButton to="/profil/uredi" size="md">Dodaj sportove</GlassButton> : undefined} />
          )}

          <section className="mt-8" aria-labelledby="utisci">
            <h2 id="utisci" className="mb-3.5 text-[19px] font-extrabold">
              Utisci saigrača
            </h2>
            {reviews.length ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {(showAll ? reviews : reviews.slice(0, 4)).map(({ r, from, session }) => {
                  const avg = (r.fairPlay + r.teamwork + r.punctuality + r.skill + r.fitness) / 5;
                  return (
                    <GlassCard key={r.id} tone="low" className="p-4">
                      <div className="flex items-center gap-3">
                        <GlassAvatar user={from} size={40} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-extrabold">{from!.firstName} {from!.lastName.charAt(0)}.</p>
                          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-fj-text-2">
                            <SportIcon sport={session!.sport} className="size-3.5 text-fj-green" />
                            {getSport(session!.sport).name} · {timeAgo(r.createdAt)}
                          </p>
                        </div>
                        <span className="num text-[18px] text-fj-green">{formatRating(avg)}</span>
                      </div>
                      <p className="mt-3 text-[14px] leading-relaxed text-white/90">“{r.comment}”</p>
                    </GlassCard>
                  );
                })}
              </div>
            ) : (
              <EmptyState compact icon={MessageSquareQuote} title="Još nema utisaka" text="Komentari saigrača pojavljuju se nakon odigranih termina." />
            )}
            {reviews.length > 4 && (
              <GlassButton variant="ghost" size="sm" full className="mt-3" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Prikaži manje' : `Prikaži sve (${reviews.length})`}
              </GlassButton>
            )}
          </section>

          {isMe && (
            <section className="mt-10 space-y-3" aria-label="Podešavanja">
              <GlassButton to="/moji-termini" variant="secondary" icon={CalendarCheck} full>
                Moji termini
              </GlassButton>
              {canInstall && (
                <GlassButton variant="secondary" icon={Download} full onClick={() => install()}>
                  Instaliraj aplikaciju
                </GlassButton>
              )}
              <GlassButton
                variant="danger"
                icon={LogOut}
                full
                onClick={async () => {
                  await signOut();
                  navigate('/prijava', { replace: true });
                }}
              >
                Odjavi se
              </GlassButton>
            </section>
          )}
        </div>
      </div>

      <InviteModal player={invitee} onClose={() => setInvitee(null)} />
    </Page>
  );
}
