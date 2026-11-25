import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { AlarmClock, BellOff, CheckCheck, CircleX, MapPin, PartyPopper, Send, Star, UserMinus, UserPlus, UserX, Users, type LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { useDB, useMe, useNow } from '../lib/hooks';
import { markAllNotificationsRead, markNotificationRead } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { AppNotification, NotificationType } from '../lib/types';
import { EmptyState, GlassButton, Page, PageHeader, useToast } from '../components/ui';

const META: Record<NotificationType, { icon: LucideIcon; tone: 'green' | 'amber' | 'red' }> = {
  nearby_session: { icon: MapPin, tone: 'green' },
  player_joined: { icon: UserPlus, tone: 'green' },
  player_left: { icon: UserMinus, tone: 'amber' },
  session_full: { icon: Users, tone: 'green' },
  reminder: { icon: AlarmClock, tone: 'amber' },
  rate: { icon: Star, tone: 'green' },
  session_cancelled: { icon: CircleX, tone: 'red' },
  waitlist_promoted: { icon: PartyPopper, tone: 'green' },
  removed: { icon: UserX, tone: 'red' },
  invite: { icon: Send, tone: 'green' },
};
const toneCls = {
  green: 'border-[rgba(32,196,90,0.35)] bg-[rgba(32,196,90,0.12)] text-fj-green',
  amber: 'border-[rgba(232,176,74,0.35)] bg-[rgba(232,176,74,0.12)] text-fj-warning',
  red: 'border-[rgba(240,96,90,0.35)] bg-[rgba(240,96,90,0.12)] text-fj-error',
};

function Item({ n, i }: { n: AppNotification; i: number }) {
  const navigate = useNavigate();
  const now = useNow(60000);
  const meta = META[n.type];
  return (
    <motion.li initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
      <button
        type="button"
        onClick={() => {
          markNotificationRead(n.id);
          if (n.link) navigate(n.link);
        }}
        className={cn('flex w-full items-start gap-3.5 rounded-card border p-4 text-left transition-colors', n.read ? 'glass-low hover:bg-white/[0.05]' : 'glass')}
      >
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-[14px] border', toneCls[meta.tone])}>
          <meta.icon className="size-5" strokeWidth={2.2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span className={cn('text-[15px] leading-snug', n.read ? 'font-bold text-white/90' : 'font-extrabold')}>{n.title}</span>
            {!n.read && <span className="pulse-dot mt-1.5 size-2 shrink-0 rounded-full bg-fj-green" aria-label="Novo" />}
          </span>
          <span className="mt-0.5 block text-[14px] leading-snug text-fj-text-2">{n.body}</span>
          <span className="mt-1.5 block text-[12px] font-semibold text-fj-muted">{timeAgo(n.createdAt, now)}</span>
        </span>
      </button>
    </motion.li>
  );
}

export function Notifications() {
  const db = useDB();
  const me = useMe()!;
  const { error } = useToast();
  const items = useMemo(() => db.notifications.filter((n) => n.userId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [db, me.id]);
  const fresh = items.filter((n) => !n.read);
  const older = items.filter((n) => n.read);

  return (
    <Page className="max-w-3xl">
      <PageHeader
        back
        title="Obavještenja"
        subtitle={fresh.length ? `${fresh.length} ${fresh.length === 1 ? 'novo' : 'novih'}` : 'Sve je pročitano'}
        actions={
          fresh.length > 0 ? (
            <GlassButton variant="ghost" size="sm" icon={CheckCheck} onClick={() => markAllNotificationsRead().catch(error)}>
              <span className="hidden sm:inline">Označi sve</span>
            </GlassButton>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={BellOff} title="Nema obavještenja" text="Javićemo ti kad se neko prijavi na tvoj termin ili kad u blizini fali igrač tvog nivoa." action={<GlassButton to="/istrazi" size="md">Istraži termine</GlassButton>} />
      ) : (
        <div className="space-y-7">
          {fresh.length > 0 && (
            <section>
              <h2 className="label-caps mb-3 text-fj-text-2">Novo</h2>
              <ul className="space-y-2.5">
                {fresh.map((n, i) => (
                  <Item key={n.id} n={n} i={i} />
                ))}
              </ul>
            </section>
          )}
          {older.length > 0 && (
            <section>
              <h2 className="label-caps mb-3 text-fj-text-2">Ranije</h2>
              <ul className="space-y-2.5">
                {older.map((n, i) => (
                  <Item key={n.id} n={n} i={i} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Page>
  );
}
