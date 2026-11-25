import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { IconButton } from './GlassButton';

/** Standardni kontejner ekrana: bočni razmak 20px na mobilnom, prostor za navigaciju dole. */
export function Page({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <div
      className={cn(
        'relative mx-auto w-full px-5 pb-[calc(128px+var(--safe-bottom))] pt-[calc(16px+var(--safe-top))] md:px-8 md:pb-16 md:pt-8',
        wide ? 'max-w-[1520px]' : 'max-w-[1100px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: boolean | string;
  actions?: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <header className={cn('mb-6 flex items-start gap-3', className)}>
      {back && (
        <IconButton
          icon={ChevronLeft}
          label="Nazad"
          onClick={() => (typeof back === 'string' ? navigate(back) : window.history.length > 1 ? navigate(-1) : navigate('/'))}
          className="mt-0.5"
        />
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em] md:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] text-fj-text-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionHeader({ title, action, to, count, className }: { title: ReactNode; action?: string; to?: string; count?: number; className?: string }) {
  return (
    <div className={cn('mb-3.5 flex items-center justify-between gap-3', className)}>
      <h2 className="flex items-center gap-2 text-[19px] font-extrabold tracking-[-0.01em]">
        {title}
        {count != null && <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[12px] font-extrabold text-fj-text-2">{count}</span>}
      </h2>
      {action && to && (
        <Link to={to} className="-mr-2 inline-flex min-h-11 items-center gap-0.5 rounded-[12px] px-2 text-[13px] font-extrabold text-fj-green hover:bg-white/[0.05]">
          {action}
          <ChevronRight className="size-4" strokeWidth={2.6} aria-hidden />
        </Link>
      )}
    </div>
  );
}
