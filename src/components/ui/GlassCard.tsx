import { forwardRef, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/utils';

export type GlassTone = 'low' | 'default' | 'high';

interface GlassCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children?: ReactNode;
  tone?: GlassTone;
  /** Hover podiže karticu i daje zeleni rub */
  interactive?: boolean;
  /** Blago zeleno svjetlo u uglu (hero / istaknuti paneli) */
  glow?: boolean;
}

const toneClass: Record<GlassTone, string> = {
  low: 'glass-low',
  default: 'glass',
  high: 'glass-high',
};

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { tone = 'default', interactive, glow, className, children, ...rest },
  ref,
) {
  const hasRadius = /\brounded-/.test(className ?? '');
  return (
    <motion.div
      ref={ref}
      whileHover={interactive ? { y: -3 } : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className={cn(
        toneClass[tone],
        !hasRadius && 'rounded-card',
        'relative',
        interactive && 'transition-[border-color,background-color] duration-200 hover:border-[rgba(32,196,90,0.45)] hover:bg-white/[0.07]',
        className,
      )}
      {...rest}
    >
      {glow && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-[radial-gradient(circle,rgba(32,196,90,0.24),rgba(32,196,90,0)_68%)]"
        />
      )}
      {children}
    </motion.div>
  );
});

/** Ambijentalno zeleno svjetlo iza sekcija (vrlo blago, prelazi u prozirno). */
export function AmbientGlow({ className, strength = 0.2 }: { className?: string; strength?: number }) {
  return (
    <span
      aria-hidden
      className={cn('pointer-events-none absolute -z-10 rounded-full', className)}
      style={{ background: `radial-gradient(circle, rgba(32,196,90,${strength}) 0%, rgba(32,196,90,0) 68%)` }}
    />
  );
}
