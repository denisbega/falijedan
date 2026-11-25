import { useId, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

/** Segmentirani prekidač sa animiranom pozadinom aktivne stavke. */
export function GlassTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const id = useId();
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('relative flex gap-1 rounded-control border border-white/10 bg-white/[0.045] p-1', className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'relative flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[12px] px-3 text-[13px] font-extrabold transition-colors',
              active ? 'text-fj-green' : 'text-fj-text-2 hover:text-white',
            )}
          >
            {active && (
              <motion.span
                layoutId={`tab-${id}`}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-[12px] border border-[rgba(32,196,90,0.55)] bg-[rgba(32,196,90,0.14)]"
              />
            )}
            <span className="relative truncate">{t.label}</span>
            {t.count != null && t.count > 0 && (
              <span className={cn('relative rounded-full px-1.5 text-[11px]', active ? 'bg-fj-green text-fj-on-green' : 'bg-white/10 text-white')}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
