-- =====================================================================
-- FaliJedan — Supabase / Postgres šema (produkcijski backend)
-- Odgovara lokalnom data sloju u src/lib (types.ts, api.ts, selectors.ts).
-- Pokreni u Supabase SQL editoru. Izvedena polja se računaju na serveru.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Enumi ----------
create type sport_id as enum ('mali-fudbal', 'kosarka', 'odbojka', 'padel', 'tenis', 'rukomet');
create type skill_level as enum ('pocetni', 'srednji', 'napredni');
create type session_status as enum ('open', 'full', 'cancelled', 'finished');
create type player_role as enum ('organizer', 'player');
create type player_status as enum ('confirmed', 'waitlist', 'cancelled', 'no_show');

-- ---------- Korisnici (1:1 sa auth.users) ----------
create table public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  first_name  text not null check (char_length(first_name) between 2 and 40),
  last_name   text not null check (char_length(last_name) between 2 and 40),
  avatar_url  text,
  bio         text check (char_length(bio) <= 160),
  city        text not null default 'Bijeljina',
  lat         double precision not null,
  lng         double precision not null,
  radius_km   int not null default 10 check (radius_km between 1 and 50),
  verified    boolean not null default false,
  onboarded   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.player_sports (
  user_id    uuid not null references public.users (id) on delete cascade,
  sport      sport_id not null,
  level      skill_level not null,
  positions  text[] not null default '{}',
  primary key (user_id, sport)
);

-- ---------- Termini ----------
create table public.sessions (
  id                uuid primary key default gen_random_uuid(),
  organizer_id      uuid not null references public.users (id) on delete cascade,
  sport             sport_id not null,
  venue_name        text not null check (char_length(venue_name) >= 3),
  address           text,
  city              text not null,
  lat               double precision not null,
  lng               double precision not null,
  starts_at         timestamptz not null,
  duration_min      int not null check (duration_min in (60, 90, 120)),
  total_players     int not null check (total_players between 2 and 40),
  base_count        int not null check (base_count >= 1),          -- "već vas je" (uklj. organizatora)
  price_km          numeric(6,2) check (price_km is null or price_km > 0), -- null = besplatno
  level             skill_level not null,
  needed_positions  text[] not null default '{}',
  status            session_status not null default 'open',          -- open | full | cancelled (finished se izvodi)
  created_at        timestamptz not null default now(),
  check (base_count < total_players)
);
create index sessions_starts_idx on public.sessions (starts_at);
create index sessions_geo_idx on public.sessions (lat, lng);

create table public.session_players (
  session_id  uuid not null references public.sessions (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  role        player_role not null default 'player',
  status      player_status not null,
  position    text,
  joined_at   timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- ---------- Ocjene ----------
create table public.ratings (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.sessions (id) on delete cascade,
  from_user_id  uuid not null references public.users (id) on delete cascade,
  to_user_id    uuid not null references public.users (id) on delete cascade,
  fair_play     smallint check (fair_play between 1 and 5),
  teamwork      smallint check (teamwork between 1 and 5),
  punctuality   smallint check (punctuality between 1 and 5),
  skill         smallint check (skill between 1 and 5),
  fitness       smallint check (fitness between 1 and 5),
  comment       text check (char_length(comment) <= 240),
  no_show       boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (session_id, from_user_id, to_user_id),  -- jednom po terminu
  check (from_user_id <> to_user_id),
  check (no_show or (fair_play is not null and teamwork is not null and punctuality is not null and skill is not null and fitness is not null))
);

-- ---------- Poruke i obavještenja ----------
create table public.threads (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('direct', 'session')),
  session_id  uuid unique references public.sessions (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create table public.thread_members (
  thread_id     uuid not null references public.threads (id) on delete cascade,
  user_id       uuid not null references public.users (id) on delete cascade,
  last_read_at  timestamptz,
  primary key (thread_id, user_id)
);
create table public.messages (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null references public.threads (id) on delete cascade,
  from_user_id  uuid not null references public.users (id) on delete cascade,
  text          text not null check (char_length(text) <= 1000),
  session_id    uuid references public.sessions (id) on delete set null, -- prilog: poziv na termin
  created_at    timestamptz not null default now()
);
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text not null,
  link        text,
  dedupe_key  text,
  read        boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

-- =====================================================================
-- Izvedena polja (view-ovi)
-- =====================================================================

-- missing = total − potvrđeni; status "finished" se izvodi iz vremena
create or replace view public.session_view as
select s.*,
  s.base_count + coalesce(c.joined, 0) as confirmed_count,
  greatest(0, s.total_players - s.base_count - coalesce(c.joined, 0)) as missing,
  case
    when s.status = 'cancelled' then 'cancelled'::session_status
    when now() >= s.starts_at + make_interval(mins => s.duration_min) then 'finished'::session_status
    when s.total_players - s.base_count - coalesce(c.joined, 0) <= 0 then 'full'::session_status
    else 'open'::session_status
  end as live_status
from public.sessions s
left join lateral (
  select count(*)::int as joined from public.session_players p
  where p.session_id = s.id and p.role = 'player' and p.status in ('confirmed', 'no_show')
) c on true;

-- ukupna ocjena = prosjek svih kategorija svih ocjena; pouzdanost = dolasci / (dolasci + izostanci)
create or replace view public.user_stats as
select u.id as user_id,
  (select round(avg((r.fair_play + r.teamwork + r.punctuality + r.skill + r.fitness) / 5.0), 2)
     from public.ratings r where r.to_user_id = u.id and not r.no_show) as overall,
  (select count(*) from public.ratings r where r.to_user_id = u.id and not r.no_show) as rating_count,
  (select count(*) from public.session_players p join public.session_view v on v.id = p.session_id
     where p.user_id = u.id and p.status = 'confirmed' and v.live_status = 'finished') as played,
  (select count(*) from public.session_players p where p.user_id = u.id and p.status = 'no_show') as no_shows,
  (select count(*) from public.sessions s where s.organizer_id = u.id and s.status <> 'cancelled') as organized
from public.users u;

-- =====================================================================
-- Poslovna pravila (RPC) — klijent zove supabase.rpc('join_session', …)
-- =====================================================================

create or replace function public.join_session(p_session uuid, p_waitlist boolean default false)
returns player_status language plpgsql security definer set search_path = public as $$
declare v record; st player_status; me uuid := auth.uid();
begin
  perform 1 from sessions where id = p_session for update;  -- zaključaj termin (bez trke za zadnje mjesto)
  select * into v from session_view where id = p_session;
  if not found then raise exception 'Termin ne postoji.'; end if;
  if v.status = 'cancelled' then raise exception 'Termin je otkazan.'; end if;
  if v.starts_at <= now() then raise exception 'Termin je već počeo — prijave su zatvorene.'; end if;
  if v.organizer_id = me then raise exception 'Ti si organizator ovog termina.'; end if;
  if exists (select 1 from session_players where session_id = p_session and user_id = me and status in ('confirmed','waitlist'))
    then raise exception 'Već si prijavljen na ovaj termin.'; end if;
  if v.missing <= 0 and not p_waitlist then raise exception 'Termin je popunjen.'; end if;
  st := case when v.missing > 0 then 'confirmed' else 'waitlist' end;
  insert into session_players (session_id, user_id, role, status)
  values (p_session, me, 'player', st)
  on conflict (session_id, user_id) do update set status = excluded.status, joined_at = now();
  insert into thread_members (thread_id, user_id)
    select id, me from threads where session_id = p_session on conflict do nothing;
  if st = 'confirmed' and v.missing - 1 <= 0 then update sessions set status = 'full' where id = p_session; end if;
  return st;
end $$;

create or replace function public.leave_session(p_session uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); was player_status; nxt uuid;
begin
  select status into was from session_players where session_id = p_session and user_id = me and role = 'player' and status in ('confirmed','waitlist');
  if not found then raise exception 'Nisi prijavljen na ovaj termin.'; end if;
  if (select starts_at from sessions where id = p_session) <= now() then raise exception 'Termin je već počeo.'; end if;
  update session_players set status = 'cancelled' where session_id = p_session and user_id = me;
  if was = 'confirmed' then
    update sessions set status = 'open' where id = p_session and status = 'full';
    -- prvi sa liste čekanja ulazi u ekipu i dobija obavještenje
    select user_id into nxt from session_players where session_id = p_session and status = 'waitlist' order by joined_at limit 1;
    if nxt is not null then
      update session_players set status = 'confirmed' where session_id = p_session and user_id = nxt;
      insert into notifications (user_id, type, title, body, link)
      values (nxt, 'waitlist_promoted', 'Oslobodilo se mjesto — u ekipi si!', 'Prešao si sa liste čekanja u ekipu.', '/termin/' || p_session);
    end if;
  end if;
end $$;

-- Ocjenjivati mogu samo igrači sa istog (završenog) termina
create or replace function public.can_rate(p_session uuid, p_to uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from session_view v where v.id = p_session and v.live_status = 'finished')
     and exists (select 1 from session_players where session_id = p_session and user_id = auth.uid() and status = 'confirmed')
     and exists (select 1 from session_players where session_id = p_session and user_id = p_to and status in ('confirmed','no_show'));
$$;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.users enable row level security;
alter table public.player_sports enable row level security;
alter table public.sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.ratings enable row level security;
alter table public.threads enable row level security;
alter table public.thread_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

create policy "profili su javni" on public.users for select using (true);
create policy "svoj profil" on public.users for update using (id = auth.uid());
create policy "svoj profil insert" on public.users for insert with check (id = auth.uid());
create policy "sportovi javni" on public.player_sports for select using (true);
create policy "svoji sportovi" on public.player_sports for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "termini javni" on public.sessions for select using (true);
create policy "organizator kreira" on public.sessions for insert with check (organizer_id = auth.uid() and starts_at > now());
create policy "organizator mijenja" on public.sessions for update using (organizer_id = auth.uid());
create policy "ekipe javne" on public.session_players for select using (true);
create policy "organizator upravlja ekipom" on public.session_players for update
  using (exists (select 1 from sessions s where s.id = session_id and s.organizer_id = auth.uid()));
create policy "organizator se upisuje" on public.session_players for insert
  with check (user_id = auth.uid() and role = 'organizer');
-- prijava/odjava igrača ide isključivo kroz RPC join_session / leave_session

create policy "ocjene javne" on public.ratings for select using (true);
create policy "ocjena saigrača" on public.ratings for insert
  with check (from_user_id = auth.uid() and public.can_rate(session_id, to_user_id));

create policy "članovi vide threadove" on public.threads for select
  using (exists (select 1 from thread_members m where m.thread_id = id and m.user_id = auth.uid()));
create policy "članstvo" on public.thread_members for select using (user_id = auth.uid()
  or exists (select 1 from thread_members m where m.thread_id = thread_id and m.user_id = auth.uid()));
create policy "čitanje poruka" on public.messages for select
  using (exists (select 1 from thread_members m where m.thread_id = messages.thread_id and m.user_id = auth.uid()));
create policy "slanje poruka" on public.messages for insert
  with check (from_user_id = auth.uid() and exists (select 1 from thread_members m where m.thread_id = messages.thread_id and m.user_id = auth.uid()));

create policy "moja obavještenja" on public.notifications for select using (user_id = auth.uid());
create policy "označi pročitano" on public.notifications for update using (user_id = auth.uid());

-- ---------- Realtime (slobodna mjesta, poruke, obavještenja uživo) ----------
alter publication supabase_realtime add table public.session_players, public.sessions, public.messages, public.notifications;

-- Zakazani poslovi (pg_cron): podsjetnik 2h prije termina i poziv na ocjenjivanje
-- vidi runScheduledJobs() u src/lib/api.ts za logiku koju treba prenijeti u cron/Edge Function.
