/**
 * Demo režim: simulirani igrači iz početnih podataka "žive" — prijavljuju se na nove termine
 * i odgovaraju na direktne poruke. U produkciji (DEMO_MODE=false) ništa od ovoga se ne pokreće.
 */
import { config } from './config.ts';
import { transact } from './engine.ts';
import { sendTyping } from './realtime.ts';
import { background, sleep } from './background.ts';
import { botJoin } from '../src/lib/rules.ts';
import { BOT_USER_IDS } from '../src/lib/seed.ts';
import { uid } from '../src/lib/utils.ts';

const REPLIES = [
  'Važi, dogovoreno!',
  'Može. Javi kad budeš krenuo.',
  'Super, računaj na mene.',
  'Hvala na pozivu, javim ti do večeras.',
  'Ja sam tu. Ponesi loptu ako možeš.',
  'Odlično, vidimo se na terenu!',
];

export function afterSessionCreated(sessionId: string) {
  if (!config.demo) return;
  background(
    (async () => {
      await sleep(9000);
      await transact((d) => botJoin(d, sessionId, BOT_USER_IDS));
    })(),
  );
}

/** Po razgovoru samo jedan odgovor na niz poruka: nova poruka poništava odgovor koji još čeka. */
const pending = new Map<string, { cancelled: boolean }>();

export function afterDirectMessage(threadId: string, memberIds: string[], senderId: string) {
  if (!config.demo) return;
  const bot = memberIds.find((id) => id !== senderId && BOT_USER_IDS.has(id));
  if (!bot) return;
  const prev = pending.get(threadId);
  if (prev) prev.cancelled = true;
  const job = { cancelled: false };
  pending.set(threadId, job);
  background(
    (async () => {
      await sleep(1200);
      if (job.cancelled) return;
      sendTyping(threadId, bot, true, memberIds);
      await sleep(1900);
      sendTyping(threadId, bot, false, memberIds);
      if (job.cancelled) return;
      pending.delete(threadId);
      await transact((d) => {
        d.messages.push({ id: uid('m'), threadId, fromUserId: bot, text: REPLIES[Math.floor(Math.random() * REPLIES.length)], createdAt: new Date().toISOString() });
      });
    })(),
  );
}
