/* Vizuelni indikatori: PlayerSlots, RatingBar, CapacityRing, LevelBars, Stars, StatCard */
import { useId, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Star, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatRating } from '../../lib/format';
import { GlassCard } from './GlassCard';

/** Red tankih traka popunjenosti — glavni vizuelni signal, svuda isti. */
export function PlayerSlots({ total, filled, className }: { total: number; filled: number; className?: string }) {
  return (
    <div className={cn('flex', total > 14 ? 'gap-[3px]' : 'gap-1', className)} role="img" aria-label={`Popunjeno ${filled} od ${total} mjesta`}>
      {Array.from({ length: total }).map((_, i) => (
        <motion.span
          key={i}
          className="h-1.5 flex-1 rounded-[3px]"
          initial={false}
          animate={{
            backgroundColor: i < filled ? '#20C45A' : 'rgba(255,255,255,0.12)',
            boxShadow: i < filled ? '0 0 8px rgba(32,196,90,0.35)' : '0 0 0 rgba(0,0,0,0)',
          }}
          transition={{ duration: 0.35, delay: i * 0.015 }}
        />
      ))}
    </div>
  );
}

export function RatingBar({ label, value, max = 5 }: { label: string; value: number | null; max?: number }) {
  const pct = value == null ? 0 : Math.max(4, (value / max) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[14px]">
        <span className="font-semibold text-fj-text-2">{label}</span>
        <span className="num text-[15px] text-fj-green">{formatRating(value)}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.08]">
        <motion.div
          className="h-full rounded-full bg-[linear-gradient(90deg,#107C3B,#20C45A)] shadow-[0_0_12px_rgba(32,196,90,0.45)]"
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true, margin: '-20px' }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </div>
    </div>
  );
}

export function CapacityRing({ filled, total, size = 132, stroke = 10, label = 'igrača' }: { filled: number; total: number; size?: number; stroke?: number; label?: string }) {
  const id = useId();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = total > 0 ? Math.min(1, filled / total) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${filled} od ${total} ${label}`}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#107C3B" />
            <stop offset="100%" stopColor="#20C45A" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#ring-${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - progress) }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ filter: 'drop-shadow(0 0 6px rgba(32,196,90,0.45))' }}
        />
      </svg>
      <div className="absolute inset-0 grid grid-cols-1 place-content-center text-center">
        <span className="num text-[30px]">
          {filled}
          <span className="text-[20px] text-fj-text-2">/{total}</span>
        </span>
        <span className="label-caps mt-1 text-[10px] text-fj-text-2">{label}</span>
      </div>
    </div>
  );
}

/** 3 trake jačine nivoa igre */
export function LevelBars({ bars, className, size = 'md' }: { bars: 1 | 2 | 3; className?: string; size?: 'sm' | 'md' }) {
  const h = size === 'sm' ? [6, 9, 12] : [8, 12, 16];
  return (
    <span className={cn('inline-flex items-end gap-[3px]', className)} aria-hidden>
      {h.map((height, i) => (
        <span key={i} className={cn('w-[5px] rounded-[2px]', i < bars ? 'bg-fj-green' : 'bg-white/15')} style={{ height }} />
      ))}
    </span>
  );
}

/** Zvjezdice sa djelimično popunjenom zadnjom. */
export function Stars({ value, size = 18, className }: { value: number | null; size?: number; className?: string }) {
  const v = value ?? 0;
  return (
    <span className={cn('inline-flex gap-1', className)} role="img" aria-label={`Ocjena ${formatRating(value)} od 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, v - i));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 text-white/15" fill="currentColor" strokeWidth={0} style={{ width: size, height: size }} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="text-fj-green" fill="currentColor" strokeWidth={0} style={{ width: size, height: size }} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function GlassStatCard({ label, value, hint, icon: Icon, accent, className }: { label: string; value: ReactNode; hint?: string; icon?: LucideIcon; accent?: boolean; className?: string }) {
  return (
    <GlassCard className={cn('p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="label-caps text-fj-text-2">{label}</span>
        {Icon && (
          <span className="grid grid-cols-1 size-9 place-items-center rounded-[12px] border border-[rgba(32,196,90,0.3)] bg-[rgba(32,196,90,0.12)] text-fj-green">
            <Icon className="size-[18px]" strokeWidth={2.3} aria-hidden />
          </span>
        )}
      </div>
      <div className={cn('num mt-3 text-[40px]', accent && 'text-fj-green')}>{value}</div>
      {hint && <p className="mt-1.5 text-[13px] text-fj-text-2">{hint}</p>}
    </GlassCard>
  );
}
