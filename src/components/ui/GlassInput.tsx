import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Eye, EyeOff, MapPin, Search, X, type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

const fieldBox =
  'flex items-center gap-3 rounded-control border border-white/[0.12] bg-white/[0.05] px-4 transition-[border-color,background-color] duration-200 focus-within:border-[rgba(32,196,90,0.55)] focus-within:bg-white/[0.07]';

interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hideLabel?: boolean;
  icon?: LucideIcon;
  error?: string | null;
  hint?: string;
  suffix?: ReactNode;
}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(function GlassInput(
  { label, hideLabel, icon: Icon, error, hint, suffix, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={inputId} className={cn('label-caps mb-2 block text-fj-text-2', hideLabel && 'sr-only')}>
        {label}
      </label>
      <div className={cn(fieldBox, 'h-[54px]', error && 'border-[rgba(240,96,90,0.55)]')}>
        {Icon && <Icon className="size-[18px] shrink-0 text-fj-text-2" aria-hidden />}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-white outline-none placeholder:font-medium placeholder:text-fj-muted"
          {...rest}
        />
        {suffix}
      </div>
      {error ? (
        <p id={`${inputId}-err`} role="alert" className="mt-1.5 text-[13px] font-semibold text-fj-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-[13px] text-fj-text-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/** Polje za lozinku sa dugmetom "oko" — prikaži/sakrij lozinku. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<GlassInputProps, 'type' | 'suffix'>>(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <GlassInput
      ref={ref}
      {...props}
      type={visible ? 'text' : 'password'}
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      suffix={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Sakrij lozinku' : 'Prikaži lozinku'}
          aria-pressed={visible}
          title={visible ? 'Sakrij lozinku' : 'Prikaži lozinku'}
          className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-fj-text-2 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-fj-green"
        >
          {visible ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
        </button>
      }
    />
  );
});

interface GlassTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hideLabel?: boolean;
}
export function GlassTextarea({ label, hideLabel, className, id, ...rest }: GlassTextareaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={className}>
      <label htmlFor={inputId} className={cn('label-caps mb-2 block text-fj-text-2', hideLabel && 'sr-only')}>
        {label}
      </label>
      <div className={cn(fieldBox, 'py-3')}>
        <textarea
          id={inputId}
          rows={2}
          className="min-h-[44px] w-full resize-none bg-transparent text-[15px] text-white outline-none placeholder:text-fj-muted"
          {...rest}
        />
      </div>
    </div>
  );
}

interface GlassSearchProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  city?: string;
  onCityClick?: () => void;
  onSubmit?: () => void;
  className?: string;
  autoFocus?: boolean;
}
export function GlassSearch({ value, onChange, placeholder = 'Pretraži termine, dvorane…', city, onCityClick, onSubmit, className, autoFocus }: GlassSearchProps) {
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
      className={cn(fieldBox, 'glass h-[54px] pr-2', className)}
    >
      <Search className="size-[18px] shrink-0 text-fj-text-2" aria-hidden />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-white outline-none placeholder:font-medium placeholder:text-fj-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Obriši pretragu" className="grid grid-cols-1 size-11 place-items-center rounded-full text-fj-text-2 hover:text-white">
          <X className="size-4" />
        </button>
      )}
      {city && (
        <button
          type="button"
          onClick={onCityClick}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-[rgba(32,196,90,0.4)] bg-[rgba(32,196,90,0.12)] px-3 text-[12px] font-extrabold text-fj-green"
          aria-label={`Lokacija: ${city}`}
        >
          <MapPin className="size-3.5" strokeWidth={2.6} aria-hidden />
          {city}
        </button>
      )}
    </form>
  );
}

export function GlassSwitch({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-[52px] w-full items-center justify-between gap-4 text-left">
      <span>
        <span className="block text-[15px] font-bold text-white">{label}</span>
        {description && <span className="block text-[13px] text-fj-text-2">{description}</span>}
      </span>
      <span className={cn('relative h-7 w-12 shrink-0 rounded-full border transition-colors', checked ? 'border-[rgba(32,196,90,0.6)] bg-fj-green' : 'border-white/15 bg-white/10')}>
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className={cn('absolute top-[3px] size-5 rounded-full shadow', checked ? 'right-[3px] bg-fj-on-green' : 'left-[3px] bg-white')}
        />
      </span>
    </button>
  );
}

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="label-caps text-fj-text-2">
          {label}
        </label>
        <span className="text-[15px] font-extrabold text-fj-green">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        className="fj-range mt-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={format(value)}
        style={{ ['--p' as string]: `${pct}%` }}
      />
    </div>
  );
}
