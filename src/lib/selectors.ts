/**
 * Izvedena polja — dijele ih server i klijent (računaju se iz stanja, ne čuvaju se u bazi).
 * missing = totalPlayers − potvrđeni; ocjena = prosjek svih kategorija; pouzdanost = dolasci / (dolasci + izostanci).
 */
import type { CategoryScores, DB, Rating, RatingKey, Session, SessionPlayer, SessionView, SportId, TeamMember, User, UserStats } from './types.ts';
import { ANY_POSITION, RATING_KEYS, getSport } from './sports.ts';
import { haversineKm, mean } from './utils.ts';
import { plural } from './format.ts';

const HOUR = 3600000;

interface Index {
  users: Map<string, User>;
  playersBySession: Map<string, SessionPlayer[]>;
  ratingsTo: Map<string, Rating[]>;
  sessions: Map<string, Session>;
  threadBySession: Map<string, string>;
}
const cache = new WeakMap<DB, Index>();

export function indexOf(db: DB): Index {
  const hit = cache.get(db);
  if (hit) return hit;
  const users = new Map(db.users.map((u) => [u.id, u]));
  const playersBySession = new Map<string, SessionPlayer[]>();
  for (const p of db.sessionPlayers) {
    const arr = playersBySession.get(p.sessionId);
    if (arr) arr.push(p);
    else playersBySession.set(p.sessionId, [p]);
  }
  const ratingsTo = new Map<string, Rating[]>();
  for (const r of db.ratings) {
    const arr = ratingsTo.get(r.toUserId);
    if (arr) arr.push(r);
    else ratingsTo.set(r.toUserId, [r]);
  }
  const sessions = new Map(db.sessions.map((s) => [s.id, s]));
  const threadBySession = new Map(db.threads.filter((t) => t.sessionId).map((t) => [t.sessionId!, t.id]));
  const idx = { users, playersBySession, ratingsTo, sessions, threadBySession };
  cache.set(db, idx);
  return idx;
}

export const getMe = (db: DB): User | null => (db.currentUserId ? indexOf(db).users.get(db.currentUserId) ?? null : null);

export function confirmedCount(db: DB, s: Session): number {
  const players = indexOf(db).playersBySession.get(s.id) ?? [];
  return s.baseCount + players.filter((p) => p.role === 'player' && (p.status === 'confirmed' || p.status === 'no_show')).length;
}

const ratingAvg = (r: Rating) => (r.fairPlay + r.teamwork + r.punctuality + r.skill + r.fitness) / 5;

function categoryScores(rs: Rating[]): CategoryScores {
  const out = {} as CategoryScores;
  for (const k of RATING_KEYS) out[k] = mean(rs.map((r) => r[k as RatingKey]));
  return out;
}

const statsCache = new WeakMap<DB, Map<string, UserStats>>();

export function userStats(db: DB, userId: string, now = Date.now()): UserStats {
  let perDb = statsCache.get(db);
  if (!perDb) {
    perDb = new Map();
    statsCache.set(db, perDb);
  }
  const hit = perDb.get(userId);
  if (hit) return hit;

  const idx = indexOf(db);
  const received = (idx.ratingsTo.get(userId) ?? []).filter((r) => !r.noShow);
  const overall = mean(received.map(ratingAvg));
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: received.filter((r) => Math.min(5, Math.max(1, Math.round(ratingAvg(r)))) === stars).length,
  }));

  let played = 0;
  let noShows = 0;
  const playedBySport: Partial<Record<SportId, number>> = {};
  for (const p of db.sessionPlayers) {
    if (p.userId !== userId) continue;
    const s = idx.sessions.get(p.sessionId);
    if (!s || s.status === 'cancelled') continue;
    const ended = Date.parse(s.startsAt) + s.durationMin * 60000 <= now;
    if (!ended) continue;
    if (p.status === 'confirmed') {
      played++;
      playedBySport[s.sport] = (playedBySport[s.sport] ?? 0) + 1;
    } else if (p.status === 'no_show') noShows++;
  }
  const organized = db.sessions.filter((s) => s.organizerId === userId && s.status !== 'cancelled').length;

  const perSport: UserStats['perSport'] = {};
  const bySport = new Map<SportId, Rating[]>();
  for (const r of received) {
    const s = idx.sessions.get(r.sessionId);
    if (!s) continue;
    const arr = bySport.get(s.sport);
    if (arr) arr.push(r);
    else bySport.set(s.sport, [r]);
  }
  const sports = new Set<SportId>([...bySport.keys(), ...(Object.keys(playedBySport) as SportId[])]);
  for (const sport of sports) {
    const rs = bySport.get(sport) ?? [];
    perSport[sport] = { categories: categoryScores(rs), count: rs.length, played: playedBySport[sport] ?? 0 };
  }

  const stats: UserStats = {
    overall,
    ratingCount: received.length,
    distribution,
    categories: categoryScores(received),
    perSport,
    played,
    noShows,
    reliability: played + noShows > 0 ? Math.round((played / (played + noShows)) * 100) : null,
    organized,
  };
  perDb.set(userId, stats);
  return stats;
}

export function sessionView(db: DB, s: Session, now = Date.now()): SessionView {
  const idx = indexOf(db);
  const me = getMe(db);
  const players = idx.playersBySession.get(s.id) ?? [];
  const withUser = (p: SessionPlayer): TeamMember | null => {
    const user = idx.users.get(p.userId);
    return user ? { ...p, user } : null;
  };
  const members = players
    .filter((p) => p.status === 'confirmed' || p.status === 'no_show')
    .sort((a, b) => (a.role === 'organizer' ? -1 : b.role === 'organizer' ? 1 : a.joinedAt.localeCompare(b.joinedAt)))
    .map(withUser)
    .filter((x): x is TeamMember => !!x);
  const waitlist = players
    .filter((p) => p.status === 'waitlist')
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
    .map(withUser)
    .filter((x): x is TeamMember => !!x);

  const confirmed = confirmedCount(db, s);
  const missing = Math.max(0, s.totalPlayers - confirmed);
  const startsAtMs = Date.parse(s.startsAt);
  const endsAtMs = startsAtMs + s.durationMin * 60000;
  const status = s.status === 'cancelled' ? 'cancelled' : now >= endsAtMs ? 'finished' : missing <= 0 ? 'full' : 'open';

  const mine = me ? players.find((p) => p.userId === me.id && p.status !== 'cancelled') ?? null : null;
  const organizer = idx.users.get(s.organizerId)!;
  const orgStats = userStats(db, s.organizerId, now);

  // Slobodne pozicije = tražene pozicije koje još niko od prijavljenih nije zauzeo
  const taken = new Map<string, number>();
  for (const m of members) if (m.role === 'player' && m.position) taken.set(m.position, (taken.get(m.position) ?? 0) + 1);
  const openPositions: string[] = [];
  for (const pos of s.neededPositions) {
    const n = taken.get(pos) ?? 0;
    if (n > 0) taken.set(pos, n - 1);
    else openPositions.push(pos);
  }

  return {
    ...s,
    status,
    organizer,
    organizerRating: orgStats.overall,
    organizerRatingCount: orgStats.ratingCount,
    organizerReliability: orgStats.reliability,
    members,
    waitlist,
    confirmedCount: Math.min(confirmed, s.totalPlayers),
    missing,
    openPositions: openPositions.length ? openPositions : s.neededPositions.includes(ANY_POSITION) ? [ANY_POSITION] : [],
    distanceKm: me ? haversineKm(me, s) : null,
    startsAtMs,
    endsAtMs,
    started: now >= startsAtMs,
    startsSoon: now < startsAtMs && startsAtMs - now <= 2 * HOUR,
    myStatus: mine?.status ?? null,
    myRole: mine?.role ?? null,
    isMine: !!me && s.organizerId === me.id,
    waitlistPosition: me ? (waitlist.findIndex((w) => w.userId === me.id) + 1 || null) : null,
    threadId: idx.threadBySession.get(s.id) ?? null,
  };
}

const viewsCache = new WeakMap<DB, { minute: number; views: SessionView[] }>();
export function allSessionViews(db: DB, now = Date.now()): SessionView[] {
  const minute = Math.floor(now / 60000);
  const hit = viewsCache.get(db);
  if (hit && hit.minute === minute) return hit.views;
  const views = db.sessions.map((s) => sessionView(db, s, now));
  viewsCache.set(db, { minute, views });
  return views;
}

export const isActiveForMe = (v: SessionView) => v.myStatus === 'confirmed' || v.myStatus === 'waitlist' || v.isMine;

export function hasRated(db: DB, sessionId: string, userId: string): boolean {
  return db.ratings.some((r) => r.sessionId === sessionId && r.fromUserId === userId);
}

/** Saigrači koje korisnik može ocijeniti na završenom terminu. */
export function rateableTeammates(v: SessionView, userId: string): TeamMember[] {
  return v.members.filter((m) => m.userId !== userId);
}

export function canRate(v: SessionView, userId: string): boolean {
  if (v.status !== 'finished') return false;
  const me = v.members.find((m) => m.userId === userId && m.status === 'confirmed');
  return !!me && rateableTeammates(v, userId).length > 0;
}

export interface PlayerListItem {
  user: User;
  sports: { sport: SportId; level: import('./types.ts').Level; positions: string[] }[];
  rating: number | null;
  ratingCount: number;
  reliability: number | null;
  distanceKm: number | null;
}

export function playerList(db: DB, now = Date.now()): PlayerListItem[] {
  const me = getMe(db);
  return db.users
    .filter((u) => u.onboarded && u.id !== me?.id)
    .map((u) => {
      const st = userStats(db, u.id, now);
      return {
        user: u,
        sports: db.playerSports.filter((p) => p.userId === u.id).map(({ sport, level, positions }) => ({ sport, level, positions })),
        rating: st.overall,
        ratingCount: st.ratingCount,
        reliability: st.reliability,
        distanceKm: me ? haversineKm(me, u) : null,
      };
    });
}

export function sportLabelFor(v: { sport: SportId }) {
  return getSport(v.sport).name;
}

/* ---------- Poruke ---------- */
export interface ThreadView {
  id: string;
  kind: 'direct' | 'session';
  title: string;
  subtitle: string;
  other: User | null;
  session: SessionView | null;
  lastText: string;
  lastAt: string;
  lastFromMe: boolean;
  unread: number;
}

export function threadViews(db: DB, now = Date.now()): ThreadView[] {
  const me = getMe(db);
  if (!me) return [];
  const idx = indexOf(db);
  const out: ThreadView[] = [];
  for (const t of db.threads) {
    if (!t.memberIds.includes(me.id)) continue;
    const msgs = db.messages.filter((m) => m.threadId === t.id);
    const session = t.sessionId ? idx.sessions.get(t.sessionId) : undefined;
    const sv = session ? sessionView(db, session, now) : null;
    if (!msgs.length) {
      // Prazan grupni chat prikazujemo samo za naredne termine
      if (!sv || sv.status === 'finished' || sv.status === 'cancelled') continue;
    }
    const last = msgs[msgs.length - 1];
    const lastRead = db.reads[`${t.id}:${me.id}`] ?? '1970-01-01T00:00:00.000Z';
    const unread = msgs.filter((m) => m.fromUserId !== me.id && m.createdAt > lastRead).length;
    const otherId = t.kind === 'direct' ? t.memberIds.find((id) => id !== me.id) : undefined;
    const other = otherId ? idx.users.get(otherId) ?? null : null;
    const lastFrom = last ? idx.users.get(last.fromUserId) : undefined;
    out.push({
      id: t.id,
      kind: t.kind,
      title: t.kind === 'direct' ? (other ? `${other.firstName} ${other.lastName}` : 'Razgovor') : `${sv ? getSport(sv.sport).name : 'Termin'} · ${sv?.venueName ?? ''}`,
      subtitle: t.kind === 'session' ? `${t.memberIds.length} ${plural(t.memberIds.length, 'član', 'člana', 'članova')}` : '',
      other,
      session: sv,
      lastText: last
        ? `${last.fromUserId === me.id ? 'Ti: ' : t.kind === 'session' && lastFrom ? `${lastFrom.firstName}: ` : ''}${last.sessionId && !last.text ? 'Poziv na termin' : last.text}`
        : 'Grupni chat termina je otvoren',
      lastAt: last?.createdAt ?? t.createdAt,
      lastFromMe: last?.fromUserId === me.id,
      unread,
    });
  }
  return out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

export function unreadMessages(db: DB): number {
  return threadViews(db).reduce((a, t) => a + t.unread, 0);
}
export function unreadNotifications(db: DB): number {
  const me = getMe(db);
  return me ? db.notifications.filter((n) => n.userId === me.id && !n.read).length : 0;
}
