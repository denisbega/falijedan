import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CircleCheck, CircleX, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
}
interface ToastApi {
  toast: (t: Omit<ToastItem, 'id' | 'tone'> & { tone?: ToastTone; duration?: number }) => void;
  error: (e: unknown) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const toast = useCallback<ToastApi['toast']>(
    ({ duration = 3800, tone = 'success', ...t }) => {
      const id = ++counter.current;
      setItems((xs) => [...xs.slice(-2), { id, tone, ...t }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );
  const error = useCallback(
    (e: unknown) => toast({ tone: 'error', title: e instanceof Error ? e.message : 'Nešto nije u redu. Pokušaj ponovo.' }),
    [toast],
  );
  const api = useMemo(() => ({ toast, error }), [toast, error]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(112px+var(--safe-bottom))] z-[90] flex flex-col items-center gap-2 px-4 md:bottom-8"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const Icon = t.tone === 'error' ? CircleX : t.tone === 'info' ? Info : CircleCheck;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                role={t.tone === 'error' ? 'alert' : 'status'}
                className="glass-bar pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-[20px] px-4 py-3"
              >
                <Icon className={cn('size-5 shrink-0', t.tone === 'error' ? 'text-fj-error' : 'text-fj-green')} strokeWidth={2.4} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-extrabold leading-snug">{t.title}</p>
                  {t.description && <p className="text-[13px] leading-snug text-fj-text-2">{t.description}</p>}
                </div>
                {t.action && (
                  <button
                    type="button"
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                    className="h-11 shrink-0 rounded-[12px] px-3 text-[12px] font-extrabold uppercase tracking-[0.8px] text-fj-green hover:bg-white/[0.06]"
                  >
                    {t.action.label}
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast mora biti unutar ToastProvider');
  return ctx;
}
