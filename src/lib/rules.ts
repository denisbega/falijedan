/**
 * Poslovna pravila FaliJedan — izvršava ih SERVER (server/engine.ts) nad nacrtom stanja.
 * Svaka funkcija prima nacrt (draft) baze i ID korisnika koji radi akciju;
 * ako pravilo nije ispunjeno, baca ApiError i transakcija se odbacuje.
 */
import type { AppNotification, DB, Level, NotificationType, RatingKey, Session, SportId, User } from './types.ts';
import { ANY_POSITION, CITIES, LEVELS, getSport, isSportId } from './sports.ts';
import { fullName, igraci, relativeDay, timeHM, untilLabel } from './format.ts';
import { haversineKm, uid } from './utils.ts';
import { ApiError } from './errors.ts';
import { BOT_USER_IDS, DEMO_USER_ID } from './seed.ts';

export { ApiError };

const nowIso = () => new Date().toISOString();
const HOUR = 3600000;

/* ---------- Pomoćne ---------- */

export function requireUser(d: DB, userId: string): User {
  const u = d.users.find((x) => x.id === userId);
  if (!u) throw new ApiError('Moraš biti prijavljen.', 401);
  return u;
}
function requireSession(d: DB, id: string): Session {
  const s = d.sessions.find((x) => x.id === id);
  if (!s) throw new ApiError('Termin ne postoji ili je uklonjen.', 404);
  return s;
}
export function notify(d: DB, userId: string, n: { type: NotificationType; title: string; body: string; link?: string; dedupeKey?: string }) {
  if (n.dedupeKey && d.notifications.some((x) => x.userId === userId && x.dedupeKey === n.dedupeKey)) return;
  const item: AppNotification = { id: uid('n'), userId, createdAt: nowIso(), read: false, ...n };
  d.notifications.unshift(item);
}
const sessionLabel = (s: Session) => `${getSport(s.sport).name} · ${s.venueName} · ${relativeDay(s.startsAt).toLowerCase()} u ${timeHM(s.startsAt)}`;
const activeRecord = (d: DB, sessionId: string, userId: string) =>
  d.sessionPlayers.find((p) => p.sessionId === sessionId && p.userId === userId && (p.status === 'confirmed' || p.status === 'waitlist'));
const confirmedIn = (d: DB, s: Session) =>
  d.sessionPlayers.filter((p) => p.sessionId === s.id && p.role === 'player' && (p.status === 'confirmed' || p.status === 'no_show'));
/** missing = totalPlayers − potvrđeni (izvedeno polje) */
export const missingOf = (d: DB, s: Session) => s.totalPlayers - s.baseCount - confirmedIn(d, s).length;
const hasRated = (d: DB, sessionId: string, userId: string) => d.ratings.some((r) => r.sessionId === sessionId && r.fromUserId === userId);
const endsAt = (s: Session) => Date.parse(s.startsAt) + s.durationMin * 60000;

function ensureThreadMember(d: DB, sessionId: string, userId: string) {
  const t = d.threads.find((x) => x.sessionId === sessionId);
  if (t && !t.memberIds.includes(userId)) t.memberIds.push(userId);
}
/** Ko napusti termin ili bude uklonjen, gubi pristup grupnom razgovoru termina. */
function leaveThread(d: DB, sessionId: string, userId: string) {
  const t = d.threads.find((x) => x.sessionId === sessionId);
  if (t) t.memberIds = t.memberIds.filter((id) => id !== userId);
}
/** Koordinate korisnika čuvamo zaokružene na ~1 km (0,01°) — dovoljno za "u blizini", a ne otkriva adresu. */
export const roundCoord = (v: number) => Math.round(v * 100) / 100;
const MAX_ACTIVE_SESSIONS = 10;
const RATING_WINDOW_MS = 14 * 86400000;

function pickPosition(d: DB, s: Session, userId: string): string | undefined {
  const preferred = d.playerSports.find((p) => p.userId === userId && p.sport === s.sport)?.positions ?? [];
  const taken = confirmedIn(d, s).map((p) => p.position).filter(Boolean) as string[];
  const open: string[] = [];
  for (const pos of s.neededPositions) {
    if (pos === ANY_POSITION) continue;
    const i = taken.indexOf(pos);
    if (i >= 0) taken.splice(i, 1);
    else open.push(pos);
  }
  return open.find((p) => preferred.includes(p)) ?? open[0] ?? preferred.find((p) => getSport(s.sport).positions.includes(p));
}

function addPlayer(d: DB, s: Session, userId: string, allowWaitlist: boolean): 'confirmed' | 'waitlist' {
  const missing = missingOf(d, s);
  if (missing <= 0 && !allowWaitlist) throw new ApiError('Termin je popunjen.', 409);
  const status = missing > 0 ? 'confirmed' : 'waitlist';
  const position = status === 'confirmed' ? pickPosition(d, s, userId) : undefined;
  const existing = d.sessionPlayers.find((p) => p.sessionId === s.id && p.userId === userId);
  if (existing) Object.assign(existing, { status, joinedAt: nowIso(), position });
  else d.sessionPlayers.push({ sessionId: s.id, userId, role: 'player', status, joinedAt: nowIso(), position });
  ensureThreadMember(d, s.id, userId);

  const user = requireUser(d, userId);
  if (status === 'confirmed') {
    const left = missingOf(d, s);
    notify(d, s.organizerId, {
      type: 'player_joined',
      title: `Nova prijava na tvoj termin: ${user.firstName}`,
      body: left > 0 ? `${sessionLabel(s)} · još ${left} ${igraci(left)} do pune ekipe` : sessionLabel(s),
      link: `/termin/${s.id}`,
    });
    if (left <= 0) {
      s.status = 'full';
      const everyone = d.sessionPlayers.filter((p) => p.sessionId === s.id && p.status === 'confirmed').map((p) => p.userId);
      const round = d.sessionPlayers.filter((p) => p.sessionId === s.id).length;
      for (const id of everyone)
        notify(d, id, { type: 'session_full', title: 'Termin je popunjen', body: `${sessionLabel(s)} — ekipa je kompletna.`, link: `/termin/${s.id}`, dedupeKey: `full:${s.id}:${round}` });
    }
  }
  return status;
}

function afterSpotFreed(d: DB, s: Session) {
  if (s.status === 'full') s.status = 'open';
  const next = d.sessionPlayers.filter((p) => p.sessionId === s.id && p.status === 'waitlist').sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0];
  if (next && missingOf(d, s) > 0) {
    next.status = 'confirmed';
    next.position = pickPosition(d, s, next.userId);
    notify(d, next.userId, {
      type: 'waitlist_promoted',
      title: 'Oslobodilo se mjesto — u ekipi si!',
      body: `Sa liste čekanja si sada u ekipi: ${sessionLabel(s)}.`,
      link: `/termin/${s.id}`,
    });
    if (missingOf(d, s) <= 0) s.status = 'full';
  }
}

function assertJoinable(s: Session) {
  if (s.status === 'cancelled') throw new ApiError('Termin je otkazan.', 409);
  if (Date.parse(s.startsAt) <= Date.now()) throw new ApiError('Termin je već počeo — prijave su zatvorene.', 409);
}

/* ============================ KORISNICI ============================ */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function createUser(
  d: DB,
  /** relaxed: OAuth nalozi (Apple ponekad ne šalje ime) — ime se može dopuniti u profilu */
  input: { firstName: string; lastName: string; email: string; passwordHash: string | null; verified?: boolean; relaxed?: boolean },
): string {
  const firstName = input.firstName.trim() || 'Igrač';
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  if (!input.relaxed && firstName.length < 2) throw new ApiError('Unesi ime.');
  if (!input.relaxed && lastName.length < 2) throw new ApiError('Unesi prezime.');
  if (!EMAIL_RE.test(email)) throw new ApiError('Email adresa nije ispravna.');
  if (d.users.some((u) => u.email?.toLowerCase() === email)) throw new ApiError('Nalog sa ovim emailom već postoji. Prijavi se.', 409);
  const city = CITIES[0];
  const user: User = {
    id: uid('u'),
    firstName: firstName.slice(0, 40),
    lastName: lastName.slice(0, 40),
    email,
    passwordHash: input.passwordHash,
    city: city.name,
    lat: city.lat,
    lng: city.lng,
    radiusKm: 10,
    createdAt: nowIso(),
    verified: !!input.verified,
    onboarded: false,
  };
  d.users.push(user);
  return user.id;
}

export interface SportProfileInput {
  sport: SportId;
  level: Level;
  positions: string[];
}

export function saveProfile(
  d: DB,
  actorId: string,
  input: { firstName?: string; lastName?: string; bio?: string; sports?: SportProfileInput[]; city?: string; lat?: number; lng?: number; radiusKm?: number; completeOnboarding?: boolean },
) {
  const me = requireUser(d, actorId);
  if (input.firstName !== undefined) {
    if (input.firstName.trim().length < 2) throw new ApiError('Ime je prekratko.');
    me.firstName = input.firstName.trim().slice(0, 40);
  }
  if (input.lastName !== undefined) {
    if (input.lastName.trim().length < 2) throw new ApiError('Prezime je prekratko.');
    me.lastName = input.lastName.trim().slice(0, 40);
  }
  if (input.bio !== undefined) me.bio = input.bio.trim().slice(0, 160);
  if (input.sports) {
    const valid = input.sports.filter((s) => isSportId(s.sport) && LEVELS.some((l) => l.id === s.level)).slice(0, 6);
    if (!valid.length) throw new ApiError('Izaberi bar jedan sport.');
    d.playerSports = d.playerSports.filter((p) => p.userId !== me.id);
    for (const s of valid) {
      const allowed = [...getSport(s.sport).positions, ANY_POSITION];
      const positions = s.positions.filter((p) => allowed.includes(p));
      d.playerSports.push({ userId: me.id, sport: s.sport, level: s.level, positions: positions.length ? positions : [ANY_POSITION] });
    }
  }
  if (input.city) me.city = input.city.trim().slice(0, 60);
  if (input.lat != null && input.lng != null && Math.abs(input.lat) <= 90 && Math.abs(input.lng) <= 180) {
    me.lat = roundCoord(input.lat);
    me.lng = roundCoord(input.lng);
  }
  if (input.radiusKm != null) me.radiusKm = Math.min(50, Math.max(1, Math.round(input.radiusKm)));
  if (input.completeOnboarding) {
    if (!d.playerSports.some((p) => p.userId === me.id)) throw new ApiError('Izaberi bar jedan sport.');
    me.onboarded = true;
  }
}

/* ============================ TERMINI ============================ */

export function joinSession(d: DB, actorId: string, sessionId: string, waitlist: boolean) {
  const me = requireUser(d, actorId);
  const s = requireSession(d, sessionId);
  assertJoinable(s);
  if (s.organizerId === me.id) throw new ApiError('Ti si organizator ovog termina.');
  if (activeRecord(d, s.id, me.id)) throw new ApiError('Već si prijavljen na ovaj termin.', 409);
  if (d.sessionPlayers.some((p) => p.sessionId === s.id && p.userId === me.id && p.status === 'removed'))
    throw new ApiError('Organizator te je uklonio iz ovog termina.', 403);
  const status = addPlayer(d, s, me.id, waitlist);
  return { status, missing: Math.max(0, missingOf(d, s)) };
}

export function leaveSession(d: DB, actorId: string, sessionId: string) {
  const me = requireUser(d, actorId);
  const s = requireSession(d, sessionId);
  const rec = activeRecord(d, s.id, me.id);
  if (!rec) throw new ApiError('Nisi prijavljen na ovaj termin.');
  if (rec.role === 'organizer') throw new ApiError('Organizator ne može napustiti termin — možeš ga otkazati.');
  if (Date.parse(s.startsAt) <= Date.now()) throw new ApiError('Termin je već počeo — odjava više nije moguća.', 409);
  const wasConfirmed = rec.status === 'confirmed';
  rec.status = 'cancelled';
  leaveThread(d, s.id, me.id);
  if (wasConfirmed) {
    notify(d, s.organizerId, { type: 'player_left', title: `Odjava sa tvog termina: ${me.firstName}`, body: `${sessionLabel(s)} — oslobodilo se mjesto.`, link: `/termin/${s.id}` });
    afterSpotFreed(d, s);
  }
}

export interface CreateSessionInput {
  sport: SportId;
  venueName: string;
  address?: string;
  city?: string;
  lat?: number;
  lng?: number;
  startsAt: string;
  durationMin: number;
  totalPlayers: number;
  baseCount: number;
  priceKM: number | null;
  level: Level;
  neededPositions: string[];
}

export function validateSessionInput(i: Partial<CreateSessionInput>): string | null {
  if (!i.sport || !isSportId(i.sport)) return 'Izaberi sport.';
  if (!i.venueName || i.venueName.trim().length < 3) return 'Unesi lokaciju termina.';
  if (!i.startsAt || Number.isNaN(Date.parse(i.startsAt)) || Date.parse(i.startsAt) < Date.now() + 10 * 60000) return 'Izaberi vrijeme u budućnosti.';
  if (Date.parse(i.startsAt) > Date.now() + 60 * 86400000) return 'Termin može biti najviše 60 dana unaprijed.';
  if (!i.durationMin || ![60, 90, 120].includes(i.durationMin)) return 'Izaberi trajanje.';
  if (!i.totalPlayers || i.totalPlayers < 2 || i.totalPlayers > getSport(i.sport).maxTotal) return 'Broj igrača nije ispravan.';
  if (!i.baseCount || i.baseCount < 1) return 'Bar ti si već u ekipi.';
  if (i.baseCount >= i.totalPlayers) return 'Ekipa je puna — smanji broj prisutnih.';
  if (i.priceKM != null && (Number.isNaN(i.priceKM) || i.priceKM < 0 || i.priceKM > 200)) return 'Cijena nije ispravna.';
  if (!i.level || !LEVELS.some((l) => l.id === i.level)) return 'Izaberi nivo igre.';
  return null;
}

export function createSession(d: DB, actorId: string, input: CreateSessionInput) {
  const error = validateSessionInput(input);
  if (error) throw new ApiError(error);
  const me = requireUser(d, actorId);
  const start = Date.parse(input.startsAt);
  const end = start + input.durationMin * 60000;
  const mine = d.sessions.filter((x) => x.organizerId === me.id && x.status !== 'cancelled' && endsAt(x) > Date.now());
  if (mine.length >= MAX_ACTIVE_SESSIONS) throw new ApiError(`Možeš imati najviše ${MAX_ACTIVE_SESSIONS} aktivnih termina. Otkaži neki ili sačekaj da se odigra.`, 429);
  // Duplikat (spam): isti sport, ista lokacija i vrijeme koje se preklapa. Različiti tereni u isto vrijeme su dozvoljeni.
  const venueKey = input.venueName.trim().toLowerCase();
  if (mine.some((x) => x.sport === input.sport && x.venueName.trim().toLowerCase() === venueKey && Date.parse(x.startsAt) < end && endsAt(x) > start))
    throw new ApiError('Već imaš ovaj termin (isti sport i lokacija u to vrijeme).', 409);
  const id = uid('s');
  const createdAt = nowIso();
  const allowed = [...getSport(input.sport).positions, ANY_POSITION];
  const needed = input.neededPositions.filter((p) => allowed.includes(p)).slice(0, 8);
  const session: Session = {
    id,
    organizerId: me.id,
    sport: input.sport,
    venueName: input.venueName.trim().slice(0, 80),
    address: input.address?.trim().slice(0, 120) || input.city || me.city,
    city: (input.city || me.city).slice(0, 60),
    lat: input.lat ?? roundCoord(me.lat),
    lng: input.lng ?? roundCoord(me.lng),
    startsAt: new Date(input.startsAt).toISOString(),
    durationMin: input.durationMin,
    totalPlayers: input.totalPlayers,
    baseCount: input.baseCount,
    priceKM: input.priceKM && input.priceKM > 0 ? Math.round(input.priceKM * 100) / 100 : null,
    level: input.level,
    neededPositions: needed.length ? needed : [ANY_POSITION],
    status: 'open',
    createdAt,
  };
  d.sessions.push(session);
  d.sessionPlayers.push({ sessionId: id, userId: me.id, role: 'organizer', status: 'confirmed', joinedAt: createdAt });
  d.threads.push({ id: uid('t'), kind: 'session', sessionId: id, memberIds: [me.id], createdAt });

  // Javljamo igračima tog sporta u njihovom radijusu
  const missing = input.totalPlayers - input.baseCount;
  const nearby = d.playerSports
    .filter((p) => p.sport === input.sport && p.userId !== me.id)
    .map((p) => d.users.find((u) => u.id === p.userId))
    .filter((u): u is User => !!u && u.onboarded && haversineKm(u, session) <= Math.max(10, u.radiusKm));
  for (const u of nearby)
    notify(d, u.id, {
      type: 'nearby_session',
      title: `Novi termin u blizini: ${getSport(input.sport).name}`,
      body: `${session.venueName} · ${relativeDay(session.startsAt).toLowerCase()} u ${timeHM(session.startsAt)} — ${missing === 1 ? 'fali 1 igrač' : `fale ${missing} ${igraci(missing)}`}.`,
      link: `/termin/${id}`,
    });
  return { id, notified: nearby.length };
}

/** Demo: igrač iz blizine (bot) se prijavi na novi termin. */
export function botJoin(d: DB, sessionId: string, botIds: ReadonlySet<string>) {
  const s = d.sessions.find((x) => x.id === sessionId);
  if (!s || s.status === 'cancelled' || Date.parse(s.startsAt) <= Date.now() || missingOf(d, s) <= 1) return false;
  const taken = new Set(d.sessionPlayers.filter((p) => p.sessionId === s.id).map((p) => p.userId));
  const candidate = d.playerSports.filter((p) => p.sport === s.sport && botIds.has(p.userId) && !taken.has(p.userId)).map((p) => p.userId)[0];
  if (!candidate) return false;
  addPlayer(d, s, candidate, false);
  return true;
}

export function cancelSession(d: DB, actorId: string, sessionId: string) {
  const me = requireUser(d, actorId);
  const s = requireSession(d, sessionId);
  if (s.organizerId !== me.id) throw new ApiError('Samo organizator može otkazati termin.', 403);
  if (s.status === 'cancelled') throw new ApiError('Termin je već otkazan.');
  if (endsAt(s) <= Date.now()) throw new ApiError('Termin je već završen.');
  s.status = 'cancelled';
  const affected = d.sessionPlayers.filter((p) => p.sessionId === s.id && p.userId !== me.id && (p.status === 'confirmed' || p.status === 'waitlist'));
  for (const p of affected) notify(d, p.userId, { type: 'session_cancelled', title: 'Termin je otkazan', body: `${sessionLabel(s)} je otkazan.`, link: `/termin/${s.id}` });
}

export function removePlayer(d: DB, actorId: string, sessionId: string, userId: string) {
  const me = requireUser(d, actorId);
  const s = requireSession(d, sessionId);
  if (s.organizerId !== me.id) throw new ApiError('Samo organizator može uklanjati igrače.', 403);
  if (userId === me.id) throw new ApiError('Ne možeš ukloniti sebe.');
  if (Date.parse(s.startsAt) <= Date.now()) throw new ApiError('Termin je već počeo.', 409);
  const rec = activeRecord(d, s.id, userId);
  if (!rec) throw new ApiError('Igrač nije u ekipi.');
  const wasConfirmed = rec.status === 'confirmed';
  rec.status = 'removed';
  leaveThread(d, s.id, userId);
  notify(d, userId, { type: 'removed', title: 'Uklonjen si iz ekipe termina', body: `${sessionLabel(s)}.`, link: `/termin/${s.id}` });
  if (wasConfirmed) afterSpotFreed(d, s);
}

/* ============================ OCJENE ============================ */

export interface RatingEntry {
  toUserId: string;
  scores: Record<RatingKey, number>;
  comment?: string;
  noShow?: boolean;
}

export function submitRatings(d: DB, actorId: string, sessionId: string, entries: RatingEntry[]) {
  const me = requireUser(d, actorId);
  const s = requireSession(d, sessionId);
  if (s.status === 'cancelled') throw new ApiError('Otkazani termini se ne ocjenjuju.');
  if (endsAt(s) > Date.now()) throw new ApiError('Ocjenjivanje je moguće tek nakon završetka termina.');
  if (Date.now() - endsAt(s) > RATING_WINDOW_MS) throw new ApiError('Rok za ocjenjivanje ovog termina je istekao (14 dana).', 409);
  const myRec = d.sessionPlayers.find((p) => p.sessionId === s.id && p.userId === me.id && p.status === 'confirmed');
  if (!myRec) throw new ApiError('Ocjenjivati mogu samo igrači koji su bili na terminu.', 403);
  if (hasRated(d, s.id, me.id)) throw new ApiError('Saigrači su već ocijenjeni za ovaj termin.', 409);
  const participants = new Set(d.sessionPlayers.filter((p) => p.sessionId === s.id && (p.status === 'confirmed' || p.status === 'no_show')).map((p) => p.userId));
  if (!entries.length) throw new ApiError('Ocijeni bar jednog saigrača.');
  const seen = new Set<string>();
  for (const e of entries) {
    if (e.toUserId === me.id) throw new ApiError('Ne možeš ocijeniti sebe.');
    if (!participants.has(e.toUserId)) throw new ApiError('Možeš ocijeniti samo igrače sa ovog termina.');
    if (seen.has(e.toUserId)) throw new ApiError('Igrača možeš ocijeniti samo jednom.');
    seen.add(e.toUserId);
    if (!e.noShow && Object.values(e.scores).some((v) => !(Number.isInteger(v) && v >= 1 && v <= 5))) throw new ApiError('Ocjene moraju biti od 1 do 5.');
    d.ratings.push({
      id: uid('r'),
      sessionId: s.id,
      fromUserId: me.id,
      toUserId: e.toUserId,
      ...(e.noShow ? { fairPlay: 0, teamwork: 0, punctuality: 0, skill: 0, fitness: 0 } : e.scores),
      comment: e.noShow ? undefined : e.comment?.trim().slice(0, 240) || undefined,
      noShow: e.noShow || undefined,
      createdAt: nowIso(),
    });
    if (e.noShow) {
      // Izostanak se bilježi ako ga prijavi organizator ili bar dvoje saigrača
      const reports = d.ratings.filter((r) => r.sessionId === s.id && r.toUserId === e.toUserId && r.noShow).length;
      if (s.organizerId === me.id || reports >= 2) {
        const rec = d.sessionPlayers.find((p) => p.sessionId === s.id && p.userId === e.toUserId);
        if (rec) rec.status = 'no_show';
      }
    }
  }
  d.notifications.forEach((n) => {
    if (n.userId === me.id && n.dedupeKey === `rate:${s.id}`) n.read = true;
  });
}

/* ============================ PORUKE ============================ */

export function openDirectThread(d: DB, actorId: string, otherUserId: string): string {
  const me = requireUser(d, actorId);
  if (otherUserId === me.id) throw new ApiError('Ne možeš slati poruke sebi.');
  requireUser(d, otherUserId);
  const existing = d.threads.find((t) => t.kind === 'direct' && t.memberIds.includes(me.id) && t.memberIds.includes(otherUserId));
  if (existing) return existing.id;
  const id = uid('t');
  d.threads.push({ id, kind: 'direct', memberIds: [me.id, otherUserId], createdAt: nowIso() });
  return id;
}

export function sendMessage(d: DB, actorId: string, threadId: string, text: string, sessionId?: string) {
  const me = requireUser(d, actorId);
  const clean = text.trim().slice(0, 1000);
  if (!clean && !sessionId) throw new ApiError('Poruka je prazna.');
  const t = d.threads.find((x) => x.id === threadId);
  if (!t || !t.memberIds.includes(me.id)) throw new ApiError('Nemaš pristup ovom razgovoru.', 403);
  if (sessionId && !d.sessions.some((s) => s.id === sessionId)) throw new ApiError('Termin ne postoji.');
  const createdAt = nowIso();
  d.messages.push({ id: uid('m'), threadId, fromUserId: me.id, text: clean, createdAt, sessionId });
  d.reads[`${threadId}:${me.id}`] = createdAt;
  return { kind: t.kind, memberIds: [...t.memberIds], others: t.memberIds.filter((id) => id !== me.id) };
}

export function markThreadRead(d: DB, actorId: string, threadId: string) {
  const t = d.threads.find((x) => x.id === threadId);
  if (!t || !t.memberIds.includes(actorId)) throw new ApiError('Nemaš pristup ovom razgovoru.', 403);
  d.reads[`${threadId}:${actorId}`] = nowIso();
}

export function inviteToSession(d: DB, actorId: string, userId: string, sessionId: string) {
  const me = requireUser(d, actorId);
  const s = requireSession(d, sessionId);
  if (s.organizerId !== me.id && !activeRecord(d, s.id, me.id)) throw new ApiError('Možeš pozivati samo na termine u kojima učestvuješ.', 403);
  assertJoinable(s);
  if (activeRecord(d, s.id, userId)) throw new ApiError('Igrač je već u ovom terminu.', 409);
  const threadId = openDirectThread(d, actorId, userId);
  const user = requireUser(d, userId);
  const missing = missingOf(d, s);
  const text = `Ćao ${user.firstName}! Pozivam te na termin — ${getSport(s.sport).name.toLowerCase()}, ${relativeDay(s.startsAt).toLowerCase()} u ${timeHM(s.startsAt)}. ${missing === 1 ? 'Fali nam još jedan.' : `Fale nam još ${missing}.`}`;
  const createdAt = nowIso();
  d.messages.push({ id: uid('m'), threadId, fromUserId: me.id, text, createdAt, sessionId: s.id });
  d.reads[`${threadId}:${me.id}`] = createdAt;
  notify(d, userId, { type: 'invite', title: `${fullName(me)} te poziva na termin`, body: sessionLabel(s), link: `/termin/${s.id}` });
  return threadId;
}

/* ============================ OBAVJEŠTENJA ============================ */

export function markNotificationRead(d: DB, actorId: string, id: string) {
  const n = d.notifications.find((x) => x.id === id && x.userId === actorId);
  if (!n) throw new ApiError('Obavještenje ne postoji.', 404);
  n.read = true;
}

export function markAllNotificationsRead(d: DB, actorId: string) {
  d.notifications.forEach((n) => {
    if (n.userId === actorId) n.read = true;
  });
}

/* ============================ NALOG (privatnost) ============================ */

/** Obrisan nalog: nema emaila (svi aktivni nalozi ga imaju). */
export const isDeletedUser = (u: User) => !u.email;

/**
 * Brisanje naloga: lični podaci se brišu, budući termini se otkazuju/napuštaju, a nalog ostaje kao
 * anonimni "Obrisan korisnik" (da poruke i ocjene drugih igrača ostanu smislene). Prijava više nije moguća.
 */
export function deleteAccount(d: DB, actorId: string) {
  const me = requireUser(d, actorId);
  const now = Date.now();
  for (const s of d.sessions) {
    if (s.organizerId !== me.id || s.status === 'cancelled' || Date.parse(s.startsAt) <= now) continue;
    s.status = 'cancelled';
    for (const p of d.sessionPlayers)
      if (p.sessionId === s.id && p.userId !== me.id && (p.status === 'confirmed' || p.status === 'waitlist'))
        notify(d, p.userId, { type: 'session_cancelled', title: 'Termin je otkazan', body: `${sessionLabel(s)} je otkazan.`, link: `/termin/${s.id}` });
  }
  for (const p of d.sessionPlayers) {
    if (p.userId !== me.id || p.role === 'organizer' || (p.status !== 'confirmed' && p.status !== 'waitlist')) continue;
    const s = d.sessions.find((x) => x.id === p.sessionId);
    if (!s || s.status === 'cancelled' || Date.parse(s.startsAt) <= now) continue;
    const wasConfirmed = p.status === 'confirmed';
    p.status = 'cancelled';
    if (wasConfirmed) afterSpotFreed(d, s);
  }
  for (const t of d.threads) if (t.kind === 'session') t.memberIds = t.memberIds.filter((id) => id !== me.id);
  d.playerSports = d.playerSports.filter((p) => p.userId !== me.id);
  d.notifications = d.notifications.filter((n) => n.userId !== me.id);
  for (const k of Object.keys(d.reads)) if (k.endsWith(`:${me.id}`)) delete d.reads[k];
  Object.assign(me, { firstName: 'Obrisan', lastName: 'korisnik', email: undefined, passwordHash: null, avatar: null, bio: undefined, city: '', lat: 0, lng: 0, radiusKm: 10, verified: false, onboarded: false });
}

/** Admin: izmjena tuđeg profila (ulaz je već validiran u ruti). Obrisani nalozi se ne mogu mijenjati. */
export function adminUpdateUser(d: DB, targetId: string, input: { firstName?: string; lastName?: string; email?: string; city?: string; bio?: string; verified?: boolean }) {
  const u = d.users.find((x) => x.id === targetId);
  if (!u || isDeletedUser(u)) throw new ApiError('Korisnik ne postoji ili je obrisan.', 404);
  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new ApiError('Email adresa nije ispravna.');
    if (d.users.some((x) => x.id !== u.id && x.email?.toLowerCase() === email)) throw new ApiError('Drugi nalog već koristi taj email.', 409);
    u.email = email;
  }
  if (input.firstName !== undefined) u.firstName = input.firstName.trim().slice(0, 40);
  if (input.lastName !== undefined) u.lastName = input.lastName.trim().slice(0, 40);
  if (input.city !== undefined) u.city = input.city.trim().slice(0, 60);
  if (input.bio !== undefined) u.bio = input.bio.trim().slice(0, 160);
  if (input.verified !== undefined) u.verified = input.verified;
}

/** Izvoz ličnih podataka (pravo na pristup podacima): sve što aplikacija čuva o korisniku. */
export function exportUserData(d: DB, userId: string) {
  const me = requireUser(d, userId);
  const { passwordHash: _ph, ...profile } = me;
  const myThreads = new Set(d.threads.filter((t) => t.memberIds.includes(userId)).map((t) => t.id));
  return {
    exportedAt: nowIso(),
    profile,
    sports: d.playerSports.filter((p) => p.userId === userId),
    sessionsOrganized: d.sessions.filter((s) => s.organizerId === userId),
    participation: d.sessionPlayers.filter((p) => p.userId === userId),
    ratingsGiven: d.ratings.filter((r) => r.fromUserId === userId),
    ratingsReceived: d.ratings.filter((r) => r.toUserId === userId).map(({ fromUserId: _f, ...r }) => r),
    messagesSent: d.messages.filter((m) => m.fromUserId === userId && myThreads.has(m.threadId)),
    notifications: d.notifications.filter((n) => n.userId === userId),
  };
}

/* ============================ DEMO PODACI ============================ */

/** Demo korisnik = fiksni demo ID (u-demo, u1…u20) I demo email (@falijedan.app) — pravi nalozi imaju ID "u_…". */
const isDemoUser = (u: User) => (u.id === DEMO_USER_ID || BOT_USER_IDS.has(u.id)) && !!u.email?.endsWith('@falijedan.app');

export const hasDemoData = (d: DB) => d.users.some(isDemoUser) || d.sessions.some((s) => s.seed);

/**
 * Uklanja demo podatke (Bijeljina) iz prave aplikacije: demo korisnike i sve vezano za njih (termine, ocjene,
 * razgovore, poruke, obavještenja). Podaci pravih korisnika ostaju; njihovi termini u kojima su bili demo igrači
 * se ponovo otvaraju za prijave.
 */
export function purgeDemoData(d: DB) {
  const demoUsers = new Set(d.users.filter(isDemoUser).map((u) => u.id));
  const goneSessions = new Set(d.sessions.filter((s) => s.seed || demoUsers.has(s.organizerId)).map((s) => s.id));
  const goneThreads = new Set(
    d.threads.filter((t) => t.seed || (t.sessionId && goneSessions.has(t.sessionId)) || (t.kind === 'direct' && t.memberIds.some((id) => demoUsers.has(id)))).map((t) => t.id),
  );
  d.users = d.users.filter((u) => !demoUsers.has(u.id));
  d.playerSports = d.playerSports.filter((p) => !demoUsers.has(p.userId));
  d.sessions = d.sessions.filter((s) => !goneSessions.has(s.id));
  d.sessionPlayers = d.sessionPlayers.filter((p) => !goneSessions.has(p.sessionId) && !demoUsers.has(p.userId));
  d.ratings = d.ratings.filter((r) => !r.seed && !goneSessions.has(r.sessionId) && !demoUsers.has(r.fromUserId) && !demoUsers.has(r.toUserId));
  d.threads = d.threads.filter((t) => !goneThreads.has(t.id));
  for (const t of d.threads) if (t.memberIds.some((id) => demoUsers.has(id))) t.memberIds = t.memberIds.filter((id) => !demoUsers.has(id));
  d.messages = d.messages.filter((m) => !m.seed && !goneThreads.has(m.threadId) && !demoUsers.has(m.fromUserId));
  const goneLink = (link?: string) => !!link && [...goneSessions].some((id) => link === `/termin/${id}` || link.startsWith(`/termin/${id}/`));
  d.notifications = d.notifications.filter((n) => !n.seed && !demoUsers.has(n.userId) && !goneLink(n.link));
  for (const k of Object.keys(d.reads)) {
    const sep = k.lastIndexOf(':');
    if (goneThreads.has(k.slice(0, sep)) || demoUsers.has(k.slice(sep + 1))) delete d.reads[k];
  }
  // Termini pravih korisnika koje su popunjavali demo igrači: ponovo otvoreni
  for (const s of d.sessions) if (s.status === 'full' && missingOf(d, s) > 0) s.status = 'open';
  return { users: demoUsers.size, sessions: goneSessions.size };
}

/** Zakazani posao (server, svake minute): podsjetnik 2h prije termina i poziv na ocjenjivanje — za sve korisnike. */
export function runScheduledJobs(d: DB, now = Date.now()) {
  const sessions = new Map(d.sessions.map((s) => [s.id, s]));
  for (const p of d.sessionPlayers) {
    if (p.status !== 'confirmed') continue;
    const s = sessions.get(p.sessionId);
    if (!s || s.status === 'cancelled') continue;
    const start = Date.parse(s.startsAt);
    const end = start + s.durationMin * 60000;
    if (start > now && start - now <= 2 * HOUR) {
      notify(d, p.userId, {
        type: 'reminder',
        title: `Podsjetnik: ${getSport(s.sport).name} u ${timeHM(s.startsAt)}`,
        body: `Termin počinje za ${untilLabel(start - now)} — ${s.venueName}. Ne kasni!`,
        link: `/termin/${s.id}`,
        dedupeKey: `reminder:${s.id}`,
      });
    }
    if (end <= now && now - end <= 7 * 86400000 && !hasRated(d, s.id, p.userId)) {
      const teammates = d.sessionPlayers.filter((x) => x.sessionId === s.id && x.userId !== p.userId && (x.status === 'confirmed' || x.status === 'no_show'));
      if (!teammates.length) continue;
      notify(d, p.userId, {
        type: 'rate',
        title: 'Ocijeni saigrače',
        body: `Kako je bilo na terminu u ${s.venueName}? Treba ti manje od 30 sekundi.`,
        link: `/termin/${s.id}/ocijeni`,
        dedupeKey: `rate:${s.id}`,
      });
    }
  }
  // Zadržavanje podataka: obavještenja starija od 90 dana (pročitana) i preko 300 po korisniku se brišu
  const cutoff = now - 90 * 86400000;
  const perUser = new Map<string, number>();
  const kept = d.notifications.filter((n) => {
    const c = (perUser.get(n.userId) ?? 0) + 1;
    perUser.set(n.userId, c);
    return c <= 300 && (!n.read || Date.parse(n.createdAt) > cutoff);
  });
  if (kept.length !== d.notifications.length) d.notifications = kept;
  // Precizne (GPS) lokacije sačuvane prije zaokruživanja → ~1 km
  for (const u of d.users)
    if (u.lat !== roundCoord(u.lat) || u.lng !== roundCoord(u.lng)) {
      u.lat = roundCoord(u.lat);
      u.lng = roundCoord(u.lng);
    }
}
