import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, LocateFixed, MapPin } from 'lucide-react';
import { cn, haversineKm } from '../../lib/utils';
import { ANY_POSITION, CITIES, LEVELS, SPORTS, getSport } from '../../lib/sports';
import type { SportProfileInput } from '../../lib/api';
import type { SportId } from '../../lib/types';
import { GlassChip, GlassTabs, LevelBars, RangeField, SportIcon } from '../ui';

/** Mreža sportova (više izbora). */
export function SportPicker({ value, onChange }: { value: SportId[]; onChange: (v: SportId[]) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {SPORTS.map((s) => {
        const on = value.includes(s.id);
        return (
          <motion.button
            key={s.id}
            type="button"
            aria-pressed={on}
            whileTap={{ scale: 0.97 }}
            onClick={() => onChange(on ? value.filter((x) => x !== s.id) : [...value, s.id])}
            className={cn('relative flex min-h-[104px] flex-col items-start justify-between rounded-card border p-4 text-left transition-colors', on ? 'border-[rgba(32,196,90,0.55)] bg-[rgba(32,196,90,0.14)]' : 'glass hover:bg-white/[0.08]')}
          >
            <span className={cn('grid size-11 place-items-center rounded-[14px]', on ? 'bg-fj-green text-fj-on-green' : 'bg-white/[0.07] text-fj-green')}>
              <SportIcon sport={s.id} className="size-6" />
            </span>
            <span className={cn('text-[15px] font-extrabold', on && 'text-fj-green')}>{s.name}</span>
            {on && (
              <span className="absolute right-3 top-3 grid grid-cols-1 size-6 place-items-center rounded-full bg-fj-green text-fj-on-green">
                <Check className="size-3.5" strokeWidth={3.4} aria-hidden />
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

/** Nivo i pozicije za svaki izabrani sport. */
export function SportLevelEditor({ value, onChange }: { value: SportProfileInput[]; onChange: (v: SportProfileInput[]) => void }) {
  const update = (sport: SportId, patch: Partial<SportProfileInput>) => onChange(value.map((v) => (v.sport === sport ? { ...v, ...patch } : v)));
  return (
    <div className="space-y-4">
      {value.map((sp) => {
        const def = getSport(sp.sport);
        return (
          <div key={sp.sport} className="glass rounded-card p-4 md:p-5">
            <p className="flex items-center gap-2.5 text-[17px] font-extrabold">
              <span className="grid grid-cols-1 size-9 place-items-center rounded-[12px] bg-[rgba(32,196,90,0.14)] text-fj-green">
                <SportIcon sport={sp.sport} className="size-5" />
              </span>
              {def.name}
            </p>
            <p className="label-caps mb-2 mt-4 text-fj-text-2">Nivo</p>
            <GlassTabs
              ariaLabel={`Nivo — ${def.name}`}
              value={sp.level}
              onChange={(level) => update(sp.sport, { level })}
              tabs={LEVELS.map((l) => ({
                value: l.id,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <LevelBars bars={l.bars} size="sm" /> {l.label}
                  </span>
                ),
              }))}
            />
            <p className="label-caps mb-2 mt-4 text-fj-text-2">Pozicija</p>
            <div className="flex flex-wrap gap-2">
              {[...def.positions, ANY_POSITION].map((p) => {
                const on = sp.positions.includes(p);
                return (
                  <GlassChip
                    key={p}
                    selected={on}
                    onClick={() => {
                      if (p === ANY_POSITION) return update(sp.sport, { positions: on ? [] : [ANY_POSITION] });
                      const rest = sp.positions.filter((x) => x !== ANY_POSITION);
                      update(sp.sport, { positions: on ? rest.filter((x) => x !== p) : [...rest, p] });
                    }}
                  >
                    {p}
                  </GlassChip>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface CityValue {
  city: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

/** Grad (ili trenutna lokacija) + radijus pretrage. */
export function CityRadiusPicker({ value, onChange }: { value: CityValue; onChange: (v: CityValue) => void }) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const locate = () => {
    if (!('geolocation' in navigator)) return setGeoError('Uređaj ne podržava lokaciju.');
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const nearest = [...CITIES].sort((a, b) => haversineKm(a, here) - haversineKm(b, here))[0];
        onChange({ ...value, ...here, city: haversineKm(nearest, here) < 25 ? nearest.name : 'Moja lokacija' });
        setLocating(false);
      },
      () => {
        setGeoError('Nismo dobili pristup lokaciji — izaberi grad ručno.');
        setLocating(false);
      },
      { timeout: 8000 },
    );
  };

  return (
    <div>
      <button
        type="button"
        onClick={locate}
        className="glass flex min-h-[56px] w-full items-center gap-3 rounded-card px-4 text-left font-extrabold transition-colors hover:bg-white/[0.08]"
      >
        <LocateFixed className={cn('size-5 text-fj-green', locating && 'animate-pulse')} aria-hidden />
        {locating ? 'Tražimo tvoju lokaciju…' : 'Koristi moju lokaciju'}
      </button>
      {geoError && <p className="mt-2 text-[13px] font-semibold text-fj-warning">{geoError}</p>}

      <p className="label-caps mb-2.5 mt-6 text-fj-text-2">Ili izaberi grad</p>
      <div className="flex flex-wrap gap-2">
        {CITIES.map((c) => (
          <GlassChip key={c.name} selected={value.city === c.name} onClick={() => onChange({ ...value, city: c.name, lat: c.lat, lng: c.lng })} icon={value.city === c.name ? <MapPin className="size-4" aria-hidden /> : undefined}>
            {c.name}
          </GlassChip>
        ))}
        {value.city === 'Moja lokacija' && (
          <GlassChip selected icon={<LocateFixed className="size-4" aria-hidden />}>
            Moja lokacija
          </GlassChip>
        )}
      </div>

      <div className="glass mt-6 rounded-card p-4 md:p-5">
        <RangeField label="Radijus pretrage" value={value.radiusKm} min={1} max={50} onChange={(radiusKm) => onChange({ ...value, radiusKm })} format={(v) => `${v} km`} />
        <p className="mt-1 text-[13px] text-fj-text-2">Prikazujemo termine i igrače u ovom krugu.</p>
      </div>
    </div>
  );
}
