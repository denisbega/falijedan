import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface GlassModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Na mobilnom se otvara kao donji panel (sheet), na desktopu kao centrirani modal. */
export function GlassModal({ open, onClose, title, description, children, footer, className }: GlassModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => panelRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center md:items-center md:p-6">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 48 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className={cn(
              'glass-high relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[rgba(16,20,17,0.88)] outline-none md:max-w-lg md:rounded-[28px]',
              className,
            )}
          >
            <span aria-hidden className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/20 md:hidden" />
            <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-4 md:pt-6">
              <div>
                <h2 id={titleId} className="text-[21px] font-extrabold tracking-tight">
                  {title}
                </h2>
                {description && <p className="mt-1 text-[14px] text-fj-text-2">{description}</p>}
              </div>
              <button type="button" onClick={onClose} aria-label="Zatvori" className="-mr-2 grid grid-cols-1 size-11 shrink-0 place-items-center rounded-full text-fj-text-2 hover:bg-white/10 hover:text-white">
                <X className="size-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 pb-4 pt-2">{children}</div>
            {footer && <div className="border-t border-white/[0.08] px-6 pb-[calc(16px+var(--safe-bottom))] pt-4 md:pb-6">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
