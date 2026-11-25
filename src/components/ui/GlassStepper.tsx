import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';

interface GlassStepperProps {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  className?: string;
}

export function GlassStepper({ label, description, value, min, max, onChange, className }: GlassStepperProps) {
  const btn =
    'grid size-11 place-items-center rounded-full border border-white/[0.14] bg-white/[0.06] text-white transition-colors hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35';
  return (
    <div className={cn('glass flex items-center justify-between gap-4 rounded-card p-4 pl-5', className)}>
      <div className="min-w-0">
        <p className="text-[15px] font-extrabold">{label}</p>
        {description && <p className="text-[13px] text-fj-text-2">{description}</p>}
      </div>
      <div className="flex items-center gap-2" role="group" aria-label={label}>
        <motion.button whileTap={{ scale: 0.9 }} type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Smanji: ${label}`}>
          <Minus className="size-5" strokeWidth={2.6} />
        </motion.button>
        <span className="relative grid grid-cols-1 h-11 w-12 place-items-center overflow-hidden" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={value}
              initial={{ y: -14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 14, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="num text-[28px]"
            >
              {value}
            </motion.span>
          </AnimatePresence>
        </span>
        <motion.button whileTap={{ scale: 0.9 }} type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Povećaj: ${label}`}>
          <Plus className="size-5" strokeWidth={2.6} />
        </motion.button>
      </div>
    </div>
  );
}
