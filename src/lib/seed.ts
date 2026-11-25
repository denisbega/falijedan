import type { AppNotification, DB, Level, Message, PlayerSport, Rating, Session, SessionPlayer, SportId, Thread, User } from './types.ts';
import { getSport } from './sports.ts';
import { clamp, prng } from './utils.ts';

export const SEED_VERSION = 3;
export const DEMO_USER_ID = 'u-demo';
export const DEMO_EMAIL = 'demo@falijedan.app';

export const CENTER = { lat: 44.7569, lng: 19.2144 };

export interface Venue {
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  sports: SportId[];
}

export const VENUES: Venue[] = [
  { name: 'Dvorana Semberija', address: 'Ul. Patrijarha Pavla 12', city: 'Bijeljina', lat: 44.7602, lng: 19.2081, sports: ['mali-fudbal', 'kosarka', 'odbojka', 'rukomet'] },
  { name: 'Sportski centar Drina', address: 'Ul. Svetog Save 41', city: 'Bijeljina', lat: 44.7518, lng: 19.2235, sports: ['mali-fudbal', 'kosarka', 'odbojka'] },
  { name: 'Balon sala Jedinstvo', address: 'Majevička 7', city: 'Bijeljina', lat: 44.7655, lng: 19.229, sports: ['mali-fudbal'] },
  { name: 'Padel klub Semberija', address: 'Neznanih junaka 3', city: 'Bijeljina', lat: 44.748, lng: 19.201, sports: ['padel'] },
  { name: 'Teniski centar Kruška', address: 'Lukijana Mušickog 18', city: 'Bijeljina', lat: 44.772, lng: 19.205, sports: ['tenis', 'padel'] },
  { name: 'Sala OŠ Sveti Sava', address: 'Karađorđeva 5', city: 'Bijeljina', lat: 44.759, lng: 19.217, sports: ['kosarka', 'odbojka', 'mali-fudbal'] },
  { name: 'Arena 21', address: 'Hajduk Stanka 21', city: 'Bijeljina', lat: 44.7435, lng: 19.23, sports: ['mali-fudbal', 'kosarka'] },
  { name: 'Sportska sala Mladost', address: 'Račanska 9', city: 'Bijeljina', lat: 44.769, lng: 19.196, sports: ['odbojka', 'rukomet', 'kosarka'] },
  { name: 'Tereni Gradski park', address: 'Gradski park bb', city: 'Bijeljina', lat: 44.7575, lng: 19.212, sports: ['kosarka', 'odbojka', 'tenis'] },
  { name: 'Futsal centar Janja', address: 'Drinska 2, Janja', city: 'Bijeljina', lat: 44.668, lng: 19.247, sports: ['mali-fudbal'] },
];

type SportSpec = [SportId, Level, string[]];
interface SeedUser {
  id: string;
  first: string;
  last: string;
  sports: SportSpec[];
  verified: boolean;
  year: number;
  skill: number;
}

const SEED_USERS: SeedUser[] = [
  { id: DEMO_USER_ID, first: 'Nikola', last: 'Marković', verified: true, year: 2024, skill: 4.5, sports: [['mali-fudbal', 'srednji', ['Vezni', 'Napad']], ['padel', 'srednji', ['Desna strana']], ['kosarka', 'pocetni', ['Bek']]] },
  { id: 'u1', first: 'Marko', last: 'Petrović', verified: true, year: 2023, skill: 4.7, sports: [['mali-fudbal', 'napredni', ['Golman']], ['kosarka', 'srednji', ['Centar']]] },
  { id: 'u2', first: 'Stefan', last: 'Jovanović', verified: true, year: 2024, skill: 4.3, sports: [['mali-fudbal', 'srednji', ['Odbrana']]] },
  { id: 'u3', first: 'Amar', last: 'Hodžić', verified: true, year: 2023, skill: 4.8, sports: [['mali-fudbal', 'napredni', ['Napad']], ['rukomet', 'srednji', ['Krilo']]] },
  { id: 'u4', first: 'Luka', last: 'Ilić', verified: true, year: 2025, skill: 4.6, sports: [['kosarka', 'napredni', ['Centar']], ['odbojka', 'srednji', ['Bloker']]] },
  { id: 'u5', first: 'Milan', last: 'Savić', verified: false, year: 2025, skill: 3.9, sports: [['mali-fudbal', 'pocetni', ['Svejedno']]] },
  { id: 'u6', first: 'Dino', last: 'Mehmedović', verified: true, year: 2024, skill: 4.4, sports: [['kosarka', 'srednji', ['Plejmejker']], ['mali-fudbal', 'srednji', ['Vezni']]] },
  { id: 'u7', first: 'Jovan', last: 'Nikolić', verified: true, year: 2023, skill: 4.6, sports: [['odbojka', 'napredni', ['Tehničar']]] },
  { id: 'u8', first: 'Ana', last: 'Stanković', verified: true, year: 2024, skill: 4.7, sports: [['odbojka', 'srednji', ['Primač']], ['padel', 'srednji', ['Lijeva strana']]] },
  { id: 'u9', first: 'Petar', last: 'Đurić', verified: true, year: 2023, skill: 4.5, sports: [['tenis', 'srednji', ['Singl']], ['padel', 'napredni', ['Desna strana']]] },
  { id: 'u10', first: 'Emir', last: 'Bešić', verified: false, year: 2025, skill: 4.2, sports: [['rukomet', 'napredni', ['Golman']], ['mali-fudbal', 'srednji', ['Odbrana']]] },
  { id: 'u11', first: 'Ognjen', last: 'Tomić', verified: false, year: 2025, skill: 4.0, sports: [['kosarka', 'srednji', ['Krilo']]] },
  { id: 'u12', first: 'Sara', last: 'Popović', verified: true, year: 2024, skill: 4.8, sports: [['tenis', 'napredni', ['Singl', 'Dubl']], ['padel', 'srednji', ['Lijeva strana']]] },
  { id: 'u13', first: 'Vuk', last: 'Lazić', verified: true, year: 2024, skill: 4.4, sports: [['mali-fudbal', 'srednji', ['Napad']]] },
  { id: 'u14', first: 'Ivan', last: 'Kovačević', verified: true, year: 2023, skill: 4.6, sports: [['mali-fudbal', 'napredni', ['Vezni', 'Golman']]] },
  { id: 'u15', first: 'Aleksa', last: 'Simić', verified: false, year: 2026, skill: 4.1, sports: [['odbojka', 'srednji', ['Bloker']], ['kosarka', 'pocetni', ['Krilo']]] },
  { id: 'u16', first: 'Damir', last: 'Alić', verified: false, year: 2025, skill: 3.8, sports: [['mali-fudbal', 'pocetni', ['Golman']]] },
  { id: 'u17', first: 'Nemanja', last: 'Ristić', verified: true, year: 2024, skill: 4.3, sports: [['rukomet', 'srednji', ['Bek']], ['mali-fudbal', 'srednji', ['Odbrana']]] },
  { id: 'u18', first: 'Mina', last: 'Vasić', verified: false, year: 2026, skill: 4.2, sports: [['odbojka', 'pocetni', ['Libero']], ['tenis', 'pocetni', ['Dubl']]] },
  { id: 'u19', first: 'Filip', last: 'Mitrović', verified: true, year: 2024, skill: 4.4, sports: [['padel', 'srednji', ['Desna strana']], ['tenis', 'srednji', ['Dubl']]] },
  { id: 'u20', first: 'Bojan', last: 'Lukić', verified: true, year: 2023, skill: 4.5, sports: [['kosarka', 'napredni', ['Bek']], ['mali-fudbal', 'pocetni', ['Svejedno']]] },
];

/** Demo igrači kojima upravlja server (simulirane prijave i odgovori u demo režimu). */
export const BOT_USER_IDS: ReadonlySet<string> = new Set(SEED_USERS.filter((u) => u.id !== DEMO_USER_ID).map((u) => u.id));

const COMMENTS: string[] = [
  'Fer igra od prvog do zadnjeg minuta.',
  'Rado ponovo u istoj ekipi!',
  'Odlično dodavanje i čitanje igre.',
  'Tačan dolazak i sjajna atmosfera.',
  'Odlična kondicija — trčanje za dvojicu.',
  'Smirena, timska igra. Preporuka!',
  'Pouzdano: kad kaže da dolazi, tu je.',
  'Odlična tehnika, a bez glumatanja.',
  'Malo kašnjenja, ali odlična igra.',
  'Sjajna atmosfera, vidimo se opet.',
  'Prava timska igra, bez prigovora.',
  'Uvijek fer i pozitivno. Top saigrač!',
];

const DAY = 86400000;
const HOUR = 3600000;

export function createSeed(nowMs: number): DB {
  const r = prng(20261125);
  const iso = (ms: number) => new Date(ms).toISOString();
  const now = nowMs;
  const roundUp30 = (ms: number) => Math.ceil(ms / (30 * 60000)) * 30 * 60000;
  const atDayHour = (dayOffset: number, h: number, m = 0) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  const daysToSat = ((6 - new Date(now).getDay() + 7) % 7) || 7;

  const users: User[] = SEED_USERS.map((u) => {
    const jitter = () => (r.next() - 0.5) * 0.03;
    return {
      id: u.id,
      firstName: u.first,
      lastName: u.last,
      email: u.id === DEMO_USER_ID ? DEMO_EMAIL : `${u.first.toLowerCase()}.${u.id}@falijedan.app`,
      passwordHash: null, // server postavlja scrypt hash za demo nalog
      city: 'Bijeljina',
      lat: u.id === DEMO_USER_ID ? CENTER.lat : CENTER.lat + jitter(),
      lng: u.id === DEMO_USER_ID ? CENTER.lng : CENTER.lng + jitter(),
      radiusKm: 15,
      createdAt: iso(new Date(u.year, r.int(0, 10), r.int(1, 27)).getTime()),
      verified: u.verified,
      onboarded: true,
    };
  });
  const playerSports: PlayerSport[] = SEED_USERS.flatMap((u) =>
    u.sports.map(([sport, level, positions]) => ({ userId: u.id, sport, level, positions })),
  );
  const skillOf = (id: string) => SEED_USERS.find((u) => u.id === id)?.skill ?? 4.2;
  const playersOf = (sport: SportId) => playerSports.filter((p) => p.sport === sport && p.userId !== DEMO_USER_ID).map((p) => p.userId);

  const sessions: Session[] = [];
  const sp: SessionPlayer[] = [];
  const threads: Thread[] = [];
  const messages: Message[] = [];
  const ratings: Rating[] = [];
  const notifications: AppNotification[] = [];

  interface Spec {
    id: string;
    sport: SportId;
    venue: number;
    start: number;
    dur: number;
    total: number;
    base: number;
    organizer: string;
    joiners: string[];
    price: number | null;
    level: Level;
    needed: string[];
    cancelled?: boolean;
    demoJoined?: boolean;
  }

  const t0 = roundUp30(now);
  const upcoming: Spec[] = [
    { id: 's-u1', sport: 'mali-fudbal', venue: 0, start: t0 + 1.5 * HOUR, dur: 60, total: 10, base: 6, organizer: 'u1', joiners: ['u13'], demoJoined: true, price: 5, level: 'srednji', needed: ['Odbrana', 'Napad'] },
    { id: 's-u2', sport: 'kosarka', venue: 5, start: t0 + 3 * HOUR, dur: 90, total: 10, base: 5, organizer: 'u4', joiners: ['u6', 'u11', 'u20', 'u15'], price: 3, level: 'srednji', needed: ['Centar'] },
    { id: 's-u3', sport: 'mali-fudbal', venue: 6, start: t0 + 4.5 * HOUR, dur: 60, total: 12, base: 7, organizer: 'u3', joiners: ['u14', 'u17'], price: 4, level: 'napredni', needed: ['Golman', 'Odbrana'] },
    { id: 's-u4', sport: 'odbojka', venue: 7, start: t0 + 5 * HOUR, dur: 120, total: 12, base: 8, organizer: 'u7', joiners: ['u8', 'u15', 'u4'], price: null, level: 'srednji', needed: ['Libero'] },
    { id: 's-u5', sport: 'padel', venue: 3, start: t0 + 2.5 * HOUR, dur: 90, total: 4, base: 2, organizer: 'u9', joiners: ['u8', 'u19'], price: 12, level: 'srednji', needed: ['Lijeva strana'] },
    { id: 's-u6', sport: 'mali-fudbal', venue: 2, start: t0 + 6 * HOUR, dur: 60, total: 10, base: 4, organizer: 'u2', joiners: ['u5', 'u16'], price: 5, level: 'pocetni', needed: ['Svejedno'] },
    { id: 's-u15', sport: 'mali-fudbal', venue: 1, start: t0 + 3.5 * HOUR, dur: 60, total: 10, base: 8, organizer: 'u14', joiners: ['u10'], price: 6, level: 'srednji', needed: ['Golman'] },
    { id: 's-u7', sport: 'tenis', venue: 4, start: atDayHour(1, 18), dur: 60, total: 2, base: 1, organizer: 'u12', joiners: [], price: 10, level: 'napredni', needed: ['Singl'] },
    { id: 's-u8', sport: 'kosarka', venue: 8, start: atDayHour(1, 19), dur: 60, total: 8, base: 3, organizer: 'u11', joiners: ['u6', 'u20'], price: null, level: 'pocetni', needed: ['Krilo', 'Svejedno'] },
    { id: 's-u9', sport: 'mali-fudbal', venue: 0, start: atDayHour(1, 20), dur: 90, total: 10, base: 6, organizer: DEMO_USER_ID, joiners: ['u13', 'u14'], price: 5, level: 'srednji', needed: ['Golman', 'Odbrana'] },
    { id: 's-u14', sport: 'kosarka', venue: 6, start: atDayHour(1, 21), dur: 90, total: 10, base: 6, organizer: 'u20', joiners: ['u4'], demoJoined: true, cancelled: true, price: 4, level: 'srednji', needed: ['Bek'] },
    { id: 's-u10', sport: 'rukomet', venue: 7, start: atDayHour(2, 19, 30), dur: 90, total: 14, base: 9, organizer: 'u10', joiners: ['u3', 'u17'], price: 3, level: 'srednji', needed: ['Golman', 'Pivot'] },
    { id: 's-u16', sport: 'tenis', venue: 8, start: atDayHour(2, 8), dur: 60, total: 4, base: 2, organizer: 'u18', joiners: ['u19'], price: null, level: 'pocetni', needed: ['Dubl'] },
    { id: 's-u13', sport: 'mali-fudbal', venue: 9, start: atDayHour(3, 20), dur: 60, total: 10, base: 7, organizer: 'u16', joiners: ['u5'], price: 5, level: 'pocetni', needed: ['Napad', 'Svejedno'] },
    { id: 's-u11', sport: 'odbojka', venue: 8, start: atDayHour(daysToSat, 10), dur: 120, total: 12, base: 6, organizer: 'u8', joiners: ['u7', 'u18'], price: null, level: 'srednji', needed: ['Primač', 'Svejedno'] },
    { id: 's-u12', sport: 'padel', venue: 3, start: atDayHour(daysToSat, 17), dur: 90, total: 4, base: 2, organizer: 'u19', joiners: [], demoJoined: true, price: 12, level: 'srednji', needed: ['Lijeva strana'] },
  ];

  const positionOf = (userId: string, sport: SportId, wanted?: string) => {
    const valid = getSport(sport).positions;
    if (wanted && valid.includes(wanted)) return wanted;
    return playerSports.find((p) => p.userId === userId && p.sport === sport)?.positions.find((x) => valid.includes(x));
  };

  const pushSession = (s: Spec, createdMs: number) => {
    const v = VENUES[s.venue];
    sessions.push({
      id: s.id,
      organizerId: s.organizer,
      sport: s.sport,
      venueName: v.name,
      address: v.address,
      city: v.city,
      lat: v.lat,
      lng: v.lng,
      startsAt: iso(s.start),
      durationMin: s.dur,
      totalPlayers: s.total,
      baseCount: s.base,
      priceKM: s.price,
      level: s.level,
      neededPositions: s.needed,
      status: s.cancelled ? 'cancelled' : 'open',
      createdAt: iso(createdMs),
      seed: true,
    });
    sp.push({ sessionId: s.id, userId: s.organizer, role: 'organizer', status: 'confirmed', joinedAt: iso(createdMs) });
    const joiners = [...s.joiners, ...(s.demoJoined ? [DEMO_USER_ID] : [])];
    joiners.forEach((uid, i) => {
      sp.push({
        sessionId: s.id,
        userId: uid,
        role: 'player',
        status: 'confirmed',
        joinedAt: iso(createdMs + (i + 1) * 47 * 60000),
        position: positionOf(uid, s.sport),
      });
    });
    const members = [s.organizer, ...joiners];
    threads.push({ id: `t-${s.id}`, kind: 'session', sessionId: s.id, memberIds: members, createdAt: iso(createdMs), seed: true });
  };

  for (const s of upcoming) {
    const created = Math.min(s.start - 20 * HOUR, now - r.int(3, 30) * HOUR);
    pushSession(s, created);
    // Ako je termin pun, upiši status "full"
    const confirmed = s.base + s.joiners.length + (s.demoJoined ? 1 : 0);
    if (!s.cancelled && confirmed >= s.total) sessions[sessions.length - 1].status = 'full';
  }

  /* ---------- Prošli termini + ocjene ---------- */
  const pastSpecs: Spec[] = [];
  for (let i = 0; i < 22; i++) {
    const dayOffset = i === 0 ? -1 : -r.int(2, 62);
    const sport: SportId = i < 16 ? (i % 5 === 3 ? 'padel' : 'mali-fudbal') : r.pick(['kosarka', 'odbojka', 'tenis', 'rukomet'] as SportId[]);
    const def = getSport(sport);
    const venueCandidates = VENUES.map((v, idx) => (v.sports.includes(sport) ? idx : -1)).filter((x) => x >= 0);
    const venueIdx = r.pick(venueCandidates);
    const pool = r.shuffle(playersOf(sport));
    const demoIn = i < 15 && (sport === 'mali-fudbal' || sport === 'padel');
    const total = def.defaultTotal;
    const regCount = Math.min(pool.length + (demoIn ? 1 : 0), Math.max(2, total - r.int(1, 4)));
    const organizer = i === 4 || i === 9 ? DEMO_USER_ID : pool[0];
    const others = pool.filter((p) => p !== organizer).slice(0, Math.max(0, regCount - 1 - (demoIn && organizer !== DEMO_USER_ID ? 1 : 0)));
    const joiners = demoIn && organizer !== DEMO_USER_ID ? [...others, DEMO_USER_ID] : others;
    const base = total - joiners.length;
    pastSpecs.push({
      id: `s-p${i}`,
      sport,
      venue: venueIdx,
      start: atDayHour(dayOffset, r.pick([18, 19, 20, 21])),
      dur: r.pick([60, 90]),
      total,
      base,
      organizer,
      joiners,
      price: r.pick([null, 3, 4, 5, 5, 6]),
      level: r.pick(['pocetni', 'srednji', 'srednji', 'napredni'] as Level[]),
      needed: [],
    });
  }
  for (const s of pastSpecs) pushSession(s, s.start - r.int(24, 72) * HOUR);

  // Izostanci (utiču na pouzdanost)
  const markNoShow = (sessionId: string, userId: string) => {
    const rec = sp.find((p) => p.sessionId === sessionId && p.userId === userId);
    if (rec) rec.status = 'no_show';
  };
  const oldest = [...pastSpecs].sort((a, b) => a.start - b.start);
  const demoOld = oldest.find((s) => s.joiners.includes(DEMO_USER_ID) && s.id !== 's-p0');
  if (demoOld) markNoShow(demoOld.id, DEMO_USER_ID);
  pastSpecs.slice(5, 12).forEach((s, i) => {
    const victim = s.joiners.filter((j) => j !== DEMO_USER_ID)[i % 3];
    if (victim && i % 2 === 0) markNoShow(s.id, victim);
  });

  let rid = 0;
  for (const s of pastSpecs) {
    const present = sp.filter((p) => p.sessionId === s.id && p.status === 'confirmed').map((p) => p.userId);
    for (const from of present) {
      if (from === DEMO_USER_ID && s.id === 's-p0') continue; // demo još nije ocijenio jučerašnji termin
      const targets = r.shuffle(present.filter((p) => p !== from));
      const chosen = targets.slice(0, Math.min(targets.length, from === DEMO_USER_ID ? targets.length : 3));
      if (!chosen.includes(DEMO_USER_ID) && present.includes(DEMO_USER_ID) && from !== DEMO_USER_ID && r.chance(0.55)) chosen.push(DEMO_USER_ID);
      for (const to of chosen) {
        const base = skillOf(to);
        const score = (bias: number) => clamp(Math.round(base + bias + (r.next() - 0.55) * 1.4), 2, 5);
        ratings.push({
          id: `r${rid++}`,
          sessionId: s.id,
          fromUserId: from,
          toUserId: to,
          fairPlay: score(0.25),
          teamwork: score(0.1),
          punctuality: score(0.2),
          skill: score(-0.15),
          fitness: score(-0.25),
          comment: r.chance(0.3) ? r.pick(COMMENTS) : undefined,
          createdAt: iso(s.start + s.dur * 60000 + r.int(1, 20) * HOUR),
          seed: true,
        });
      }
    }
  }

  /* ---------- Poruke ---------- */
  const msg = (threadId: string, from: string, text: string, ago: number, extra?: Partial<Message>) =>
    messages.push({ id: `m${messages.length}`, threadId, fromUserId: from, text, createdAt: iso(now - ago), seed: true, ...extra });

  msg('t-s-u1', 'u1', 'Ekipa, termin stoji! Ko donosi loptu?', 5 * HOUR);
  msg('t-s-u1', 'u13', 'Ja ću ponijeti, imam novu.', 4.6 * HOUR);
  msg('t-s-u1', DEMO_USER_ID, 'Super, stižem 10 min ranije.', 4.2 * HOUR);
  msg('t-s-u1', 'u1', 'Fale nam još dvojica — podijelite termin ako znate nekog.', 40 * 60000);

  msg('t-s-u9', 'u13', 'Računaj na mene za sutra.', 6 * HOUR);
  msg('t-s-u9', 'u14', 'Ja sam tu. Ako zatreba, mogu i na gol.', 2 * HOUR);

  threads.push({ id: 't-d-u2', kind: 'direct', memberIds: [DEMO_USER_ID, 'u2'], createdAt: iso(now - 3 * DAY), seed: true });
  msg('t-d-u2', DEMO_USER_ID, 'Kako je bilo u utorak? Nisam stigao.', 2 * DAY);
  msg('t-d-u2', 'u2', 'Odlično, 7:5 za nas. Igraš li ovaj vikend?', 25 * 60000);

  threads.push({ id: 't-d-u9', kind: 'direct', memberIds: [DEMO_USER_ID, 'u9'], createdAt: iso(now - 5 * DAY), seed: true });
  msg('t-d-u9', DEMO_USER_ID, 'Imaš li mjesta za padel danas?', 7 * HOUR);
  msg('t-d-u9', 'u9', 'Ovaj put smo puni, javim ti za sljedeći. Prijavi se na listu čekanja.', 6.5 * HOUR);

  const reads: Record<string, string> = {
    [`t-s-u1:${DEMO_USER_ID}`]: iso(now - 4.2 * HOUR),
    [`t-s-u9:${DEMO_USER_ID}`]: iso(now - 1 * HOUR),
    [`t-d-u9:${DEMO_USER_ID}`]: iso(now - 6 * HOUR),
    [`t-d-u2:${DEMO_USER_ID}`]: iso(now - 2 * DAY),
  };

  /* ---------- Obavještenja ---------- */
  const note = (n: Omit<AppNotification, 'id' | 'userId' | 'seed'>) =>
    notifications.push({ id: `n${notifications.length}`, userId: DEMO_USER_ID, seed: true, ...n });
  const s3 = upcoming.find((s) => s.id === 's-u3')!;
  note({ type: 'session_cancelled', title: 'Termin je otkazan', body: 'Košarka u Areni 21 (sutra u 21:00) je otkazana. Organizator se izvinjava.', link: '/termin/s-u14', createdAt: iso(now - 50 * 60000), read: false });
  note({ type: 'player_joined', title: 'Nova prijava na tvoj termin: Vuk', body: 'Mali fudbal · Dvorana Semberija · sutra u 20:00', link: '/termin/s-u9', createdAt: iso(now - 2 * HOUR), read: false });
  note({ type: 'nearby_session', title: 'Novi termin u blizini', body: `Mali fudbal u Areni 21 u ${new Date(s3.start).getHours()}:${String(new Date(s3.start).getMinutes()).padStart(2, '0')} — fale 3 igrača.`, link: '/termin/s-u3', createdAt: iso(now - 3 * HOUR), read: false });
  note({ type: 'player_joined', title: 'Nova prijava na tvoj termin: Ivan', body: 'Mali fudbal · Dvorana Semberija · sutra u 20:00', link: '/termin/s-u9', createdAt: iso(now - 5 * HOUR), read: true });
  note({ type: 'session_full', title: 'Padel termin je popunjen', body: 'Padel klub Semberija — ekipa je kompletna. Lista čekanja je otvorena.', link: '/termin/s-u5', createdAt: iso(now - 26 * HOUR), read: true });

  return {
    version: SEED_VERSION,
    seededAt: now,
    currentUserId: null,
    users,
    playerSports,
    sessions,
    sessionPlayers: sp,
    ratings,
    threads,
    messages,
    reads,
    notifications,
  };
}

/** Pomjera demo podatke u sadašnjost kako bi aplikacija uvijek imala svježe termine. */
export function rebaseSeed(db: DB, nowMs: number): DB {
  const step = 30 * 60000;
  const delta = Math.floor((nowMs - db.seededAt) / step) * step;
  if (delta < 3 * HOUR) return db;
  const shift = (v: string) => new Date(Date.parse(v) + delta).toISOString();
  const seedSessions = new Set(db.sessions.filter((s) => s.seed).map((s) => s.id));
  const seedThreads = new Set(db.threads.filter((t) => t.seed).map((t) => t.id));
  return {
    ...db,
    seededAt: db.seededAt + delta,
    sessions: db.sessions.map((s) => (s.seed ? { ...s, startsAt: shift(s.startsAt), createdAt: shift(s.createdAt) } : s)),
    sessionPlayers: db.sessionPlayers.map((p) => (seedSessions.has(p.sessionId) ? { ...p, joinedAt: shift(p.joinedAt) } : p)),
    ratings: db.ratings.map((x) => (x.seed ? { ...x, createdAt: shift(x.createdAt) } : x)),
    threads: db.threads.map((t) => (t.seed ? { ...t, createdAt: shift(t.createdAt) } : t)),
    messages: db.messages.map((m) => (m.seed ? { ...m, createdAt: shift(m.createdAt) } : m)),
    notifications: db.notifications.map((n) => (n.seed ? { ...n, createdAt: shift(n.createdAt) } : n)),
    reads: Object.fromEntries(
      Object.entries(db.reads).map(([k, v]) => [k, seedThreads.has(k.split(':')[0]) ? shift(v) : v]),
    ),
  };
}
