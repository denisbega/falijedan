import type { Level, RatingKey, SportId } from './types.ts';

export const ANY_POSITION = 'Svejedno';

export interface SportDef {
  id: SportId;
  name: string;
  positions: string[];
  defaultTotal: number;
  maxTotal: number;
  skillLabel: string;
}

export const SPORTS: SportDef[] = [
  { id: 'mali-fudbal', name: 'Mali fudbal', positions: ['Golman', 'Odbrana', 'Vezni', 'Napad'], defaultTotal: 10, maxTotal: 16, skillLabel: 'Tehnika / Šut' },
  { id: 'kosarka', name: 'Košarka', positions: ['Plejmejker', 'Bek', 'Krilo', 'Centar'], defaultTotal: 10, maxTotal: 12, skillLabel: 'Šut' },
  { id: 'odbojka', name: 'Odbojka', positions: ['Tehničar', 'Primač', 'Korektor', 'Bloker', 'Libero'], defaultTotal: 12, maxTotal: 14, skillLabel: 'Tehnika' },
  { id: 'padel', name: 'Padel', positions: ['Lijeva strana', 'Desna strana'], defaultTotal: 4, maxTotal: 4, skillLabel: 'Tehnika udarca' },
  { id: 'tenis', name: 'Tenis', positions: ['Singl', 'Dubl'], defaultTotal: 2, maxTotal: 4, skillLabel: 'Tehnika udarca' },
  { id: 'rukomet', name: 'Rukomet', positions: ['Golman', 'Krilo', 'Bek', 'Pivot'], defaultTotal: 14, maxTotal: 16, skillLabel: 'Tehnika / Šut' },
];

const BY_ID = Object.fromEntries(SPORTS.map((s) => [s.id, s])) as Record<SportId, SportDef>;
export const getSport = (id: SportId): SportDef => BY_ID[id] ?? SPORTS[0];
export const isSportId = (v: unknown): v is SportId => typeof v === 'string' && v in BY_ID;

export interface LevelDef {
  id: Level;
  label: string;
  bars: 1 | 2 | 3;
  desc: string;
}
export const LEVELS: LevelDef[] = [
  { id: 'pocetni', label: 'Početni', bars: 1, desc: 'Igram iz zabave' },
  { id: 'srednji', label: 'Srednji', bars: 2, desc: 'Igram redovno' },
  { id: 'napredni', label: 'Napredni', bars: 3, desc: 'Igrao sam u klubu' },
];
export const getLevel = (id: Level): LevelDef => LEVELS.find((l) => l.id === id) ?? LEVELS[1];

export const RATING_KEYS: RatingKey[] = ['fairPlay', 'teamwork', 'punctuality', 'skill', 'fitness'];
export function ratingLabel(key: RatingKey, sport?: SportId): string {
  switch (key) {
    case 'fairPlay':
      return 'Fer-plej';
    case 'teamwork':
      return 'Timska igra';
    case 'punctuality':
      return 'Tačnost dolaska';
    case 'skill':
      return sport ? getSport(sport).skillLabel : 'Tehnika / Šut';
    case 'fitness':
      return 'Kondicija';
  }
}
