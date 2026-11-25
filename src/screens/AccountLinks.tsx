/**
 * Ekrani na koje vode linkovi iz emaila: potvrda email adrese i postavljanje nove lozinke.
 * Token se odmah uklanja iz adresne trake (da ne ostane u istoriji/dijeljenim linkovima) i koristi se jednom.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { CheckCircle2, KeyRound, Lock, MailX } from 'lucide-react';
import { resetPassword, verifyEmail } from '../lib/api';
import { useMe } from '../lib/hooks';
import { LIMITS } from '../lib/validation';
import { GlassButton, GlassCard, PasswordInput, useToast } from '../components/ui';
import { FullLogo } from '../components/layout/Logo';

/** Pročita ?token= jednom i ukloni ga iz URL-a. */
function useUrlToken(): string {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '');
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  return token;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-dvh grid-cols-1 place-items-center overflow-x-clip px-5 pb-[calc(32px+var(--safe-bottom))] pt-[calc(32px+var(--safe-top))]">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <span className="absolute left-1/2 top-[-12%] size-180 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(32,196,90,0.2),transparent_65%)]" />
      </div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-md">
        <FullLogo className="mx-auto mb-8 w-44" />
        <GlassCard tone="high" className="rounded-hero p-6 md:p-8">
          {children}
        </GlassCard>
      </motion.div>
    </div>
  );
}

// StrictMode u razvoju pokreće efekte dvaput — jednokratni token se smije potrošiti samo jednom
const verifying = new Map<string, Promise<unknown>>();

export function VerifyEmail() {
  const token = useUrlToken();
  const me = useMe();
  const navigate = useNavigate();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>(token ? 'loading' : 'error');
  const [message, setMessage] = useState('Link za potvrdu nije ispravan.');

  useEffect(() => {
    if (!token) return;
    if (!verifying.has(token)) verifying.set(token, verifyEmail(token));
    verifying
      .get(token)!
      .then(() => setState('ok'))
      .catch((e: unknown) => {
        setMessage(e instanceof Error ? e.message : 'Potvrda nije uspjela.');
        setState('error');
      });
  }, [token]);

  return (
    <Shell>
      {state === 'loading' && <p className="text-center text-[15px] font-semibold text-fj-text-2">Potvrđujemo email adresu…</p>}
      {state === 'ok' && (
        <div className="text-center">
          <CheckCircle2 className="mx-auto size-14 text-fj-green" aria-hidden />
          <h1 className="mt-4 text-[24px] font-extrabold">Email je potvrđen</h1>
          <p className="mt-2 text-[15px] text-fj-text-2">Sad možeš da se prijavljuješ na termine, organizuješ i dopisuješ sa igračima.</p>
          <GlassButton full className="mt-6" onClick={() => navigate(me ? '/' : '/prijava', { replace: true })}>
            {me ? 'Nastavi u aplikaciju' : 'Prijavi se'}
          </GlassButton>
        </div>
      )}
      {state === 'error' && (
        <div className="text-center">
          <MailX className="mx-auto size-14 text-fj-error" aria-hidden />
          <h1 className="mt-4 text-[24px] font-extrabold">Potvrda nije uspjela</h1>
          <p className="mt-2 text-[15px] text-fj-text-2">{message}</p>
          <GlassButton full variant="secondary" className="mt-6" onClick={() => navigate(me ? '/' : '/prijava', { replace: true })}>
            {me ? 'Nazad u aplikaciju' : 'Na prijavu'}
          </GlassButton>
        </div>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const token = useUrlToken();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (password.length < LIMITS.password.min) return setErr(`Lozinka mora imati najmanje ${LIMITS.password.min} znakova.`);
    if (password !== repeat) return setErr('Lozinke se ne poklapaju.');
    setBusy(true);
    try {
      await resetPassword(token, password);
      toast({ title: 'Lozinka je promijenjena', description: 'Prijavljen/a si. Ostali uređaji su odjavljeni.' });
      navigate('/', { replace: true });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Promjena lozinke nije uspjela.');
      setBusy(false);
    }
  };

  if (!token)
    return (
      <Shell>
        <div className="text-center">
          <MailX className="mx-auto size-14 text-fj-error" aria-hidden />
          <h1 className="mt-4 text-[24px] font-extrabold">Link nije ispravan</h1>
          <p className="mt-2 text-[15px] text-fj-text-2">Zatraži novi link na ekranu za prijavu („Zaboravljena lozinka?“).</p>
          <GlassButton full variant="secondary" className="mt-6" onClick={() => navigate('/prijava', { replace: true })}>
            Na prijavu
          </GlassButton>
        </div>
      </Shell>
    );

  return (
    <Shell>
      <div className="mb-6 flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-[rgba(32,196,90,0.14)] text-fj-green">
          <KeyRound className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-[22px] font-extrabold leading-tight">Nova lozinka</h1>
          <p className="text-[14px] text-fj-text-2">Izaberi lozinku koju ne koristiš nigdje drugo.</p>
        </div>
      </div>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4" noValidate>
        <PasswordInput label="Nova lozinka" icon={Lock} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={`Najmanje ${LIMITS.password.min} znakova`} maxLength={LIMITS.password.max} required />
        <PasswordInput label="Ponovi lozinku" icon={Lock} value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" maxLength={LIMITS.password.max} required />
        {err && (
          <p role="alert" className="rounded-[14px] border border-[rgba(240,96,90,0.4)] bg-[rgba(240,96,90,0.1)] px-4 py-3 text-[14px] font-semibold text-fj-error">
            {err}
          </p>
        )}
        <GlassButton type="submit" full loading={busy} className="mt-1">
          Sačuvaj novu lozinku
        </GlassButton>
      </form>
    </Shell>
  );
}
