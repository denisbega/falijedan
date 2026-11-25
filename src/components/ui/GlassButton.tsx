import { forwardRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'lg' | 'md' | 'sm';

const MotionLink = motion.create(Link);

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-extrabold uppercase tracking-[0.8px] transition-[background-color,border-color,color,box-shadow] duration-200';

const sizes: Record<ButtonSize, string> = {
  lg: 'h-[54px] px-6 text-[14px]',
  md: 'h-12 px-5 text-[13px]',
  sm: 'h-11 px-4 text-[12px]',
};

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-fj-green text-fj-on-green shadow-[0_10px_26px_rgba(32,196,90,0.4)] hover:bg-[#27d063] hover:shadow-[0_14px_32px_rgba(32,196,90,0.5)]',
  secondary:
    'border border-white/[0.18] bg-white/[0.06] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.09)] backdrop-blur-xl hover:border-white/30 hover:bg-white/[0.1]',
  ghost: 'text-fj-text-2 hover:bg-white/[0.06] hover:text-white',
  danger: 'border border-[rgba(240,96,90,0.4)] bg-[rgba(240,96,90,0.1)] text-fj-error hover:bg-[rgba(240,96,90,0.16)]',
};

const disabledCls = 'border border-transparent bg-white/[0.08] text-fj-muted shadow-none backdrop-blur-none';

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  full?: boolean;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
}

type ButtonProps = CommonProps & Omit<HTMLMotionProps<'button'>, 'children'> & { to?: undefined };
type LinkButtonProps = CommonProps & { to: string; replace?: boolean; state?: unknown; onClick?: () => void; 'aria-label'?: string };

function classes({ variant = 'primary', size = 'lg', full, className }: CommonProps, disabled?: boolean) {
  return cn(base, sizes[size], disabled ? disabledCls : variants[variant], full && 'w-full', className);
}

/** Klase dugmeta za elemente koji izgledaju kao dugme (npr. pregled kartice). */
export const buttonClasses = (variant: ButtonVariant = 'primary', size: ButtonSize = 'lg', extra?: string) => cn(base, sizes[size], variants[variant], extra);

export const GlassButton = forwardRef<HTMLButtonElement, ButtonProps | LinkButtonProps>(function GlassButton(props, ref) {
  const { icon: Icon, iconRight: IconRight, loading, children } = props;
  const content = (
    <>
      {loading ? <Loader2 className="size-[18px] animate-spin" aria-hidden /> : Icon && <Icon className="size-[18px] shrink-0" strokeWidth={2.4} aria-hidden />}
      {children != null && <span className="inline-flex items-center gap-2">{children}</span>}
      {IconRight && !loading && <IconRight className="size-[18px] shrink-0" strokeWidth={2.4} aria-hidden />}
    </>
  );

  if ('to' in props && props.to !== undefined) {
    const { to, replace, state, onClick } = props;
    return (
      <MotionLink
        to={to}
        replace={replace}
        state={state}
        onClick={onClick}
        aria-label={props['aria-label']}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        className={classes(props)}
      >
        {content}
      </MotionLink>
    );
  }

  const { variant: _v, size: _s, icon: _i, iconRight: _ir, full: _f, loading: _l, className: _c, children: _ch, to: _to, disabled, ...rest } = props as ButtonProps;
  const isDisabled = disabled || loading;
  return (
    <motion.button
      ref={ref}
      type="button"
      disabled={isDisabled}
      aria-busy={loading || undefined}
      whileHover={isDisabled ? undefined : { y: -2 }}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      className={classes(props, disabled)}
      {...rest}
    >
      {content}
    </motion.button>
  );
});

interface IconButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  icon: LucideIcon;
  label: string;
  badge?: boolean | number;
  size?: 'md' | 'lg';
  tone?: 'glass' | 'green';
}

/** Okruglo stakleno dugme samo sa ikonom (uvijek ima aria-label). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, badge, size = 'md', tone = 'glass', className, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.94 }}
      className={cn(
        'relative grid shrink-0 place-items-center rounded-full transition-colors',
        size === 'lg' ? 'size-12' : 'size-11',
        tone === 'green'
          ? 'bg-fj-green text-fj-on-green shadow-[0_8px_20px_rgba(32,196,90,0.35)]'
          : 'glass text-white hover:bg-white/[0.1]',
        className,
      )}
      {...rest}
    >
      <Icon className="size-5" strokeWidth={2.2} aria-hidden />
      {badge ? (
        typeof badge === 'number' ? (
          <span className="absolute -right-0.5 -top-0.5 grid grid-cols-1 h-5 min-w-5 place-items-center rounded-full bg-fj-green px-1 text-[10px] font-extrabold text-fj-on-green">
            {badge > 9 ? '9+' : badge}
          </span>
        ) : (
          <span className="pulse-dot absolute right-2.5 top-2.5 size-2 rounded-full bg-fj-green ring-2 ring-[#0b0e0c]" />
        )
      ) : null}
    </motion.button>
  );
});
