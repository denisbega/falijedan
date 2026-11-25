# FaliJedan

Mobile-first PWA za rekreativne sportske termine: kad ekipi fali igrač, organizator objavi termin, a igrači iz blizine se prijave. Svaki igrač ima profil i ocjene saigrača.

**Frontend:** React 19 + TypeScript · Vite · Tailwind CSS v4 · Framer Motion · Lucide · Leaflet · Manrope
**Backend:** Node.js 24 (bez dodatnih biblioteka) · SQLite (`node:sqlite`) · sesije u httpOnly kolačiću · Google/Apple OAuth · realtime preko Server-Sent Events

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
| `DATA_DIR` | folder SQLite baze (podrazumijevano `server/data`) |
| `GOOGLE_CLIENT_ID/SECRET` | uključuje „Nastavi sa Google“ (redirect URI: `{PUBLIC_URL}/api/auth/google/callback`) |
| `APPLE_CLIENT_ID/TEAM_ID/KEY_ID/PRIVATE_KEY` | uključuje „Nastavi sa Apple“ (return URL: `{PUBLIC_URL}/api/auth/apple/callback`, mora https) |

Dugmad Google/Apple se na ekranu prijave pojavljuju tek kad su ključevi podešeni.

## Arhitektura

```
server/
  index.ts       HTTP server, statični frontend (dist/), zakazani poslovi (svake minute)
  routes.ts      REST API + validacija ulaza + CSRF zaštita (samo JSON sa iste adrese)
  engine.ts      autoritativno stanje: transakcija → pravila → upis u SQLite → realtime
  db.ts          SQLite tabele + upis samo izmijenjenih redova (diff, u jednoj transakciji)
  auth.ts        scrypt lozinke, sesije, ograničenje pokušaja, Google/Apple OAuth
  realtime.ts    Server-Sent Events (/api/events): "sync" i "kuca…"
  bots.ts        samo u demo režimu: simulirani igrači se prijavljuju i odgovaraju
src/lib/
  rules.ts       SVA poslovna pravila (izvršava ih server) — prijava, lista čekanja, ocjene, poruke…
  selectors.ts   izvedena polja: koliko fali, ocjena, pouzdanost, statusi (dijeli server i klijent)
  api.ts         klijent: poziva API, svaki odgovor donosi svjež snimak podataka
  store.ts       klijentski keš (ETag sync, lokalna kopija za offline prikaz)
  realtime.ts    EventSource veza; osvježava podatke uživo
supabase/schema.sql   alternativna Postgres/Supabase šema (ako se kasnije pređe na Supabase)
```

**Pravila koja provodi server:** prijava je zabranjena ako je termin pun, počeo ili otkazan; lista čekanja — kad se neko odjavi, prvi sa liste ulazi u ekipu i dobija obavještenje; ocjenjuju samo saigrači sa istog završenog termina, jednom po terminu; izostanak („nije došao“) se bilježi kad ga prijavi organizator ili dvoje saigrača i utiče na pouzdanost; organizator može ukloniti igrača i otkazati termin (svi dobijaju obavještenje); podsjetnik 2 h prije termina i poziv na ocjenjivanje; novi termin → obavještenje igračima tog sporta u njihovom radijusu.

**API (sve POST rute primaju JSON):**
`/api/auth/{register,login,logout,demo,providers}`, `/api/auth/{google,apple}` · `GET /api/sync` · `GET /api/events` · `/api/profile` · `/api/sessions` · `/api/sessions/:id/{join,leave,cancel,remove,ratings,invite}` · `/api/threads/direct` · `/api/threads/:id/{messages,read}` · `/api/notifications/{:id/read,read-all}`

**Skaliranje:** jedan Node proces sa SQLite bazom je dovoljan za regionalno lansiranje (stotine do nekoliko hiljada korisnika). Sljedeći korak: Postgres umjesto SQLite-a (šema u `supabase/schema.sql`), djelimični sync umjesto punog snimka i web push obavještenja na telefon.

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
