import { useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useMe } from '../lib/hooks';
import { saveProfile, signOut, type SportProfileInput } from '../lib/api';
import { LEVELS } from '../lib/sports';
import type { SportId } from '../lib/types';
import { GlassButton, useToast } from '../components/ui';
import { CityRadiusPicker, SportLevelEditor, SportPicker, type CityValue } from '../components/forms/ProfileForms';
import { Logo } from '../components/layout/Logo';

const STEPS = [
  { title: 'Šta igraš?', sub: 'Izaberi jedan ili više sportova.' },
  { title: 'Tvoj nivo i pozicija', sub: 'Da te ekipe pozivaju na termine tvog nivoa.' },
  { title: 'Gdje igraš?', sub: 'Grad i radijus u kom tražimo termine.' },
];

export function Onboarding() {
  const me = useMe()!;
  const navigate = useNavigate();
  const { toast, error } = useToast();
  const [step, setStep] = useState(0);
  const [sports, setSports] = useState<SportProfileInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [loc, setLoc] = useState<CityValue>({ city: me.city, lat: me.lat, lng: me.lng, radiusKm: me.radiusKm });

  const pick = (ids: SportId[]) => setSports(ids.map((id) => sports.find((s) => s.sport === id) ?? { sport: id, level: LEVELS[1].id, positions: [] }));
  const canNext = step === 0 ? sports.length > 0 : true;

  const finish = async () => {
    setBusy(true);
    try {
      await saveProfile({ sports, ...loc, completeOnboarding: true });
      toast({ title: `Dobro došli, ${me.firstName}!`, description: 'Evo termina kojima fali igrač u tvojoj blizini.' });
      navigate('/', { replace: true });
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-2xl px-5 pb-[calc(130px+var(--safe-bottom))] pt-[calc(16px+var(--safe-top))] md:pt-10">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <span className="absolute -right-40 -top-40 size-[560px] rounded-full bg-[radial-gradient(circle,rgba(32,196,90,0.16),transparent_65%)]" />
      </div>
      <header className="flex items-center justify-between">
        <Logo to="/dobrodosli" />
        <button
          type="button"
          onClick={async () => {
            await signOut();
            navigate('/prijava', { replace: true });
          }}
          className="min-h-11 rounded-[12px] px-3 text-[13px] font-bold text-fj-text-2 hover:text-white"
        >
          Odjava
        </button>
      </header>
      <div className="mt-6 flex gap-1.5" aria-hidden>
        {STEPS.map((_, i) => (
          <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <motion.span className="block h-full rounded-full bg-fj-green" initial={false} animate={{ width: i <= step ? '100%' : '0%' }} />
          </span>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.section key={step} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }} transition={{ duration: 0.25 }} className="mt-8">
          <p className="label-caps text-fj-green">Korak {step + 1} od 3</p>
          <h1 className="mt-2 text-[32px] font-extrabold leading-tight tracking-[-0.025em]">{STEPS[step].title}</h1>
          <p className="mt-1 text-fj-text-2">{STEPS[step].sub}</p>
          <div className="mt-6">
            {step === 0 && <SportPicker value={sports.map((s) => s.sport)} onChange={pick} />}
            {step === 1 && <SportLevelEditor value={sports} onChange={setSports} />}
            {step === 2 && <CityRadiusPicker value={loc} onChange={setLoc} />}
          </div>
        </motion.section>
      </AnimatePresence>

      <div className="fixed inset-x-4 bottom-[calc(16px+var(--safe-bottom))] z-40 mx-auto max-w-2xl md:px-4">
        <div className="glass-bar flex gap-3 rounded-[24px] p-3">
          {step > 0 && (
            <GlassButton variant="secondary" icon={ChevronLeft} className="flex-1" onClick={() => setStep(step - 1)}>
              Nazad
            </GlassButton>
          )}
          <GlassButton className="flex-[2]" disabled={!canNext} loading={busy} onClick={() => (step < 2 ? setStep(step + 1) : void finish())}>
            {step < 2 ? 'Dalje' : 'Počni da igraš'}
          </GlassButton>
        </div>
      </div>
    </div>
  );
}
