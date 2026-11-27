/**
 * Email obavještenja: poziv na termin, otkazan termin, mjesto sa liste čekanja, uklanjanje iz ekipe, podsjetnik
 * (i, ako korisnik uključi, novi termini u blizini) stižu i na email — isti tekst kao u aplikaciji.
 * Nove direktne poruke takođe, ali jedan email po nizu nepročitanih poruka i ne dok je korisnik u razgovoru.
 *
 * - samo na potvrđene adrese i samo vrste koje korisnik nije isključio (profil → Uredi profil);
 * - limiti po korisniku i za cijelu aplikaciju (NOTIFY_EMAIL_DAILY_LIMIT), da dnevna kvota servisa
 *   ostane za potvrdu naloga i novu lozinku;
 * - šalje se u pozadini: greška servisa ne ruši akciju korisnika (samo se zapiše u log).
 */
import { config } from './config.ts';
import { findUser, onNewNotifications, read } from './engine.ts';
import { underLimit } from './auth.ts';
import { background } from './background.ts';
import { messageMail, notificationMail, sendEmail, type Mail } from './email.ts';
import { ApiError } from '../src/lib/rules.ts';
import { EMAIL_CATEGORY, emailPrefsOf, type EmailCategory } from '../src/lib/notifications.ts';
import { fullName } from '../src/lib/format.ts';
import type { AppNotification, User } from '../src/lib/types.ts';

const DAY = 86400000;
/** Ko je čitao razgovor u zadnjih 10 minuta, upravo se dopisuje — ne treba mu email. */
const ACTIVE_IN_CHAT_MS = 10 * 60000;
const PER_USER_DAILY = 20;
const NEARBY_PER_USER_DAILY = 3;

const settingsLink = () => `${config.publicUrl}/profil/uredi`;

/** Potvrđena adresa (nepotvrđena može biti tuđa) i nije demo nalog (@falijedan.app nema inbox). */
const mailable = (u: User | undefined): u is User & { email: string } => !!u?.email && u.verified && !u.email.endsWith('@falijedan.app');

let warnedAt = 0;
async function deliver(u: User & { email: string }, category: EmailCategory, mail: Mail) {
  if (!emailPrefsOf(u)[category]) return;
  if (category === 'nearby' && !(await underLimit('mail-nearby', u.id, NEARBY_PER_USER_DAILY, DAY))) return;
  if (!(await underLimit('mail-user', u.id, PER_USER_DAILY, DAY))) return;
  if (!(await underLimit('mail-app', 'all', config.email.notifyDailyLimit, DAY))) {
    if (Date.now() - warnedAt > 3600000) console.warn(`email obavještenja: dostignut dnevni limit (${config.email.notifyDailyLimit}, NOTIFY_EMAIL_DAILY_LIMIT)`);
    warnedAt = Date.now();
    return;
  }
  await sendEmail(mail);
}

/** sendEmail je već zapisao razlog odbijanja; ostale greške (npr. baza) zapisujemo ovdje. */
const logFailure = (e: unknown) => {
  if (!(e instanceof ApiError)) console.error('email obavještenje:', e instanceof Error ? e.message : e);
};

function emailNotifications(items: AppNotification[]) {
  const due = items.filter((n) => EMAIL_CATEGORY[n.type]);
  if (!due.length || !config.email.notifyDailyLimit) return;
  background(
    (async () => {
      for (const n of due) {
        const u = findUser(n.userId);
        if (!mailable(u)) continue;
        const toSession = n.link?.startsWith('/termin/');
        const mail = notificationMail(u.email, u.firstName, n, `${config.publicUrl}${n.link ?? '/'}`, toSession ? 'Pogledaj termin' : 'Otvori FaliJedan', settingsLink());
        await deliver(u, EMAIL_CATEGORY[n.type]!, mail).catch(logFailure);
      }
    })(),
  );
}

/** Uključuje slanje emaila za nova obavještenja (jednom, pri pokretanju servera). */
export function startEmailNotifications() {
  onNewNotifications(emailNotifications);
}

/** Nova direktna poruka: email primaocu ako je ovo prva nepročitana poruka i nije upravo u razgovoru. */
export function emailDirectMessage(threadId: string, senderId: string, recipientIds: string[], text: string) {
  if (!config.email.notifyDailyLimit) return;
  const sender = findUser(senderId);
  if (!sender) return;
  const d = read();
  const now = Date.now();
  const jobs: (() => Promise<void>)[] = [];
  for (const id of recipientIds) {
    const u = findUser(id);
    if (!mailable(u)) continue;
    const lastRead = d.reads[`${threadId}:${id}`];
    if (lastRead && now - Date.parse(lastRead) < ACTIVE_IN_CHAT_MS) continue;
    const unread = d.messages.filter((m) => m.threadId === threadId && m.fromUserId !== id && (!lastRead || m.createdAt > lastRead)).length;
    if (unread > 1) continue; // za raniju nepročitanu poruku je email već poslan
    const mail = messageMail(u.email, u.firstName, fullName(sender), text, `${config.publicUrl}/poruke/${threadId}`, settingsLink());
    jobs.push(() => deliver(u, 'messages', mail));
  }
  if (jobs.length) background(Promise.all(jobs.map((j) => j().catch(logFailure))));
}
