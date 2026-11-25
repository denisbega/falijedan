/* Formatiranje i gramatika (srpski/bosanski, latinica, ijekavica). */

export type PluralForm = 'one' | 'few' | 'many';
export function pluralForm(n: number): PluralForm {
  const a = Math.abs(n);
  const m10 = a % 10;
  const m100 = a % 100;
  if (m10 === 1 && m100 !== 11) return 'one';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
  return 'many';
}
export function plural(n: number, one: string, few: string, many: string): string {
  const f = pluralForm(n);
  return f === 'one' ? one : f === 'few' ? few : many;
}

export const termini = (n: number) => plural(n, 'termin', 'termina', 'termina');
export const igraci = (n: number) => plural(n, 'igrač', 'igrača', 'igrača');
export const ocjene = (n: number) => plural(n, 'ocjena', 'ocjene', 'ocjena');
export const igracaGen = (n: number) => plural(n, 'igrača', 'igrača', 'igrača');

/** Glagol "fali/fale" uz broj igrača koji nedostaju. */
export const faliVerb = (n: number) => (pluralForm(n) === 'one' ? 'fali' : 'fale');

/** Statusna značka: "FALI JEDAN" / "FALE JOŠ 2" */
export function missingBadge(n: number): string {
  return n === 1 ? 'Fali jedan' : `${faliVerb(n)} još ${n}`;
}
/** Kratka značka u redovima: "Fali 1" / "Fale 3" */
export function missingShort(n: number): string {
  return `${faliVerb(n)} ${n}`;
}
/** "4 termina traže igrače" */
export function sessionsSeeking(n: number): string {
  const verb = pluralForm(n) === 'few' ? 'traže' : 'traži';
  return `${n} ${termini(n)} ${verb} igrače`;
}

export function formatDecimal(n: number, digits = 1): string {
  return n.toFixed(digits).replace('.', ',');
}
export const formatRating = (r: number | null | undefined) => (r == null ? '—' : formatDecimal(r, 1));

export function formatPrice(price: number | null | undefined): string {
  if (price == null || price === 0) return 'Besplatno';
  return `${Number.isInteger(price) ? price : formatDecimal(price, 2)} KM`;
}
export function formatPricePerPlayer(price: number | null | undefined): string {
  if (price == null || price === 0) return 'Besplatno';
  return `${formatPrice(price)} / igraču`;
}

export function formatDistance(km: number | null | undefined): string {
  if (km == null) return '';
  if (km < 10) return `${formatDecimal(Math.max(km, 0.1), 1)} km`;
  return `${Math.round(km)} km`;
}

const DAYS_SHORT = ['Ned', 'Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub'];
const DAYS_LONG = ['Nedjelja', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'avg', 'sep', 'okt', 'nov', 'dec'];
const MONTHS_GEN = ['januara', 'februara', 'marta', 'aprila', 'maja', 'juna', 'jula', 'avgusta', 'septembra', 'oktobra', 'novembra', 'decembra'];

export function startOfDay(d: Date | number | string): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function dayDiff(a: Date | number | string, b: Date | number | string): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}

const pad2 = (n: number) => String(n).padStart(2, '0');
export const timeHM = (d: Date | number | string) => {
  const date = new Date(d);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

/** "Danas" / "Sutra" / "Sub 28. nov" */
export function relativeDay(d: Date | number | string, now = Date.now()): string {
  const date = new Date(d);
  const diff = dayDiff(date, now);
  if (diff === 0) return 'Danas';
  if (diff === 1) return 'Sutra';
  if (diff === -1) return 'Juče';
  return `${DAYS_SHORT[date.getDay()]} ${date.getDate()}. ${MONTHS[date.getMonth()]}`;
}
/** "Subota, 28. novembra" */
export function longDate(d: Date | number | string, now = Date.now()): string {
  const date = new Date(d);
  const diff = dayDiff(date, now);
  const prefix = diff === 0 ? 'Danas' : diff === 1 ? 'Sutra' : DAYS_LONG[date.getDay()];
  return `${prefix}, ${date.getDate()}. ${MONTHS_GEN[date.getMonth()]}`;
}
export function dateBlock(d: Date | number | string): { dow: string; day: string } {
  const date = new Date(d);
  return { dow: DAYS_SHORT[date.getDay()].toUpperCase(), day: String(date.getDate()) };
}
export const dayShortUpper = (d: Date) => DAYS_SHORT[d.getDay()].toUpperCase();

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'Dobro jutro';
  if (h >= 12 && h < 18) return 'Dobar dan';
  return 'Dobro veče';
}

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'upravo';
  if (min < 60) return `prije ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `prije ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'juče';
  if (d < 7) return `prije ${d} ${plural(d, 'dan', 'dana', 'dana')}`;
  const date = new Date(iso);
  return `${date.getDate()}. ${MONTHS[date.getMonth()]}`;
}

export function untilLabel(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const fullName = (u: { firstName: string; lastName: string }) => `${u.firstName} ${u.lastName}`.trim();
export const initials = (u: { firstName: string; lastName: string }) =>
  `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase();
