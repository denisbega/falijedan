# FaliJedan

Mobile-first PWA za rekreativne sportske termine: kad ekipi fali igrač, organizator objavi termin, a igrači iz blizine se prijave. Svaki igrač ima profil i ocjene saigrača.

**Frontend:** React 19 + TypeScript · Vite · Tailwind CSS v4 · Framer Motion · Lucide · Leaflet · Manrope
**Backend:** Node.js 24 · Supabase/Postgres (`pg`) ili lokalni SQLite (`node:sqlite`) · sesije u httpOnly kolačiću · Google/Apple OAuth · realtime preko Server-Sent Events

## Pokretanje

```bash
npm install
npm run dev        # API (http://localhost:8787) + aplikacija (http://localhost:5173)
```

Otvori **http://localhost:5173**. Na ekranu prijave: „Isprobaj demo nalog“ (Nikola, sa istorijom termina, ocjena i poruka), ili registracija novim emailom (prolazi onboarding). Demo nalog ima i lozinku: `demo@falijedan.app` / `demo1234`.

Produkcija (jedan proces služi i aplikaciju i API):

```bash
npm run build
npm start          # http://localhost:8787 (ili PORT iz .env)
```

Ostale komande: `npm run typecheck`, `npm run db:reset` (briše lokalnu bazu; zaustavi server prije toga).

## Konfiguracija (.env)

Kopiraj `.env.example` u `.env`. Najvažnije:

| Varijabla | Opis |
|---|---|
| `PUBLIC_URL` | javna adresa (OAuth callback, `Secure` kolačići na https) |
| `DEMO_MODE` | `true` = demo podaci (Bijeljina), demo nalog i simulirani igrači; **za pravo lansiranje `false`** |
| `DATABASE_URL` | Postgres/Supabase baza (vidi ispod). Ako nije postavljen → lokalni SQLite |
| `DATABASE_PASSWORD` | lozinka baze, ako je ne želiš u URL-u (tada u URL-u ostaje `[YOUR-PASSWORD]`) |
| `DATABASE_SCHEMA` / `DATABASE_SSL` / `DATABASE_POOL_MAX` | šema (`falijedan`), SSL (`require`), broj konekcija (`5`) |
| `DATA_DIR` | folder SQLite baze (podrazumijevano `server/data`) |
| `GOOGLE_CLIENT_ID/SECRET` | uključuje „Nastavi sa Google“ (redirect URI: `{PUBLIC_URL}/api/auth/google/callback`) |
| `APPLE_CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY` | uključuje „Nastavi sa Apple“ (return URL: `{PUBLIC_URL}/api/auth/apple/callback`, mora https) |

Dugmad Google/Apple se na ekranu prijave pojavljuju tek kad su ključevi podešeni.

## Supabase

Server koristi Supabase kao Postgres bazu: sam kreira tabele (u šemi `falijedan`) i upisuje podatke. Ne treba ništa pokretati u SQL editoru niti koristiti Supabase ključeve (anon/service).

1. Na [supabase.com](https://supabase.com) napravi projekat (regija npr. *Central EU (Frankfurt)*). **Zapamti lozinku baze** koju tada upišeš.
2. U projektu klikni **Connect** (gore) → **Connection String** → izaberi **Session pooler** i kopiraj URI:
   `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<regija>.pooler.supabase.com:5432/postgres`
   (*Direct connection* radi samo preko IPv6, pa na većini kućnih mreža i hostinga ne prolazi.)
3. U `.env` (kopija `.env.example`):
   ```env
   DATABASE_URL=postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<regija>.pooler.supabase.com:5432/postgres
   DATABASE_PASSWORD=tvoja-lozinka-baze
   ```
   (Ili zamijeni `[YOUR-PASSWORD]` lozinkom direktno u URL-u, ali lozinka sa znakovima `@ # / %` tada lomi URL.)
4. `npm run dev` — u konzoli treba da piše `› Baza: Postgres (…pooler.supabase.com:5432, šema "falijedan")`. Pri prvom pokretanju kreiraju se tabele (i demo podaci ako je `DEMO_MODE=true`).
5. Tabele se vide u Supabase → **Table Editor** → padajući meni šema → `falijedan`.

**Sigurnost:** šema `falijedan` nije izložena Supabase Data API-ju, a na svim tabelama je uključen RLS bez polisa — podacima pristupa samo naš server preko `DATABASE_URL`. Zato URL i lozinku drži samo u `.env` (ne commituj ga).

**Prelazak sa lokalne baze:** podaci iz SQLite-a se ne prenose automatski — nova Supabase baza kreće prazna (ili sa demo podacima). Za pravo lansiranje: `DEMO_MODE=false`.

**Ako ne radi**, server ispiše razlog i savjet (pogrešna lozinka, „Tenant or user not found“ = pogrešno korisničko ime, IPv6/Direct connection, projekat pauziran…). Besplatni Supabase projekti se pauziraju nakon nedjelju dana neaktivnosti — vrati ga u rad u dashboardu.

## Deploy (Render)

Server je Node proces koji stalno radi (podaci u memoriji, realtime veze, zakazani poslovi svake minute), pa **ne radi na Vercelu/Netlify-u**: tamo se objavi samo frontend, `/api` ne postoji i aplikacija pokazuje „Server trenutno nije dostupan“. Treba hosting koji pokreće Node server: Render, Railway, Fly.io ili VPS. Jedan servis služi i aplikaciju i API.

Render (podešavanje je u `render.yaml`):

1. [render.com](https://render.com) → prijava sa GitHub-om → **New → Blueprint** → izaberi repo `falijedan`.
2. Upiši `DATABASE_URL` (Supabase Session pooler URI sa `[YOUR-PASSWORD]`) i `DATABASE_PASSWORD` → **Deploy**.
3. Za par minuta aplikacija je na `https://falijedan….onrender.com`. Javnu adresu server sam pročita (`RENDER_EXTERNAL_URL`), pa `PUBLIC_URL` nije potreban osim za vlastiti domen. **`PORT` ne postavljaj** — Render ga postavlja sam.

Besplatni plan „uspava“ servis nakon 15 min bez posjeta; prvo otvaranje nakon toga traje oko minut. Plan *Starter* je uvijek budan.

**Važno — jedna instanca po bazi:** dok produkcija radi nad Supabase bazom, lokalno **ne pokreći server sa istim `DATABASE_URL`**. Dva servera bi jedan drugom pregazila izmjene. Lokalno izbaci `DATABASE_URL` iz `.env` (koristi se SQLite) ili postavi `DATABASE_SCHEMA=falijedan_dev`.

**Čist početak u produkciji:** ako je baza ranije napunjena demo podacima (lokalno pokretanje sa `DEMO_MODE=true`), u Supabase → SQL Editor pokreni `drop schema falijedan cascade;` pa restartuj servis — tabele se ponovo kreiraju prazne.

## Arhitektura

```
server/
  index.ts       HTTP server, statični frontend (dist/), zakazani poslovi (svake minute)
  routes.ts      REST API + validacija ulaza + CSRF zaštita (samo JSON sa iste adrese)
  engine.ts      autoritativno stanje: transakcija → pravila → upis u bazu → realtime (transakcije u redu, jedna po jedna)
  storage/
    schema.ts    tabele i kolone (zajedničko) + računanje izmijenjenih redova (diff)
    postgres.ts  Supabase/Postgres: kreira šemu i tabele, upis razlika u jednoj transakciji
    sqlite.ts    lokalna SQLite baza (kad DATABASE_URL nije postavljen)
  auth.ts        scrypt lozinke, sesije, ograničenje pokušaja, Google/Apple OAuth
  realtime.ts    Server-Sent Events (/api/events): "sync" i "kuca…"
  bots.ts        samo u demo režimu: simulirani igrači se prijavljuju i odgovaraju
src/lib/
  rules.ts       SVA poslovna pravila (izvršava ih server) — prijava, lista čekanja, ocjene, poruke…
  selectors.ts   izvedena polja: koliko fali, ocjena, pouzdanost, statusi (dijeli server i klijent)
  api.ts         klijent: poziva API, svaki odgovor donosi svjež snimak podataka
  store.ts       klijentski keš (ETag sync, lokalna kopija za offline prikaz)
  realtime.ts    EventSource veza; osvježava podatke uživo
```

**Pravila koja provodi server:** prijava je zabranjena ako je termin pun, počeo ili otkazan; lista čekanja — kad se neko odjavi, prvi sa liste ulazi u ekipu i dobija obavještenje; ocjenjuju samo saigrači sa istog završenog termina, jednom po terminu; izostanak („nije došao“) se bilježi kad ga prijavi organizator ili dvoje saigrača i utiče na pouzdanost; organizator može ukloniti igrača i otkazati termin (svi dobijaju obavještenje); podsjetnik 2 h prije termina i poziv na ocjenjivanje; novi termin → obavještenje igračima tog sporta u njihovom radijusu.

**API (sve POST rute primaju JSON):**
`/api/auth/{register,login,logout,demo,providers}`, `/api/auth/{google,apple}` · `GET /api/sync` · `GET /api/events` · `/api/profile` · `/api/sessions` · `/api/sessions/:id/{join,leave,cancel,remove,ratings,invite}` · `/api/threads/direct` · `/api/threads/:id/{messages,read}` · `/api/notifications/{:id/read,read-all}`

**Skaliranje:** jedan Node proces (sa Supabase ili SQLite bazom) je dovoljan za regionalno lansiranje (stotine do nekoliko hiljada korisnika). Server drži stanje u memoriji, pa mora raditi **jedna instanca** — ne pokreći dva servera nad istom bazom. Sljedeći koraci: djelimični sync umjesto punog snimka i web push obavještenja na telefon.

## Logotipi — gdje se koristi koji

| Fajl | Upotreba |
|---|---|
| `public/brand/znak.png` | znak (F + 1) u zaglavlju i sidebaru |
| `public/brand/wordmark.png` | natpis „FaliJedan“ pored znaka |
| `public/brand/logo.png` | puni logotip — splash ekran, prijava, onboarding |
| `public/favicon-32.png` | favicon |
| `public/icons/icon-192.png`, `icon-512.png` | PWA ikone (`purpose: any`) |
| `public/icons/icon-512-maskable.png` | PWA maskable ikona (Android) |
| `public/icons/apple-touch-icon.png` | iOS početni ekran (180×180) |
| `public/icons/android-adaptive-foreground.png` | za nativni Android wrapper (Capacitor) |
| `public/og-image.png` | pregled linka pri dijeljenju |
| `brand-assets/*` | originali: logo crni/bijeli, znak za svijetlu pozadinu… |

Mapa koristi Esri „Dark Gray Canvas“ tile-ove (bez API ključa); za veći saobraćaj uzmi komercijalni servis mapa.
