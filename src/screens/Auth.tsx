import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import { Apple, ArrowLeft, KeyRound, Lock, Mail, MailCheck, User, Zap } from 'lucide-react';
import { forgotPassword, getProviders, signIn, signInDemo, signInWithProvider, signUp, type Providers } from '../lib/api';
import { LIMITS } from '../lib/validation';
import { GlassButton, GlassCard, GlassInput, GlassTabs, PasswordInput } from '../components/ui';
import { FullLogo } from '../components/layout/Logo';

/** Server vraća samo kod greške OAuth prijave — prikazujemo isključivo naše poruke (nema podmetanja teksta u URL). */
const OAUTH_ERRORS: Record<string, string> = {
  istekla: 'Prijava je istekla — pokušaj ponovo.',
  neuspjela: 'Prijava nije uspjela. Pokušaj ponovo ili se prijavi emailom.',
  'nije-podeseno': 'Ova vrsta prijave trenutno nije dostupna.',
};

/* ---------- Cloudflare Turnstile (opciono): zaštita registracije od botova ---------- */

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}
let turnstileScript: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  turnstileScript ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      turnstileScript = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(s);
  });
  return turnstileScript;
}

function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  // Skripta se nije učitala (slab internet, blokator…) — umjesto praznog mjesta poruka i novi pokušaj
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let id: string | undefined;
    let cancelled = false;
    const fail = () => {
      cb.current('');
      if (!cancelled) setFailed(true);
    };
    loadTurnstile()
      .then(() => {
        if (cancelled || !ref.current) return;
        if (!window.turnstile) return fail();
        id = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          theme: 'dark',
          language: 'hr',
          callback: (t: string) => cb.current(t),
          'expired-callback': () => cb.current(''),
          'error-callback': () => cb.current(''),
        });
      })
      .catch(fail);
    return () => {
      cancelled = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey, attempt]);
  if (failed)
    return (
      <div role="alert" className="flex min-h-16.25 flex-col items-center justify-center gap-1 rounded-[14px] border border-white/10 bg-white/5 px-4 py-3 text-center text-[13px] text-fj-text-2">
        <span>Provjera „nisi robot“ se nije učitala.</span>
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setAttempt((a) => a + 1);
          }}
          className="rounded-lg px-1 py-0.5 font-bold text-fj-green hover:underline"
        >
          Pokušaj ponovo
        </button>
      </div>
    );
  return <div ref={ref} className="flex min-h-16.25 justify-center" />;
}

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
    const e = params.get('greska');
    if (e) setErr(OAUTH_ERRORS[e] ?? OAUTH_ERRORS.neuspjela);
  }, [params]);
  // Dok podešavanja nisu stigla (server nije odgovorio), pokušava se ponovo pri promjeni taba i nakon greške
  useEffect(() => {
    if (providers) return;
    let alive = true;
    void getProviders().then((p) => alive && p && setProviders(p));
    return () => {
      alive = false;
    };
  }, [providers, mode, err]);
  const [captcha, setCaptcha] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);
  const siteKey = mode === 'register' ? providers?.turnstileSiteKey : null;
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

  // Zaboravljena lozinka: link za novu lozinku na email
  const [forgot, setForgot] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const openForgot = () => {
    setErr(null);
    setForgotSent(false);
    setForgot(true);
  };
  const sendReset = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await forgotPassword(form.email);
      setForgotSent(true);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Slanje nije uspjelo.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (mode === 'login') await signIn(form.email, form.password);
      else {
        if (siteKey && !captcha) throw new Error('Potvrdi da nisi robot (polje ispod lozinke).');
        await signUp(siteKey ? { ...form, turnstileToken: captcha } : form);
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Prijava nije uspjela.');
      if (siteKey) {
        // Token se može iskoristiti samo jednom — nova provjera
        setCaptcha('');
        setCaptchaKey((k) => k + 1);
      }
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
            {forgot ? (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setForgot(false);
                    setErr(null);
                  }}
                  className="-ml-1 mb-5 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-[13px] font-bold text-fj-text-2 hover:text-white">
                  <ArrowLeft className="size-4" aria-hidden /> Nazad na prijavu
                </button>
                {forgotSent ? (
                  <div className="text-center">
                    <MailCheck className="mx-auto size-12 text-fj-green" aria-hidden />
                    <h2 className="mt-4 text-[22px] font-extrabold">Provjeri email</h2>
                    <p className="mt-2 text-[15px] leading-relaxed text-fj-text-2">
                      Ako postoji nalog sa adresom <span className="font-bold text-white">{form.email.trim()}</span>, poslali smo link za novu lozinku. Link važi 30 minuta — provjeri i spam folder.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={sendReset} className="grid grid-cols-1 gap-4" noValidate>
                    <div className="flex items-center gap-3">
                      <span className="grid size-11 place-items-center rounded-2xl bg-[rgba(32,196,90,0.14)] text-fj-green">
                        <KeyRound className="size-5" aria-hidden />
                      </span>
                      <div>
                        <h2 className="text-[20px] font-extrabold leading-tight">Zaboravljena lozinka</h2>
                        <p className="text-[14px] text-fj-text-2">Poslaćemo ti link za novu lozinku.</p>
                      </div>
                    </div>
                    <GlassInput label="Email" type="email" icon={Mail} value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" placeholder="ime@email.com" maxLength={LIMITS.email.max} required />
                    {err && (
                      <p role="alert" className="rounded-[14px] border border-[rgba(240,96,90,0.4)] bg-[rgba(240,96,90,0.1)] px-4 py-3 text-[14px] font-semibold text-fj-error">
                        {err}
                      </p>
                    )}
                    <GlassButton type="submit" full loading={busy}>
                      Pošalji link
                    </GlassButton>
                  </form>
                )}
              </div>
            ) : (
            <>
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
                  <GlassInput label="Ime" icon={User} value={form.firstName} onChange={set('firstName')} autoComplete="given-name" maxLength={LIMITS.name.max} required />
                  <GlassInput label="Prezime" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" maxLength={LIMITS.name.max} required />
                </div>
              )}
              <GlassInput label="Email" type="email" icon={Mail} value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" placeholder="ime@email.com" maxLength={LIMITS.email.max} required />
              <PasswordInput
                label="Lozinka"
                icon={Lock}
                value={form.password}
                onChange={set('password')}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'register' ? `Najmanje ${LIMITS.password.min} znakova` : '••••••••'}
                maxLength={LIMITS.password.max}
                required
              />
              {mode === 'login' && providers?.passwordReset && (
                <button type="button" onClick={openForgot} className="-mt-2 justify-self-end rounded-lg px-1 py-1 text-[13px] font-bold text-fj-green hover:underline">
                  Zaboravljena lozinka?
                </button>
              )}
              {siteKey && <Turnstile key={captchaKey} siteKey={siteKey} onToken={setCaptcha} />}
              {err && (
                <p role="alert" className="rounded-[14px] border border-[rgba(240,96,90,0.4)] bg-[rgba(240,96,90,0.1)] px-4 py-3 text-[14px] font-semibold text-fj-error">
                  {err}
                </p>
              )}
              <GlassButton type="submit" full loading={busy} className="mt-1">
                {mode === 'login' ? 'Prijavi se' : 'Napravi nalog'}
              </GlassButton>
            </form>
            </>
            )}
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
