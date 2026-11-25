/**
 * Demo režim: simulirani igrači iz početnih podataka "žive" — prijavljuju se na nove termine
 * i odgovaraju na direktne poruke. U produkciji (DEMO_MODE=false) ništa od ovoga se ne pokreće.
 */
import { config } from './config.ts';
import { transact } from './engine.ts';
import { sendTyping } from './realtime.ts';
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
  setTimeout(() => {
    try {
      transact((d) => botJoin(d, sessionId, BOT_USER_IDS));
    } catch (e) {
      console.warn('bot join:', e);
    }
  }, 9000);
}

const pending = new Map<string, NodeJS.Timeout>();

export function afterDirectMessage(threadId: string, memberIds: string[], senderId: string) {
  if (!config.demo) return;
  const bot = memberIds.find((id) => id !== senderId && BOT_USER_IDS.has(id));
  if (!bot) return;
  clearTimeout(pending.get(threadId));
  pending.set(
    threadId,
    setTimeout(() => {
      sendTyping(threadId, bot, true, memberIds);
      setTimeout(() => {
        sendTyping(threadId, bot, false, memberIds);
        transact((d) => {
          d.messages.push({ id: uid('m'), threadId, fromUserId: bot, text: REPLIES[Math.floor(Math.random() * REPLIES.length)], createdAt: new Date().toISOString() });
        });
        pending.delete(threadId);
      }, 1900);
    }, 1200),
  );
}
