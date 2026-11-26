import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, MessageCircleOff, MessagesSquare, Send } from 'lucide-react';
import { cn } from '../lib/utils';
import { useDB, useMe, useNow, useThreads, useTyping } from '../lib/hooks';
import { indexOf, sessionView, type ThreadView } from '../lib/selectors';
import { markThreadRead, sendMessage } from '../lib/api';
import { dayDiff, fullName, longDate, plural, timeAgo, timeHM } from '../lib/format';
import { EmptyState, GlassAvatar, GlassButton, GlassSearch, IconButton, Page, PageHeader, useToast } from '../components/ui';
import { SessionRow, SportTile } from '../components/session/SessionRow';

function ThreadRow({ t, active }: { t: ThreadView; active?: boolean }) {
  return (
    <Link
      to={`/poruke/${t.id}`}
      className={cn(
        'flex min-h-[76px] items-center gap-3.5 rounded-card border p-3.5 transition-colors',
        active ? 'border-[rgba(32,196,90,0.5)] bg-[rgba(32,196,90,0.1)]' : t.unread ? 'glass' : 'glass-low hover:bg-white/[0.06]',
      )}
    >
      {t.kind === 'direct' ? <GlassAvatar user={t.other} size={48} /> : t.session ? <SportTile sport={t.session.sport} className="size-12" /> : <GlassAvatar guest size={48} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[15px] font-extrabold">{t.title}</p>
          <span className={cn('shrink-0 text-[12px] font-semibold', t.unread ? 'text-fj-green' : 'text-fj-text-2')}>{timeAgo(t.lastAt)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={cn('truncate text-[13px]', t.unread ? 'font-bold text-white' : 'text-fj-text-2')}>{t.lastText}</p>
          {t.unread > 0 && <span className="grid grid-cols-1 h-5 min-w-5 shrink-0 place-items-center rounded-full bg-fj-green px-1.5 text-[11px] font-extrabold text-fj-on-green">{t.unread}</span>}
        </div>
      </div>
    </Link>
  );
}

function ThreadList({ activeId }: { activeId?: string }) {
  const threads = useThreads();
  const [q, setQ] = useState('');
  const list = threads.filter((t) => !q || `${t.title} ${t.lastText}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      {threads.length > 3 && <GlassSearch value={q} onChange={setQ} placeholder="Pretraži razgovore…" className="mb-4" />}
      {list.length ? (
        <div className="space-y-2.5">
          {list.map((t) => (
            <ThreadRow key={t.id} t={t} active={t.id === activeId} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={MessageCircleOff}
          title={q ? 'Nema rezultata' : 'Još nema poruka'}
          text={q ? 'Pokušaj sa drugim imenom.' : 'Prijavi se na termin — grupni chat ekipe se otvara automatski.'}
          action={!q ? <GlassButton to="/istrazi" size="md">Pronađi termin</GlassButton> : undefined}
        />
      )}
    </>
  );
}

export function Messages() {
  return (
    <Page className="max-w-3xl">
      <PageHeader title="Poruke" subtitle="Razgovori sa igračima i grupni chatovi termina." />
      <ThreadList />
    </Page>
  );
}

export function ChatScreen() {
  const { threadId } = useParams();
  const db = useDB();
  const me = useMe()!;
  const now = useNow(30000);
  const navigate = useNavigate();
  const { error } = useToast();
  const typingUser = useTyping(threadId);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const idx = indexOf(db);

  const thread = db.threads.find((t) => t.id === threadId && t.memberIds.includes(me.id));
  const msgs = useMemo(() => db.messages.filter((m) => m.threadId === threadId), [db, threadId]);
  const other = thread?.kind === 'direct' ? idx.users.get(thread.memberIds.find((x) => x !== me.id) ?? '') ?? null : null;
  const session = thread?.sessionId ? idx.sessions.get(thread.sessionId) : undefined;
  const sv = session ? sessionView(db, session, now) : null;

  useEffect(() => {
    if (threadId) markThreadRead(threadId);
  }, [threadId, msgs.length]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: msgs.length > 30 ? 'auto' : 'smooth', block: 'end' });
  }, [msgs.length, typingUser]);

  if (!thread) {
    return (
      <Page>
        <EmptyState icon={MessagesSquare} title="Razgovor nije dostupan" text="Možda nemaš pristup ili je razgovor uklonjen." action={<GlassButton to="/poruke" size="md">Sve poruke</GlassButton>} />
      </Page>
    );
  }

  const title = other ? fullName(other) : sv ? `${sv.venueName}` : 'Razgovor';
  const send = async () => {
    const value = text;
    if (!value.trim()) return;
    setText('');
    try {
      await sendMessage(thread.id, value);
    } catch (e) {
      setText(value);
      error(e);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl gap-6 md:px-8 md:pt-8">
      {/* Lista razgovora — desktop */}
      <aside className="hidden w-[340px] shrink-0 lg:block">
        <h1 className="mb-5 text-[28px] font-extrabold">Poruke</h1>
        <ThreadList activeId={thread.id} />
      </aside>

      <section className="flex min-h-dvh min-w-0 flex-1 flex-col md:min-h-[calc(100dvh-64px)]">
        {/* Zaglavlje */}
        <header className="glass-bar sticky top-0 z-30 flex items-center gap-3 rounded-b-[24px] px-3 pb-3 pt-[calc(12px+var(--safe-top))] md:top-8 md:rounded-[24px] md:pt-3">
          <IconButton icon={ChevronLeft} label="Nazad na poruke" onClick={() => navigate('/poruke')} className="lg:hidden" />
          <Link to={other ? `/igrac/${other.id}` : sv ? `/termin/${sv.id}` : '#'} className="flex min-w-0 flex-1 items-center gap-3 rounded-[14px]">
            {other ? <GlassAvatar user={other} size={44} /> : sv ? <SportTile sport={sv.sport} className="size-11" /> : null}
            <div className="min-w-0">
              <p className="truncate text-[16px] font-extrabold">{title}</p>
              <p className="truncate text-[12px] font-semibold text-fj-text-2">
                {typingUser ? (
                  <span className="text-fj-green">kuca…</span>
                ) : sv ? (
                  `Grupni chat · ${thread.memberIds.length} ${plural(thread.memberIds.length, 'član', 'člana', 'članova')}`
                ) : other?.admin ? (
                  <span className="text-fj-green">FaliJedan podrška</span>
                ) : (
                  'Direktna poruka'
                )}
              </p>
            </div>
          </Link>
        </header>

        {sv && (
          <div className="mt-3 px-4 md:px-0">
            <SessionRow s={sv} personal />
          </div>
        )}

        {/* Poruke */}
        <div className="flex-1 space-y-2 px-4 py-5 md:px-0" role="log" aria-live="polite" aria-label="Poruke">
          {msgs.length === 0 && <p className="py-10 text-center text-[14px] text-fj-text-2">{sv ? 'Pozdravi ekipu i dogovorite detalje.' : 'Pošalji prvu poruku.'}</p>}
          {msgs.map((m, i) => {
            const mine = m.fromUserId === me.id;
            const prev = msgs[i - 1];
            const newDay = !prev || dayDiff(m.createdAt, prev.createdAt) !== 0;
            const sender = idx.users.get(m.fromUserId);
            const showName = !mine && thread.kind === 'session' && (!prev || prev.fromUserId !== m.fromUserId || newDay);
            const attached = m.sessionId ? idx.sessions.get(m.sessionId) : undefined;
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <p className="py-3 text-center">
                    <span className="label-caps rounded-full bg-white/[0.05] px-3 py-1 text-[10px] text-fj-text-2">{longDate(m.createdAt, now)}</span>
                  </p>
                )}
                <motion.div initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.2 }} className={cn('flex items-end gap-2', mine && 'justify-end')}>
                  {!mine && thread.kind === 'session' && <span className="w-8 shrink-0">{showName && <GlassAvatar user={sender} size={32} />}</span>}
                  <div className={cn('max-w-[80%] md:max-w-[65%]', mine && 'items-end')}>
                    {showName && <p className="mb-1 ml-1 text-[12px] font-bold text-fj-text-2">{sender?.firstName}</p>}
                    <div
                      className={cn(
                        'rounded-[20px] px-4 py-2.5 text-[15px] leading-snug',
                        mine ? 'rounded-br-[6px] bg-fj-green font-semibold text-fj-on-green shadow-[0_6px_18px_rgba(32,196,90,0.25)]' : 'glass rounded-bl-[6px] text-white',
                      )}
                    >
                      {m.text}
                      <span className={cn('ml-2 inline-block translate-y-0.5 text-[10px] font-bold', mine ? 'text-fj-on-green/70' : 'text-fj-text-2')}>{timeHM(m.createdAt)}</span>
                    </div>
                    {attached && (
                      <div className="mt-1.5 w-[300px] max-w-full">
                        <SessionRow s={sessionView(db, attached, now)} />
                      </div>
                    )}
                  </div>
                </motion.div>
              </Fragment>
            );
          })}
          <AnimatePresence>
            {typingUser && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex">
                <div className="glass flex gap-1 rounded-[20px] rounded-bl-[6px] px-4 py-3.5" aria-label="Kuca poruku">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-1.5 rounded-full bg-fj-text-2" style={{ animation: `fj-typing 1.1s ${i * 0.15}s infinite` }} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={endRef} />
        </div>

        {/* Unos */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="glass-bar sticky bottom-0 z-30 flex items-center gap-2 rounded-t-[24px] p-3 pb-[calc(12px+var(--safe-bottom))] md:bottom-6 md:rounded-[24px] md:pb-3"
        >
          <label htmlFor="chat-input" className="sr-only">
            Poruka
          </label>
          <input
            id="chat-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Napiši poruku…"
            autoComplete="off"
            maxLength={1000}
            className="h-12 min-w-0 flex-1 rounded-[16px] border border-white/10 bg-white/[0.05] px-4 text-[15px] outline-none placeholder:text-fj-muted focus:border-[rgba(32,196,90,0.55)]"
          />
          <motion.button
            type="submit"
            whileTap={{ scale: 0.9 }}
            disabled={!text.trim()}
            aria-label="Pošalji"
            className="grid grid-cols-1 size-12 shrink-0 place-items-center rounded-[16px] bg-fj-green text-fj-on-green shadow-[0_8px_20px_rgba(32,196,90,0.35)] disabled:bg-white/[0.08] disabled:text-fj-muted disabled:shadow-none"
          >
            <Send className="size-5" strokeWidth={2.4} />
          </motion.button>
        </form>
      </section>
    </div>
  );
}
