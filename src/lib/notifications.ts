import type { EmailPrefs, NotificationType, User } from './types.ts';

export type EmailCategory = keyof EmailPrefs;

/** Podrazumijevano: pozivi/poruke i promjene na mojim terminima stižu na email, novi termini u blizini ne. */
export const emailPrefsOf = (u: Pick<User, 'emailPrefs'>): Required<EmailPrefs> => ({
  messages: u.emailPrefs?.messages ?? true,
  sessions: u.emailPrefs?.sessions ?? true,
  nearby: u.emailPrefs?.nearby ?? false,
});

/** Obavještenja koja idu i na email (ostala su samo u aplikaciji). */
export const EMAIL_CATEGORY: Partial<Record<NotificationType, EmailCategory>> = {
  invite: 'messages',
  session_cancelled: 'sessions',
  waitlist_promoted: 'sessions',
  removed: 'sessions',
  reminder: 'sessions',
  nearby_session: 'nearby',
};
