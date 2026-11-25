import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import { Apple, Lock, Mail, User, Zap } from 'lucide-react';
import { getProviders, signIn, signInDemo, signInWithProvider, signUp, type Providers } from '../lib/api';
import { GlassButton, GlassCard, GlassInput, GlassTabs } from '../components/ui';
import { FullLogo } from '../components/layout/Logo';

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden fill="currentColor">
      <path d="M21.6 10.2H12v3.9h5.5c-.5 2.5-2.7 4.3-5.5 4.3a6.4 6.4 0 1 1 4.1-11.3l2.9-2.8A10.4 10.4 0 0 0 12 1.6a10.4 10.4 0 1 0 0 20.8c6 0 10-4.2 10-10.1 0-.7-.1-1.4-.4-2.1z" />
    </svg>
  );
}

export function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [params] = useSearchParams();
  useEffect(() => {
    void getProviders().then(setProviders);
    const e = params.get('greska');
    if (e) setErr(e);
  }, [params]);
  const demo = async () => {
    setErr(null);
    setBusy(true);
    try {
      await signInDemo();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Demo prijava nije uspjela.');
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === 'login') await signIn(form.email, form.password);
      else await signUp(form);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Prijava nije uspjela.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative grid grid-cols-1 min-h-dvh overflow-hidden lg:grid-cols-2">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <span className="absolute left-1/2 top-[-12%] size-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(32,196,90,0.2),transparent_65%)] lg:left-1/4" />
      </div>

      {/* Lijeva strana — brend (desktop) */}
      <div className="hidden flex-col justify-between p-12 lg:flex">
        <FullLogo className="w-56" />
        <div>
          <h1 className="max-w-[12ch] text-[64px] font-extrabold leading-[0.98] tracking-[-0.04em]">
            Fali vam <span className="text-fj-green">jedan?</span>
          </h1>
          <p className="mt-5 max-w-md text-[17px] text-fj-text-2">Objavi termin kad ekipi fali igrač — ili uskoči u ekipu iz komšiluka. Rekreativno, fer i bez komplikacija.</p>
        </div>
        <p className="text-[13px] text-fj-muted">© {new Date().getFullYear()} FaliJedan</p>
      </div>

      {/* Forma */}
      <div className="flex items-center justify-center px-5 pb-[calc(32px+var(--safe-bottom))] pt-[calc(32px+var(--safe-top))]">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-md">
          <div className="mb-8 text-center lg:hidden">
            <FullLogo className="mx-auto w-44" />
            <p className="mt-5 text-[15px] text-fj-text-2">Pronađi termin ili igrače koji vam fale.</p>
          </div>

          <GlassCard tone="high" className="rounded-hero p-6 md:p-8">
            <GlassTabs
              ariaLabel="Prijava ili registracija"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setErr(null);
              }}
              tabs={[
                { value: 'login', label: 'Prijava' },
                { value: 'register', label: 'Registracija' },
              ]}
            />

            {providers && (providers.google || providers.apple || providers.demo) ? (
              <>
                <div className="mt-6 grid grid-cols-1 gap-3">
                  {providers.google && (
                    <GlassButton variant="secondary" full onClick={() => signInWithProvider('google')}>
                      <GoogleGlyph /> Nastavi sa Google
                    </GlassButton>
                  )}
                  {providers.apple && (
                    <GlassButton variant="secondary" full icon={Apple} onClick={() => signInWithProvider('apple')}>
                      Nastavi sa Apple
                    </GlassButton>
                  )}
                  {providers.demo && (
                    <GlassButton variant="secondary" full icon={Zap} onClick={demo} disabled={busy}>
                      Isprobaj demo nalog
                    </GlassButton>
                  )}
                </div>
                <div className="my-6 flex items-center gap-3 text-[12px] font-bold uppercase tracking-[1px] text-fj-muted">
                  <span className="h-px flex-1 bg-white/10" /> ili emailom <span className="h-px flex-1 bg-white/10" />
                </div>
              </>
            ) : (
              <div className="mt-6" />
            )}

            <form onSubmit={submit} className="grid grid-cols-1 gap-4" noValidate>
              {mode === 'register' && (
                <div className="grid grid-cols-2 gap-3">
                  <GlassInput label="Ime" icon={User} value={form.firstName} onChange={set('firstName')} autoComplete="given-name" required />
                  <GlassInput label="Prezime" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" required />
                </div>
              )}
              <GlassInput label="Email" type="email" icon={Mail} value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" placeholder="ime@email.com" required />
              <GlassInput
                label="Lozinka"
                type="password"
                icon={Lock}
                value={form.password}
                onChange={set('password')}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'register' ? 'Najmanje 6 znakova' : '••••••••'}
                required
              />
              {err && (
                <p role="alert" className="rounded-[14px] border border-[rgba(240,96,90,0.4)] bg-[rgba(240,96,90,0.1)] px-4 py-3 text-[14px] font-semibold text-fj-error">
                  {err}
                </p>
              )}
              <GlassButton type="submit" full loading={busy} className="mt-1">
                {mode === 'login' ? 'Prijavi se' : 'Napravi nalog'}
              </GlassButton>
            </form>
          </GlassCard>

          {providers?.demo && (
            <p className="mt-5 text-center text-[13px] leading-relaxed text-fj-muted">
              Demo nalog ima istoriju termina, ocjena i poruka. Svi podaci se čuvaju na serveru.
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
