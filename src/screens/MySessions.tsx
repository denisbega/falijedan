import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarPlus, CalendarX2, History, Star, Check } from 'lucide-react';
import { useDB, useMe, useSessionViews } from '../lib/hooks';
import { canRate, hasRated } from '../lib/selectors';
import { GlassBadge, GlassButton, EmptyState, GlassTabs, Page, PageHeader, buttonClasses } from '../components/ui';
import { SessionRow } from '../components/session/SessionRow';
import { Link } from 'react-router';

type Tab = 'upcoming' | 'organizing' | 'past';

export function MySessions() {
  const me = useMe()!;
  const db = useDB();
  const views = useSessionViews();
  const [tab, setTab] = useState<Tab>('upcoming');

  const { upcoming, organizing, past } = useMemo(() => {
    const active = (v: (typeof views)[number]) => v.status !== 'finished';
    return {
      upcoming: views.filter((v) => active(v) && !v.isMine && (v.myStatus === 'confirmed' || v.myStatus === 'waitlist' || (v.status === 'cancelled' && v.myStatus))).sort((a, b) => a.startsAtMs - b.startsAtMs),
      organizing: views.filter((v) => active(v) && v.isMine).sort((a, b) => a.startsAtMs - b.startsAtMs),
      past: views
        .filter((v) => v.status === 'finished' && (v.myStatus === 'confirmed' || v.myStatus === 'no_show' || v.isMine))
        .sort((a, b) => b.startsAtMs - a.startsAtMs),
    };
  }, [views]);

  const toRate = past.filter((v) => canRate(v, me.id) && !hasRated(db, v.id, me.id)).length;
  const list = tab === 'upcoming' ? upcoming : tab === 'organizing' ? organizing : past;

  return (
    <Page>
      <PageHeader title="Moji termini" subtitle="Sve na šta si prijavljen i što organizuješ." />
      <GlassTabs
        ariaLabel="Moji termini"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'upcoming', label: 'Naredni', count: upcoming.filter((v) => v.status !== 'cancelled').length },
          { value: 'organizing', label: 'Organizujem', count: organizing.filter((v) => v.status !== 'cancelled').length },
          { value: 'past', label: 'Prošli', count: toRate || undefined },
        ]}
      />

      {tab === 'past' && toRate > 0 && (
        <div className="mt-5 flex items-center gap-3 rounded-card border border-[rgba(32,196,90,0.4)] bg-[rgba(32,196,90,0.1)] p-4">
          <Star className="size-5 shrink-0 fill-fj-green text-fj-green" aria-hidden />
          <p className="text-[14px] font-semibold">
            Imaš {toRate} {toRate === 1 ? 'termin' : 'termina'} za ocjenjivanje. Ocjene grade povjerenje u zajednici.
          </p>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="mt-5 space-y-2.5">
          {list.length === 0 ? (
            tab === 'upcoming' ? (
              <EmptyState icon={CalendarX2} title="Nema narednih termina" text="Pronađi ekipu kojoj fali igrač i uskoči." action={<GlassButton to="/istrazi" size="md">Pronađi termin</GlassButton>} />
            ) : tab === 'organizing' ? (
              <EmptyState icon={CalendarPlus} title="Ne organizuješ nijedan termin" text="Fali vam igrač? Objavi termin za manje od minute." action={<GlassButton to="/organizuj" size="md">Organizuj termin</GlassButton>} />
            ) : (
              <EmptyState icon={History} title="Još nema odigranih termina" text="Ovdje će biti tvoji prošli termini i ocjene saigrača." />
            )
          ) : (
            list.map((v) => {
              if (tab !== 'past') return <SessionRow key={v.id} s={v} leading="date" personal />;
              const rateable = canRate(v, me.id);
              const rated = hasRated(db, v.id, me.id);
              return (
                <div key={v.id} className="space-y-0">
                  <SessionRow
                    s={v}
                    leading="date"
                    trailing={
                      v.myStatus === 'no_show' ? (
                        <GlassBadge tone="red">Nije došao</GlassBadge>
                      ) : rated ? (
                        <GlassBadge tone="green" icon={<Check className="size-3" strokeWidth={3} aria-hidden />}>
                          Ocijenjeno
                        </GlassBadge>
                      ) : (
                        <GlassBadge tone="neutral">Završeno</GlassBadge>
                      )
                    }
                  />
                  {rateable && !rated && (
                    <Link to={`/termin/${v.id}/ocijeni`} className={buttonClasses('primary', 'sm', 'mt-2 w-full')}>
                      <Star className="size-4" aria-hidden /> Ocijeni saigrače
                    </Link>
                  )}
                </div>
              );
            })
          )}
        </motion.div>
      </AnimatePresence>
    </Page>
  );
}
