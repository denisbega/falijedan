export type SportId = 'mali-fudbal' | 'kosarka' | 'odbojka' | 'padel' | 'tenis' | 'rukomet';
export type Level = 'pocetni' | 'srednji' | 'napredni';
export type SessionStatus = 'open' | 'full' | 'cancelled' | 'finished';
export type PlayerStatus = 'confirmed' | 'waitlist' | 'cancelled' | 'no_show';
export type RatingKey = 'fairPlay' | 'teamwork' | 'punctuality' | 'skill' | 'fitness';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  passwordHash?: string | null;
  avatar?: string | null;
  city: string;
  lat: number;
  lng: number;
  radiusKm: number;
  createdAt: string;
  verified: boolean;
  onboarded: boolean;
  bio?: string;
}

export interface PlayerSport {
  userId: string;
  sport: SportId;
  level: Level;
  positions: string[];
}

export interface Session {
  id: string;
  organizerId: string;
  sport: SportId;
  venueName: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  startsAt: string;
  durationMin: number;
  totalPlayers: number;
  /** Koliko igrača je već bilo u ekipi pri objavi (uključujući organizatora). */
  baseCount: number;
  /** null = besplatno */
  priceKM: number | null;
  level: Level;
  neededPositions: string[];
  /** Pohranjeni status; "finished" se izvodi iz vremena. */
  status: 'open' | 'full' | 'cancelled';
  createdAt: string;
  note?: string;
  seed?: boolean;
}

export interface SessionPlayer {
  sessionId: string;
  userId: string;
  role: 'organizer' | 'player';
  status: PlayerStatus;
  joinedAt: string;
  position?: string;
}

export interface Rating {
  id: string;
  sessionId: string;
  fromUserId: string;
  toUserId: string;
  fairPlay: number;
  teamwork: number;
  punctuality: number;
  skill: number;
  fitness: number;
  comment?: string;
  noShow?: boolean;
  createdAt: string;
  seed?: boolean;
}

export interface Thread {
  id: string;
  kind: 'direct' | 'session';
  sessionId?: string;
  memberIds: string[];
  createdAt: string;
  seed?: boolean;
}

export interface Message {
  id: string;
  threadId: string;
  fromUserId: string;
  text: string;
  createdAt: string;
  /** Opcionalni prilog: poziv na termin */
  sessionId?: string;
  seed?: boolean;
}

export type NotificationType =
  | 'nearby_session'
  | 'player_joined'
  | 'player_left'
  | 'session_full'
  | 'reminder'
  | 'rate'
  | 'session_cancelled'
  | 'waitlist_promoted'
  | 'removed'
  | 'invite';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  createdAt: string;
  read: boolean;
  dedupeKey?: string;
  seed?: boolean;
}

export interface DB {
  version: number;
  seededAt: number;
  currentUserId: string | null;
  users: User[];
  playerSports: PlayerSport[];
  sessions: Session[];
  sessionPlayers: SessionPlayer[];
  ratings: Rating[];
  threads: Thread[];
  messages: Message[];
  /** `${threadId}:${userId}` -> ISO vrijeme zadnjeg čitanja */
  reads: Record<string, string>;
  notifications: AppNotification[];
}

/* ---------- Izvedeni pogledi (računa ih "server" sloj) ---------- */

export interface TeamMember extends SessionPlayer {
  user: User;
}

export interface SessionView extends Omit<Session, 'status'> {
  status: SessionStatus;
  organizer: User;
  organizerRating: number | null;
  organizerRatingCount: number;
  organizerReliability: number | null;
  members: TeamMember[];
  waitlist: TeamMember[];
  confirmedCount: number;
  missing: number;
  openPositions: string[];
  distanceKm: number | null;
  startsAtMs: number;
  endsAtMs: number;
  started: boolean;
  startsSoon: boolean;
  myStatus: PlayerStatus | null;
  myRole: 'organizer' | 'player' | null;
  isMine: boolean;
  waitlistPosition: number | null;
  threadId: string | null;
}

export interface CategoryScores {
  fairPlay: number | null;
  teamwork: number | null;
  punctuality: number | null;
  skill: number | null;
  fitness: number | null;
}

export interface UserStats {
  overall: number | null;
  ratingCount: number;
  distribution: { stars: number; count: number }[];
  categories: CategoryScores;
  perSport: Partial<Record<SportId, { categories: CategoryScores; count: number; played: number }>>;
  played: number;
  noShows: number;
  reliability: number | null;
  organized: number;
}
