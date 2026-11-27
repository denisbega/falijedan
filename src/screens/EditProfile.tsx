import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Download, Save, Trash2 } from 'lucide-react';
import { useDB, useMe } from '../lib/hooks';
import { deleteAccount, downloadMyData, saveProfile, type SportProfileInput } from '../lib/api';
import { LEVELS } from '../lib/sports';
import { LIMITS } from '../lib/validation';
import type { SportId } from '../lib/types';
import { emailPrefsOf } from '../lib/notifications';
import { GlassButton, GlassCard, GlassInput, GlassModal, GlassSwitch, GlassTextarea, Page, PageHeader, PasswordInput, useToast } from '../components/ui';
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
  const [emailPrefs, setEmailPrefs] = useState(() => emailPrefsOf(me));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const pickSports = (ids: SportId[]) =>
    setSports(ids.map((id) => sports.find((s) => s.sport === id) ?? { sport: id, level: LEVELS[1].id, positions: [] }));

  const save = async () => {
    setBusy(true);
    try {
      await saveProfile({ firstName, lastName, bio, sports, ...loc, emailPrefs });
      toast({ title: 'Profil je sačuvan' });
      navigate('/profil');
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  const confirmed = /^obri[sš]i$/i.test(confirm.trim()) && (!me.hasPassword || password.length > 0);
  const remove = async () => {
    setDeleting(true);
    try {
      await deleteAccount({ confirm: confirm.trim(), ...(me.hasPassword ? { password } : {}) });
      toast({ title: 'Nalog je obrisan', description: 'Tvoji lični podaci su uklonjeni.' });
    } catch (e) {
      error(e);
      setDeleting(false);
    }
  };

  return (
    <Page className="max-w-3xl">
      <PageHeader title="Uredi profil" subtitle="Tvoj identitet rekreativnog igrača." back="/profil" />
      <div className="space-y-8">
        <GlassCard className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <GlassInput label="Ime" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" maxLength={LIMITS.name.max} />
          <GlassInput label="Prezime" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" maxLength={LIMITS.name.max} />
          <GlassTextarea className="sm:col-span-2" label="Kratko o tebi" placeholder="Npr. igram svake srijede, volim brzu igru…" value={bio} maxLength={LIMITS.bio.max} onChange={(e) => setBio(e.target.value)} />
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
        <section>
          <h2 className="mb-3 text-[19px] font-extrabold">Email obavještenja</h2>
          <GlassCard className="divide-y divide-white/10 px-5 py-2">
            <GlassSwitch
              label="Pozivi i poruke"
              description="Kad te neko pozove na termin ili ti pošalje poruku."
              checked={emailPrefs.messages}
              onChange={(messages) => setEmailPrefs({ ...emailPrefs, messages })}
            />
            <GlassSwitch
              label="Moji termini"
              description="Podsjetnik prije termina, otkazan termin, mjesto sa liste čekanja."
              checked={emailPrefs.sessions}
              onChange={(sessions) => setEmailPrefs({ ...emailPrefs, sessions })}
            />
            <GlassSwitch
              label="Novi termini u blizini"
              description="Kad nekome fali igrač za tvoj sport u tvom radijusu (najviše 3 dnevno)."
              checked={emailPrefs.nearby}
              onChange={(nearby) => setEmailPrefs({ ...emailPrefs, nearby })}
            />
          </GlassCard>
          {me.needsVerification && <p className="mt-2 text-[13px] font-semibold text-fj-warning">Emailovi stižu tek kad potvrdiš email adresu.</p>}
        </section>
        <div className="flex gap-3">
          <GlassButton variant="secondary" className="flex-1" onClick={() => navigate('/profil')}>
            Odustani
          </GlassButton>
          <GlassButton icon={Save} className="flex-[2]" onClick={save} disabled={!sports.length} loading={busy}>
            Sačuvaj
          </GlassButton>
        </div>

        <section>
          <h2 className="mb-3 text-[19px] font-extrabold">Nalog i privatnost</h2>
          <GlassCard tone="low" className="space-y-4 p-5">
            <p className="text-[14px] leading-relaxed text-fj-text-2">
              Drugi igrači vide tvoje ime, grad i približnu udaljenost (nikad tačnu lokaciju), sportove i ocjene. Email vidiš samo ti.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <GlassButton variant="secondary" icon={Download} onClick={downloadMyData}>
                Preuzmi moje podatke
              </GlassButton>
              <GlassButton variant="danger" icon={Trash2} onClick={() => setDeleteOpen(true)}>
                Obriši nalog
              </GlassButton>
            </div>
          </GlassCard>
        </section>
      </div>

      <GlassModal
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        title="Obriši nalog?"
        description="Brišu se tvoj profil, sportovi i obavještenja. Termine koje organizuješ otkazujemo, a iz ostalih te odjavljujemo. Ovo se ne može poništiti."
        footer={
          <div className="flex gap-3">
            <GlassButton variant="secondary" className="flex-1" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Odustani
            </GlassButton>
            <GlassButton variant="danger" icon={Trash2} className="flex-[2]" onClick={remove} disabled={!confirmed} loading={deleting}>
              Trajno obriši
            </GlassButton>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4">
          {me.hasPassword && <PasswordInput label="Lozinka" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={LIMITS.password.max} />}
          <GlassInput label='Za potvrdu upiši "OBRIŠI"' value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" maxLength={10} />
        </div>
      </GlassModal>
    </Page>
  );
}
