import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { GlassCard } from './GlassCard';

export function EmptyState({ icon: Icon, title, text, action, className, compact }: { icon: LucideIcon; title: string; text: string; action?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <GlassCard className={cn('flex flex-col items-center text-center', compact ? 'p-6' : 'px-6 py-10', className)}>
      <span className="grid grid-cols-1 size-16 place-items-center rounded-[20px] border border-[rgba(32,196,90,0.35)] bg-[rgba(32,196,90,0.12)] text-fj-green shadow-[0_0_34px_rgba(32,196,90,0.2)]">
        <Icon className="size-7" strokeWidth={2.1} aria-hidden />
      </span>
      <h3 className="mt-5 text-[19px] font-extrabold tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-sm text-[15px] text-fj-text-2">{text}</p>
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </GlassCard>
  );
}

/* ---------- Skeleton (učitavanje) ---------- */
const block = 'rounded-[8px] bg-white/[0.07]';

export function SessionCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('glass shimmer rounded-card p-5', className)} aria-hidden>
      <div className="flex justify-between">
        <span className={cn(block, 'h-3.5 w-24')} />
        <span className={cn(block, 'h-6 w-24 rounded-full')} />
      </div>
      <span className={cn(block, 'mt-5 block h-10 w-32')} />
      <span className={cn(block, 'mt-4 block h-4 w-44')} />
      <span className={cn(block, 'mt-2 block h-3.5 w-28')} />
      <div className="mt-5 flex gap-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className="h-1.5 flex-1 rounded-[3px] bg-white/[0.08]" />
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3 border-t border-white/[0.06] pt-4">
        <span className="size-9 rounded-full bg-white/[0.07]" />
        <span className={cn(block, 'h-3.5 w-24')} />
      </div>
      <span className={cn(block, 'mt-4 block h-12 w-full rounded-control')} />
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="glass-low shimmer flex items-center gap-4 rounded-card p-3.5" aria-hidden>
      <span className="size-12 rounded-[14px] bg-white/[0.07]" />
      <div className="flex-1 space-y-2">
        <span className={cn(block, 'block h-3.5 w-2/3')} />
        <span className={cn(block, 'block h-3 w-1/3')} />
      </div>
      <span className={cn(block, 'h-6 w-16 rounded-full')} />
    </div>
  );
}
