import { Plus, UserRound, BadgeCheck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { initials } from '../../lib/format';

interface AvatarUser {
  firstName: string;
  lastName: string;
  avatar?: string | null;
  verified?: boolean;
}

const FILLS = ['#1b2a21', '#232f28', '#1d2420', '#28332d', '#16231b', '#202a2a'];
function fillFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return FILLS[h % FILLS.length];
}

interface GlassAvatarProps {
  user?: AvatarUser | null;
  size?: number;
  /** Zeleni gradijentni prsten (organizator / ti) */
  ring?: boolean;
  /** Isprekidani krug sa "+" — slobodno mjesto */
  empty?: boolean;
  /** Član ekipe koji nije na aplikaciji */
  guest?: boolean;
  verified?: boolean;
  className?: string;
}

export function GlassAvatar({ user, size = 44, ring, empty, guest, verified, className }: GlassAvatarProps) {
  const fontSize = Math.max(11, Math.round(size * 0.36));
  if (empty) {
    return (
      <span
        className={cn('grid shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-white/30 text-fj-text-2', className)}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <Plus style={{ width: size * 0.38, height: size * 0.38 }} strokeWidth={2.4} />
      </span>
    );
  }
  const inner = guest || !user ? (
    <span className="grid grid-cols-1 size-full place-items-center rounded-full border border-white/10 bg-white/[0.06] text-fj-text-2">
      <UserRound style={{ width: size * 0.42, height: size * 0.42 }} strokeWidth={2} aria-hidden />
    </span>
  ) : user.avatar ? (
    <img src={user.avatar} alt="" className="size-full rounded-full object-cover" />
  ) : (
    <span
      className="grid grid-cols-1 size-full place-items-center rounded-full border border-white/10 font-extrabold text-white"
      style={{ background: fillFor(user.firstName + user.lastName), fontSize, letterSpacing: '-0.02em' }}
      aria-hidden
    >
      {initials(user)}
    </span>
  );

  return (
    <span className={cn('relative inline-block shrink-0', className)} style={{ width: size, height: size }}>
      {ring ? (
        <span className="block size-full rounded-full bg-[linear-gradient(135deg,#107C3B,#20C45A_60%,#7BE6A0)] p-[2px] shadow-[0_0_18px_rgba(32,196,90,0.3)]">
          <span className="block size-full rounded-full bg-fj-bg p-[2px]">{inner}</span>
        </span>
      ) : (
        inner
      )}
      {verified && (
        <span
          className="absolute -bottom-0.5 -right-0.5 grid grid-cols-1 place-items-center rounded-full bg-fj-bg"
          style={{ width: Math.max(18, size * 0.3), height: Math.max(18, size * 0.3) }}
          title="Verifikovan profil"
        >
          <BadgeCheck className="size-[85%] fill-fj-green text-fj-bg" strokeWidth={2.2} aria-label="Verifikovan profil" />
        </span>
      )}
    </span>
  );
}
