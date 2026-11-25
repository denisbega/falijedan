import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Save } from 'lucide-react';
import { useDB, useMe } from '../lib/hooks';
import { saveProfile, type SportProfileInput } from '../lib/api';
import { LEVELS } from '../lib/sports';
import type { SportId } from '../lib/types';
import { GlassButton, GlassCard, GlassInput, GlassTextarea, Page, PageHeader, useToast } from '../components/ui';
import { CityRadiusPicker, SportLevelEditor, SportPicker, type CityValue } from '../components/forms/ProfileForms';

export function EditProfile() {
  const me = useMe()!;
  const db = useDB();
  const navigate = useNavigate();
  const { toast, error } = useToast();
  const [firstName, setFirstName] = useState(me.firstName);
  const [lastName, setLastName] = useState(me.lastName);
  const [bio, setBio] = useState(me.bio ?? '');
  const [sports, setSports] = useState<SportProfileInput[]>(() => db.playerSports.filter((p) => p.userId === me.id).map(({ sport, level, positions }) => ({ sport, level, positions })));
  const [busy, setBusy] = useState(false);
  const [loc, setLoc] = useState<CityValue>({ city: me.city, lat: me.lat, lng: me.lng, radiusKm: me.radiusKm });

  const pickSports = (ids: SportId[]) =>
    setSports(ids.map((id) => sports.find((s) => s.sport === id) ?? { sport: id, level: LEVELS[1].id, positions: [] }));

  const save = async () => {
    setBusy(true);
    try {
      await saveProfile({ firstName, lastName, bio, sports, ...loc });
      toast({ title: 'Profil je sačuvan' });
      navigate('/profil');
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page className="max-w-3xl">
      <PageHeader title="Uredi profil" subtitle="Tvoj identitet rekreativnog igrača." back="/profil" />
      <div className="space-y-8">
        <GlassCard className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <GlassInput label="Ime" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
          <GlassInput label="Prezime" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
          <GlassTextarea className="sm:col-span-2" label="Kratko o tebi" placeholder="Npr. igram svake srijede, volim brzu igru…" value={bio} maxLength={160} onChange={(e) => setBio(e.target.value)} />
        </GlassCard>

        <section>
          <h2 className="mb-3 text-[19px] font-extrabold">Sportovi</h2>
          <SportPicker value={sports.map((s) => s.sport)} onChange={pickSports} />
        </section>
        {sports.length > 0 && (
          <section>
            <h2 className="mb-3 text-[19px] font-extrabold">Nivo i pozicije</h2>
            <SportLevelEditor value={sports} onChange={setSports} />
          </section>
        )}
        <section>
          <h2 className="mb-3 text-[19px] font-extrabold">Grad i radijus</h2>
          <CityRadiusPicker value={loc} onChange={setLoc} />
        </section>
        <div className="flex gap-3">
          <GlassButton variant="secondary" className="flex-1" onClick={() => navigate('/profil')}>
            Odustani
          </GlassButton>
          <GlassButton icon={Save} className="flex-[2]" onClick={save} disabled={!sports.length} loading={busy}>
            Sačuvaj
          </GlassButton>
        </div>
      </div>
    </Page>
  );
}
