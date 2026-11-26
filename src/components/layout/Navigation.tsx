import { NavLink, useLocation } from 'react-router';
import { motion } from 'framer-motion';
import { CalendarCheck, Compass, House, MessageCircle, PanelLeftClose, PanelLeftOpen, Plus, Search, ShieldCheck, User, Users, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useMe, useUnread } from '../../lib/hooks';
import { GlassButton } from '../ui';
import { Logo } from './Logo';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: 'messages';
}

const mobileItems: NavItem[] = [
  { to: '/', label: 'Početna', icon: House, end: true },
  { to: '/istrazi', label: 'Istraži', icon: Compass },
  { to: '/poruke', label: 'Poruke', icon: MessageCircle, badge: 'messages' },
  { to: '/profil', label: 'Profil', icon: User },
];

const desktopItems: NavItem[] = [
  { to: '/', label: 'Početna', icon: House, end: true },
  { to: '/istrazi', label: 'Pronađi termin', icon: Search },
  { to: '/igraci', label: 'Pronađi igrače', icon: Users },
  { to: '/organizuj', label: 'Organizuj termin', icon: Plus },
  { to: '/moji-termini', label: 'Moji termini', icon: CalendarCheck },
  { to: '/poruke', label: 'Poruke', icon: MessageCircle, badge: 'messages' },
  { to: '/profil', label: 'Moj profil', icon: User },
];

function BottomItem({ item, messages }: { item: NavItem; messages: number }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn('relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors', isActive ? 'text-fj-green' : 'text-fj-text-2 hover:text-white')
      }
    >
      {({ isActive }) => (
        <>
          <span className="relative">
            <item.icon className="size-[22px]" strokeWidth={isActive ? 2.5 : 2.1} aria-hidden />
            {item.badge === 'messages' && messages > 0 && (
              <span className="absolute -right-2.5 -top-1.5 grid grid-cols-1 h-[18px] min-w-[18px] place-items-center rounded-full bg-fj-green px-1 text-[10px] font-extrabold text-fj-on-green ring-2 ring-[#0d110e]" aria-label={`${messages} nepročitanih`}>
                {messages > 9 ? '9+' : messages}
              </span>
            )}
          </span>
          <span>{item.label}</span>
          {isActive && <motion.span layoutId="bottom-nav-dot" className="absolute bottom-2 size-1 rounded-full bg-fj-green" />}
        </>
      )}
    </NavLink>
  );
}

/** Plutajuća staklena donja navigacija (mobilni). */
export function GlassBottomNav() {
  const { messages } = useUnread();
  const { pathname } = useLocation();
  const createActive = pathname.startsWith('/organizuj');
  return (
    <nav aria-label="Glavna navigacija" className="fixed inset-x-4 bottom-[calc(20px+var(--safe-bottom))] z-50 md:hidden">
      <div className="glass-bar flex h-[72px] items-center rounded-[28px] px-1.5">
        <BottomItem item={mobileItems[0]} messages={messages} />
        <BottomItem item={mobileItems[1]} messages={messages} />
        <div className="flex flex-1 justify-center">
          <NavLink to="/organizuj" aria-label="Organizuj termin" className="-mt-[30px]">
            <motion.span
              whileTap={{ scale: 0.92 }}
              className={cn(
                'grid size-[58px] place-items-center rounded-[20px] bg-fj-green text-fj-on-green shadow-[0_10px_26px_rgba(32,196,90,0.45)] ring-4 ring-fj-bg',
                createActive && 'bg-[#27d063]',
              )}
            >
              <Plus className="size-7" strokeWidth={2.8} aria-hidden />
            </motion.span>
          </NavLink>
        </div>
        <BottomItem item={mobileItems[2]} messages={messages} />
        <BottomItem item={mobileItems[3]} messages={messages} />
      </div>
    </nav>
  );
}

const adminItem: NavItem = { to: '/admin', label: 'Admin panel', icon: ShieldCheck };

/** Plutajući stakleni sidebar (tablet: sklopljen, desktop: raširen). */
export function GlassSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { messages } = useUnread();
  const me = useMe();
  const items = me?.admin ? [...desktopItems, adminItem] : desktopItems;
  return (
    <aside
      aria-label="Bočna navigacija"
      className={cn(
        'glass-bar fixed bottom-4 left-4 top-4 z-40 hidden flex-col rounded-[28px] p-3 transition-[width] duration-300 md:flex',
        collapsed ? 'w-[88px]' : 'w-[248px]',
      )}
    >
      <div className={cn('flex items-center px-2 pb-4 pt-2', collapsed ? 'justify-center' : 'justify-between')}>
        <Logo compact={collapsed} />
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                'relative flex min-h-12 items-center gap-3 rounded-[16px] border px-3.5 text-[14px] font-bold transition-colors',
                collapsed && 'justify-center px-0',
                isActive ? 'border-[rgba(32,196,90,0.5)] bg-[rgba(32,196,90,0.13)] text-fj-green' : 'border-transparent text-fj-text-2 hover:bg-white/[0.05] hover:text-white',
              )
            }
          >
            <item.icon className="size-5 shrink-0" strokeWidth={2.2} aria-hidden />
            {!collapsed && <span className="truncate">{item.label}</span>}
            {item.badge === 'messages' && messages > 0 && (
              <span
                className={cn('grid h-5 min-w-5 place-items-center rounded-full bg-fj-green px-1.5 text-[11px] font-extrabold text-fj-on-green', collapsed ? 'absolute right-2 top-1.5' : 'ml-auto')}
                aria-label={`${messages} nepročitanih`}
              >
                {messages}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {!collapsed ? (
        <div className="relative mt-3 overflow-hidden rounded-[22px] border border-[rgba(32,196,90,0.35)] bg-[linear-gradient(160deg,rgba(32,196,90,0.22),rgba(32,196,90,0.06))] p-4">
          <span aria-hidden className="absolute -right-10 -top-10 size-32 rounded-full bg-[radial-gradient(circle,rgba(32,196,90,0.35),transparent_70%)]" />
          <p className="relative text-[17px] font-extrabold leading-tight">Fali ti igrač?</p>
          <p className="relative mt-1 text-[13px] text-fj-text-2">Objavi termin, javljamo igračima u blizini.</p>
          <GlassButton to="/organizuj" size="sm" full className="relative mt-3">
            Organizuj termin
          </GlassButton>
        </div>
      ) : (
        <NavLink to="/organizuj" aria-label="Organizuj termin" className="mx-auto mt-3 grid grid-cols-1 size-12 place-items-center rounded-[16px] bg-fj-green text-fj-on-green shadow-[0_10px_26px_rgba(32,196,90,0.4)]">
          <Plus className="size-6" strokeWidth={2.8} />
        </NavLink>
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Raširi meni' : 'Skupi meni'}
        className={cn('mt-2 flex min-h-11 items-center gap-2 rounded-[14px] px-3.5 text-[13px] font-bold text-fj-text-2 hover:bg-white/[0.05] hover:text-white', collapsed && 'justify-center px-0')}
      >
        {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
        {!collapsed && 'Skupi meni'}
      </button>
    </aside>
  );
}
