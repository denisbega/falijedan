import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

interface GlassChipProps {
  selected?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  count?: number;
}

export function GlassChip({ selected, onClick, icon, children, className, disabled, count }: GlassChipProps) {
  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      className={cn(
        'inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-control border px-4 text-[13px] font-bold transition-colors duration-200',
        selected
          ? 'border-[rgba(32,196,90,0.55)] bg-[rgba(32,196,90,0.14)] text-fj-green'
          : 'border-white/10 bg-white/[0.045] text-fj-text-2 hover:bg-white/[0.08] hover:text-white',
        disabled && 'cursor-not-allowed opacity-45 hover:bg-white/[0.045] hover:text-fj-text-2',
        className,
      )}
    >
      {icon}
      {children}
      {count != null && (
        <span className={cn('rounded-full px-1.5 text-[11px] font-extrabold', selected ? 'bg-fj-green text-fj-on-green' : 'bg-white/10 text-white')}>
          {count}
        </span>
      )}
    </motion.button>
  );
}

/** Horizontalni skrol za chipove i kartice (puna širina na mobilnom, bez prelivanja). */
export function HScroll({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('no-scrollbar -mx-5 flex snap-x gap-2 overflow-x-auto px-5 md:-mx-0 md:px-0', className)}>{children}</div>
  );
}
