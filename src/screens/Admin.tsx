import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CalendarDays, CalendarX, ChevronRight, MessageCircle, Pencil, RefreshCw, Save, ShieldAlert, Trash2, UserCheck, UserPlus, Users, UsersRound } from 'lucide-react';
import { adminDeleteUser, adminUpdateUser, getAdminUsers, openDirectThread } from '../lib/api';
import { useMe, useSessionViews } from '../lib/hooks';
import { fullName, longDate, timeAgo, timeHM } from '../lib/format';
import { getSport } from '../lib/sports';
import { LIMITS } from '../lib/validation';
import type { AdminUser, SessionView } from '../lib/types';
import { DateBlock } from '../components/session/SessionRow';
import {
  EmptyState,
  GlassAvatar,
  GlassBadge,
  GlassButton,
  GlassCard,
  GlassChip,
  GlassInput,
  GlassModal,
  GlassSearch,
  GlassStatCard,
  GlassSwitch,
  GlassTabs,
  GlassTextarea,
  HScroll,
  Page,
  PageHeader,
  RowSkeleton,
  SessionBadge,
  useToast,
} from '../components/ui';

const WEEK = 7 * 86400000;
type Tab = 'users' | 'sessions';

/** Admin panel: svi korisnici (izmjena, brisanje, poruka) i svi termini. Pristup samo za ADMIN_EMAILS. */
export function Admin() {
  const me = useMe()!;
  const sessions = useSessionViews();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setUsers(await getAdminUsers());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Učitavanje nije uspjelo.');
    }
  }, []);
  useEffect(() => {
    if (me.admin) void load();
  }, [me.admin, load]);

  const stats = useMemo(() => {
    const now = Date.now();
    return {
      users: users?.length ?? null,
      newThisWeek: users?.filter((u) => now - Date.parse(u.createdAt) < WEEK).length ?? null,
      unverified: users?.filter((u) => !u.verified).length ?? null,
      upcoming: sessions.filter((s) => s.status === 'open' || s.status === 'full').length,
    };
  }, [users, sessions]);

  if (!me.admin) {
    return (
      <Page>
        <EmptyState icon={ShieldAlert} title="Nemaš pristup" text="Ova stranica je samo za administratore." action={<GlassButton to="/" size="md">Na početnu</GlassButton>} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Admin panel"
        subtitle="Svi korisnici i termini. Poruke koje ti korisnici pošalju stižu u Poruke."
        actions={<GlassButton to="/poruke" variant="secondary" size="sm" icon={MessageCircle}>Poruke</GlassButton>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <GlassStatCard label="Korisnici" value={stats.users ?? '—'} icon={Users} accent />
        <GlassStatCard label="Novi (7 dana)" value={stats.newThisWeek ?? '—'} icon={UserPlus} />
        <GlassStatCard label="Nepotvrđeni" value={stats.unverified ?? '—'} icon={UserCheck} />
        <GlassStatCard label="Nadolazeći termini" value={stats.upcoming} icon={CalendarDays} />
      </div>

      <GlassTabs
        className="mt-6"
        ariaLabel="Admin"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'users', label: 'Korisnici', count: users?.length },
          { value: 'sessions', label: 'Termini', count: sessions.length },
        ]}
      />

      <div className="mt-5">
        {tab === 'users' ? (
          <UsersTab meId={me.id} users={users} error={loadError} onRetry={load} onChange={setUsers} />
        ) : (
          <SessionsTab sessions={sessions} />
        )}
      </div>
    </Page>
  );
}

/* ---------------- Korisnici ---------------- */

type UserFilter = 'all' | 'unverified' | 'new' | 'admin';

function UsersTab({
  meId,
  users,
  error,
  onRetry,
  onChange,
}: {
  meId: string;
  users: AdminUser[] | null;
  error: string | null;
  onRetry: () => void;
  onChange: (users: AdminUser[]) => void;
}) {
  const navigate = useNavigate();
  const { error: showError } = useToast();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<UserFilter>('all');
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    const now = Date.now();
    return (users ?? [])
      .filter((u) => filter === 'all' || (filter === 'unverified' ? !u.verified : filter === 'admin' ? u.admin : now - Date.parse(u.createdAt) < WEEK))
      .filter((u) => !query || `${u.firstName} ${u.lastName} ${u.email} ${u.city}`.toLowerCase().includes(query));
  }, [users, q, filter]);

  if (error && !users) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Korisnici nisu učitani"
        text={error}
        action={
          <GlassButton size="md" icon={RefreshCw} onClick={onRetry}>
            Pokušaj ponovo
          </GlassButton>
        }
      />
    );
  }
  if (!users) {
    return (
      <div className="space-y-2.5">
        <RowSkeleton />
        <RowSkeleton />
        <RowSkeleton />
      </div>
    );
  }

  const message = async (u: AdminUser) => {
    try {
      navigate(`/poruke/${await openDirectThread(u.id)}`);
    } catch (e) {
      showError(e);
    }
  };

  return (
    <>
      <GlassSearch value={q} onChange={setQ} placeholder="Ime, email ili grad…" />
      <HScroll className="mt-3">
        {(
          [
            ['all', 'Svi'],
            ['new', 'Novi (7 dana)'],
            ['unverified', 'Nepotvrđeni'],
            ['admin', 'Admini'],
          ] as [UserFilter, string][]
        ).map(([id, label]) => (
          <GlassChip key={id} selected={filter === id} onClick={() => setFilter(id)}>
            {label}
          </GlassChip>
        ))}
      </HScroll>

      <p className="label-caps mb-3 mt-5 text-fj-text-2">{list.length} prikazano</p>
      {list.length ? (
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {list.map((u) => (
            <GlassCard key={u.id} tone="low" className="p-4">
              <div className="flex items-start gap-3">
                <Link to={`/igrac/${u.id}`} className="shrink-0" aria-label={`Profil: ${fullName(u)}`}>
                  <GlassAvatar user={u} size={44} verified={u.verified} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link to={`/igrac/${u.id}`} className="truncate text-[15px] font-extrabold hover:underline">
                      {fullName(u) || 'Bez imena'}
                    </Link>
                    {u.id === meId && <GlassBadge tone="neutral">Ti</GlassBadge>}
                    {u.admin && <GlassBadge tone="green">Admin</GlassBadge>}
                    {!u.verified && <GlassBadge tone="amber">Nepotvrđen</GlassBadge>}
                    {!u.onboarded && <GlassBadge tone="neutral">Bez profila</GlassBadge>}
                  </div>
                  <p className="mt-0.5 truncate text-[13px] font-semibold text-fj-text-2">{u.email}</p>
                  <p className="mt-0.5 text-[12px] text-fj-muted">
                    {u.city || '—'} · registrovan {timeAgo(u.createdAt)} · {u.organized} organizovao · {u.joined} prijava{!u.hasPassword && ' · Google/Apple'}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <GlassButton size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(u)}>
                  Uredi
                </GlassButton>
                {u.id !== meId && (
                  <GlassButton size="sm" variant="secondary" icon={MessageCircle} onClick={() => message(u)}>
                    Poruka
                  </GlassButton>
                )}
                {u.id !== meId && !u.admin && (
                  <GlassButton size="sm" variant="danger" icon={Trash2} onClick={() => setDeleting(u)}>
                    Obriši
                  </GlassButton>
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      ) : (
        <EmptyState icon={UsersRound} title="Nema korisnika" text="Nijedan korisnik ne odgovara pretrazi." />
      )}

      {editing && <EditUserModal key={editing.id} user={editing} onClose={() => setEditing(null)} onSaved={onChange} />}
      <DeleteUserModal user={deleting} onClose={() => setDeleting(null)} onDeleted={onChange} />
    </>
  );
}

function EditUserModal({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: (users: AdminUser[]) => void }) {
  const { toast, error } = useToast();
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email);
  const [city, setCity] = useState(user.city);
  const [bio, setBio] = useState(user.bio ?? '');
  const [verified, setVerified] = useState(user.verified);
  const [busy, setBusy] = useState(false);

  // Šalju se samo izmijenjena polja (stari OAuth nalozi mogu imati npr. prazno prezime)
  const changes = {
    ...(firstName.trim() !== user.firstName ? { firstName } : {}),
    ...(lastName.trim() !== user.lastName ? { lastName } : {}),
    ...(email.trim().toLowerCase() !== user.email ? { email } : {}),
    ...(city.trim() !== user.city ? { city } : {}),
    ...(bio.trim() !== (user.bio ?? '') ? { bio } : {}),
    ...(verified !== user.verified ? { verified } : {}),
  };
  const dirty = Object.keys(changes).length > 0;

  const save = async () => {
    setBusy(true);
    try {
      onSaved(await adminUpdateUser(user.id, changes));
      toast({ title: 'Korisnik je sačuvan' });
      onClose();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassModal
      open
      onClose={() => !busy && onClose()}
      title="Uredi korisnika"
      description={user.email}
      footer={
        <div className="flex gap-3">
          <GlassButton variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
            Odustani
          </GlassButton>
          <GlassButton icon={Save} className="flex-[2]" onClick={save} disabled={!dirty} loading={busy}>
            Sačuvaj
          </GlassButton>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <GlassInput label="Ime" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={LIMITS.name.max} />
        <GlassInput label="Prezime" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={LIMITS.name.max} />
        <GlassInput
          className="sm:col-span-2"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={LIMITS.email.max}
          disabled={user.admin}
          hint={user.admin ? 'Email admina se mijenja u ADMIN_EMAILS.' : 'Novi email korisnik koristi za prijavu.'}
        />
        <GlassInput className="sm:col-span-2" label="Grad" value={city} onChange={(e) => setCity(e.target.value)} maxLength={LIMITS.city.max} />
        <GlassTextarea className="sm:col-span-2" label="Opis" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={LIMITS.bio.max} />
        <div className="sm:col-span-2">
          <GlassSwitch checked={verified} onChange={setVerified} label="Email potvrđen" description="Nepotvrđen korisnik ne može da se prijavljuje na termine ni da piše drugim igračima." />
        </div>
      </div>
    </GlassModal>
  );
}

function DeleteUserModal({ user, onClose, onDeleted }: { user: AdminUser | null; onClose: () => void; onDeleted: (users: AdminUser[]) => void }) {
  const { toast, error } = useToast();
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!user) return;
    setBusy(true);
    try {
      onDeleted(await adminDeleteUser(user.id));
      toast({ title: `${fullName(user)} je obrisan/a` });
      onClose();
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <GlassModal
      open={!!user}
      onClose={() => !busy && onClose()}
      title={user ? `Obriši ${fullName(user)}?` : 'Obriši korisnika?'}
      description="Brišu se profil, email, sportovi i obavještenja. Termine koje organizuje otkazujemo (igrači dobijaju obavještenje), a iz ostalih ga odjavljujemo. Prijava više nije moguća. Ovo se ne može poništiti."
      footer={
        <div className="flex gap-3">
          <GlassButton variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
            Odustani
          </GlassButton>
          <GlassButton variant="danger" icon={Trash2} className="flex-[2]" onClick={remove} loading={busy}>
            Trajno obriši
          </GlassButton>
        </div>
      }
    >
      {user && <p className="text-[14px] text-fj-text-2">{user.email}</p>}
    </GlassModal>
  );
}

/* ---------------- Termini ---------------- */

type SessionFilter = 'upcoming' | 'past' | 'cancelled' | 'all';

function SessionsTab({ sessions }: { sessions: SessionView[] }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<SessionFilter>('upcoming');

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    const active = (s: SessionView) => s.status === 'open' || s.status === 'full';
    return sessions
      .filter((s) => filter === 'all' || (filter === 'upcoming' ? active(s) : filter === 'past' ? s.status === 'finished' : s.status === 'cancelled'))
      .filter((s) => !query || `${getSport(s.sport).name} ${s.venueName} ${s.address} ${s.city} ${s.organizer ? fullName(s.organizer) : ''}`.toLowerCase().includes(query))
      .sort((a, b) => (filter === 'upcoming' ? a.startsAtMs - b.startsAtMs : b.startsAtMs - a.startsAtMs));
  }, [sessions, q, filter]);

  return (
    <>
      <GlassSearch value={q} onChange={setQ} placeholder="Sport, lokacija, grad ili organizator…" />
      <HScroll className="mt-3">
        {(
          [
            ['upcoming', 'Nadolazeći'],
            ['past', 'Završeni'],
            ['cancelled', 'Otkazani'],
            ['all', 'Svi'],
          ] as [SessionFilter, string][]
        ).map(([id, label]) => (
          <GlassChip key={id} selected={filter === id} onClick={() => setFilter(id)}>
            {label}
          </GlassChip>
        ))}
      </HScroll>

      <p className="label-caps mb-3 mt-5 text-fj-text-2">{list.length} prikazano</p>
      {list.length ? (
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {list.map((s) => (
            <Link
              key={s.id}
              to={`/termin/${s.id}`}
              className="glass-low group flex min-h-[76px] items-center gap-3.5 rounded-card p-3 pr-3.5 transition-[background-color,border-color] duration-200 hover:border-[rgba(32,196,90,0.35)] hover:bg-white/[0.06]"
            >
              <DateBlock iso={s.startsAt} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-extrabold">
                  {getSport(s.sport).name} · <span className="num text-[15px] tracking-normal">{timeHM(s.startsAt)}</span>
                  <span className="font-semibold text-fj-text-2"> · {longDate(s.startsAt)}</span>
                </p>
                <p className="truncate text-[13px] font-medium text-fj-text-2">
                  {s.venueName}
                  {s.city && `, ${s.city}`}
                </p>
                <p className="truncate text-[12px] text-fj-muted">
                  {s.organizer ? fullName(s.organizer) : 'Nepoznat organizator'} · {s.confirmedCount}/{s.totalPlayers} igrača
                  {s.waitlist.length > 0 && ` · ${s.waitlist.length} na čekanju`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <SessionBadge s={s} short />
                <ChevronRight className="size-4 text-fj-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={CalendarX} title="Nema termina" text="Nijedan termin ne odgovara filteru." />
      )}
    </>
  );
}
