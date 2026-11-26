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
| `DEMO_MODE` | `true` = demo podaci (Bijeljina), demo nalog (javna lozinka) i simulirani igrači. Podrazumijevano uključen samo u razvoju, u produkciji isključen |
| `DATABASE_URL` | Postgres/Supabase baza (vidi ispod). Ako nije postavljen → lokalni SQLite |
| `DATABASE_PASSWORD` | lozinka baze, ako je ne želiš u URL-u (tada u URL-u ostaje `[YOUR-PASSWORD]`) |
| `DATABASE_SCHEMA` / `DATABASE_SSL` / `DATABASE_POOL_MAX` | šema (`falijedan`), SSL (`require`), broj konekcija (`5`) |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | opciono: Cloudflare Turnstile na registraciji (zaštita od botova) |
| `TRUST_PROXY` | vlastiti server iza reverse proxyja: IP klijenta iz `X-Forwarded-For` |
| `BREVO_API_KEY` ili `RESEND_API_KEY` + `EMAIL_FROM` | slanje emaila: potvrda naloga i nova lozinka (vidi „Email“) |
| `ADMIN_EMAILS` | emailovi super admin naloga, odvojeni zarezom (vidi „Admin panel“) |
| `ADSENSE_CLIENT` + `ADSENSE_SLOT` (+ `ADSENSE_LAYOUT_KEY`) | Google AdSense reklame (vidi „Reklame“); bez njih nema reklama |
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

## Deploy na Vercel

`vercel.json` + `scripts/build-vercel.mjs` prave Vercel Build Output: statični frontend na CDN-u i **jedna serverless funkcija** za sve `/api/*` rute. Baza mora biti Postgres (Supabase), jer Vercel nema trajni disk.

1. Vercel → projekat → **Settings → Environment Variables** (Production + Preview):
   | Varijabla | Vrijednost |
   |---|---|
   | `DATABASE_URL` | Supabase → Connect → **Transaction pooler** (port `6543`) ili Session pooler (`5432`), sa `[YOUR-PASSWORD]` |
   | `DATABASE_PASSWORD` | lozinka baze |
   | `DEMO_MODE` | `false` za pravo lansiranje (`true` = demo nalog i simulirani igrači) |
2. **Deployments → Redeploy** (ili push na `main`). Build sam podesi region funkcije prema regionu baze (npr. `eu-west-1` → `dub1`); ručno: `FUNCTION_REGION=fra1`.
3. Provjera: `https://<projekat>.vercel.app/api/health` → `{"ok":true,…}`.

Framework, build i install komanda su u `vercel.json` — u Vercel podešavanjima ništa ne treba mijenjati. `PORT` i `PUBLIC_URL` nisu potrebni.

**Kako radi bez stalnog servera:** svaki zahtjev jednim brzim upitom provjeri reviziju u bazi i po potrebi učita svježe stanje; izmjene idu pod zaključavanjem u Postgresu (`pg_advisory_xact_lock`), pa je sigurno i sa više instanci istovremeno (Vercel, lokalni server nad istom bazom…). Umjesto realtime veze (SSE) aplikacija na Vercelu svake 2–4 s provjerava promjene (`304` kad nema ničega novog; sporije kad korisnik miruje), a indikator „kuca…“ postoji samo na stalnom serveru. Podsjetnici i pozivi na ocjenjivanje se pokreću uz zahtjeve, najviše jednom u minuti.

**Čist početak u produkciji:** ako je baza ranije napunjena demo podacima, u Supabase → SQL Editor pokreni `drop schema falijedan cascade;` — server pri sljedećem zahtjevu sam ponovo kreira tabele (prazne ako je `DEMO_MODE=false`).

**Alternativa — stalni Node server** (VPS, Render, Railway…): `npm run build && npm start`; tada radi i SSE realtime.

## Email (potvrda naloga, nova lozinka)

Emailovi idu preko **Brevo** (besplatno 300/dan, radi i bez vlastite domene) ili **Resend** (besplatno 3.000/mj, traži domenu) — bez dodatnih biblioteka, preko HTTP API-ja.

1. [brevo.com](https://www.brevo.com) → besplatan nalog → **Senders, Domains & Dedicated IPs → Senders → Add a sender** (adresa sa koje šalješ, potvrdi je klikom na link).
2. **SMTP & API → API Keys → Generate a new API key**.
3. Vercel → Settings → Environment Variables: `BREVO_API_KEY`, `EMAIL_FROM` (adresa iz koraka 1), opciono `EMAIL_FROM_NAME`. Redeploy.

**Email ne stiže?** Reset lozinke se šalje u pozadini, pa korisnik uvijek vidi „poslano“ — razlog greške je samo u logu (Vercel → projekat → Logs, traži `email:`). Najčešće:
- **Brevo → Security → Authorised IPs**: Brevo blokira API pozive sa nepoznatih IP adresa, a Vercel nema stalnu IP → isključi blokiranje.
- `BREVO_API_KEY` mora biti **API ključ** (`xkeysib-…`), ne SMTP ključ (`xsmtpsib-…`).
- `EMAIL_FROM` mora biti dodan i **potvrđen** u Brevo → Senders (samo adresa, bez imena i navodnika).
- Nakon izmjene varijabli na Vercelu treba **Redeploy**.

Lokalna provjera: stavi `BREVO_API_KEY` i `EMAIL_FROM` u `.env`, pa `npm run email:test -- tvoja@adresa.com` (provjeri ključ i pošiljaoca, pa pošalje probni email).

Bez vlastite domene Brevo pošiljaoca prepisuje u `…@brevosend.com` (Gmail/Yahoo zahtijevaju autentifikovanu domenu), pa email češće završi u spamu. Sa domenom (npr. `falijedan.ba`, ~10–20 €/god.) dodaj je u Brevo → Domains (DKIM/DMARC zapisi) ili pređi na Resend.

Kad je email podešen: nova registracija dobija link za potvrdu (48 h); dok email nije potvrđen, korisnik ne može da se prijavljuje na termine, organizuje, šalje poruke ni ocjenjuje (vidi baner sa „Pošalji ponovo“). „Zaboravljena lozinka?“ šalje jednokratan link (30 min); nova lozinka odjavljuje sve druge uređaje. Bez podešenog emaila (lokalni razvoj) linkovi se ispisuju u konzoli servera.

## Admin panel

Super admin je običan nalog čiji je email naveden u `ADMIN_EMAILS` (Vercel → Settings → Environment Variables, pa Redeploy). Prava se daju samo tu, ne u bazi, pa ih niko ne može sam sebi dodijeliti. Nalog mora imati potvrđen email (dok je potvrda uključena) — tako niko ne može registrovati admin email prije vlasnika.

Admin dobija stranicu **Admin panel** (`/admin`; u bočnom meniju, a na mobilnom u Profilu):
- **Korisnici** — svi nalozi sa emailom, gradom, datumom registracije i brojem termina; pretraga i filteri (novi, nepotvrđeni, admini). Može urediti ime, prezime, email, grad, opis i potvrdu emaila, poslati poruku ili obrisati nalog (isto kao kad korisnik sam obriše nalog: termini koje organizuje se otkazuju, sesije se gase). Admin nalog se ne može obrisati niti mu se ovdje mijenja email.
- **Termini** — svi termini (nadolazeći, završeni, otkazani) sa organizatorom i popunjenošću; klik otvara termin.

Korisnici u Profilu imaju dugme **Kontaktiraj podršku** — otvara razgovor sa adminom (radi i prije potvrde emaila). Poruke stižu adminu u Poruke, a admin je svima označen kao „FaliJedan podrška“. Izmjene i brisanja se bilježe u log servera (`admin: …`).

**Test faza i prijava bugova** (`src/components/feedback/Feedback.tsx`): nakon svake prijave (i jednom svakom već prijavljenom korisniku) iskače obavještenje da je aplikacija u testnoj fazi, sa dugmetom „Prijavi bug ili ideju“. Isti obrazac je stalno dostupan u bočnom meniju („Prijavi bug“) i u Profilu. Prijava stiže adminu kao poruka (🐞 bug / 💡 prijedlog), sa stranicom i vrstom uređaja; admin odgovara u istom razgovoru. Bez admin naloga ništa od ovoga se ne prikazuje.

## Reklame (Google AdSense)

Reklame su isključene dok se ne postave `ADSENSE_CLIENT` i `ADSENSE_SLOT`. Tada se pri buildu dodaju AdSense meta tag (potvrda sajta) i `/ads.txt`, CSP dozvoljava samo Googleove AdSense domene, a reklama se prikazuje na **dva mjesta**:
- **Početna** — jedna, između „Tvoji naredni termini“ i „Termini u tvojoj blizini“;
- **Istraži** — jedna, poslije 6. termina u listi.

Nema reklama u chatu, terminu, profilu, prijavi ni admin panelu. Kartica sa oznakom „Reklama“ se pojavljuje tek kad Google stvarno ubaci reklamu — prije odobrenja sajta, kad nema reklame ili uz blokator reklama ne ostaje prazna kutija. Admin ne vidi reklame (klik na vlastite reklame krši pravila AdSense-a i može ugasiti nalog).

1. [adsense.google.com](https://adsense.google.com) → dodaj sajt. Najbolje sa vlastitom domenom (npr. `falijedan.ba`).
2. Vercel → Environment Variables: `ADSENSE_CLIENT=ca-pub-…` (Publisher ID iz AdSense → Account). Redeploy — time se objavljuju meta tag i `ads.txt` koje AdSense provjerava.
3. Nakon odobrenja: AdSense → Ads → By ad unit → **Display ads** (responsive) → iz koda kopiraj `data-ad-slot` u `ADSENSE_SLOT`. Za reklamu koja izgleda kao kartica u listi napravi **In-feed ad** i kopiraj i `data-ad-layout-key` u `ADSENSE_LAYOUT_KEY`. Redeploy.
4. AdSense → Privacy & messaging → poruka o pristanku za EU/UK posjetioce (Google je obavezno traži za te zemlje; CSP to već dozvoljava).

Napomena: AdSense pregledava javno dostupan sadržaj, a FaliJedan je skoro sav iza prijave — odobrenje može biti odbijeno zbog „premalo sadržaja“. Pomaže javna stranica sa opisom aplikacije i politikom privatnosti (koja mora pomenuti Googleove kolačiće za reklame).

## Sigurnost

- **Prijava:** lozinke scrypt (N=2^15, r=8, p=3 — OWASP), najmanje 8 znakova, česte lozinke odbijene; stari heševi se nadograđuju pri prijavi. Sesije: nasumični token (256 bit), u bazi samo SHA-256 heš; kolačić `__Host-fj_session` (HttpOnly, Secure, SameSite=Lax) na https; nova prijava ukida stari token; odjava i brisanje naloga ukidaju sesije odmah na svim instancama.
- **Zaštita od zaključavanja:** browser u kojem se korisnik već prijavio dobija kolačić povjerljivog uređaja — limit od 10 pokušaja po nalogu važi samo za nove uređaje, pa napadač ne može zaključati vlasnika na njegovom telefonu; sa novog uređaja izlaz je „Zaboravljena lozinka?“.
- **Ograničenja pokušaja (u bazi, važe za sve instance):** prijava 10/15 min po nalogu (novi uređaji) ili po povjerljivom uređaju i 30/15 min po IP-u, registracija 10/h po IP-u, termini 10/h, poruke 500/dan (+ 20/min po instanci), novi razgovori 30/dan… IP adrese i emailovi se u bazi čuvaju samo kao heš. Opciono Cloudflare Turnstile na registraciji (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`).
- **Validacija:** svaka ruta ima striktnu šemu (`src/lib/validation.ts`) — nepoznata polja, pogrešni tipovi, preduge vrijednosti, HTML, kontrolni znakovi, nemogući datumi i vrijednosti van opsega se odbijaju (400), ništa se ne skraćuje tiho. SQL ide isključivo kroz parametrizovane upite.
- **CSRF:** POST samo kao `application/json` sa našeg sajta (Origin + Sec-Fetch-Site) uz SameSite kolačić; Google/Apple prijava je vezana za browser (state u kolačiću i bazi).
- **Zaglavlja:** CSP (bez inline skripti), HSTS, X-Frame-Options/frame-ancestors, nosniff, COOP, Permissions-Policy — za Vercel i stalni server iz `server/headers.ts`.
- **Privatnost:** drugi korisnici vide približnu lokaciju (~1 km), nikad email; ko je dao numeričku ocjenu ili prijavio izostanak je anoniman. Korisnik može preuzeti svoje podatke i obrisati nalog (Uredi profil → Nalog i privatnost). Kad je `DEMO_MODE` isključen, demo nalog ne radi, a demo podaci (Bijeljina) se automatski uklanjaju iz baze — podaci pravih korisnika ostaju.
- **Baza:** šema `falijedan` nije izložena Supabase Data API-ju, RLS uključen bez polisa (pristup samo serveru); TLS prema bazi (`DATABASE_SSL=verify` + `DATABASE_CA` za punu provjeru certifikata).

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
  vercel.ts      Vercel serverless funkcija (/api/*): provjera svježine, zakazani poslovi uz zahtjeve
src/lib/
  rules.ts       SVA poslovna pravila (izvršava ih server) — prijava, lista čekanja, ocjene, poruke…
  selectors.ts   izvedena polja: koliko fali, ocjena, pouzdanost, statusi (dijeli server i klijent)
  api.ts         klijent: poziva API, svaki odgovor donosi svjež snimak podataka
  store.ts       klijentski keš (ETag sync, lokalna kopija za offline prikaz)
  realtime.ts    osvježavanje uživo: SSE (stalni server) ili polling uz ETag (Vercel)
```

**Pravila koja provodi server:** prijava je zabranjena ako je termin pun, počeo ili otkazan; lista čekanja — kad se neko odjavi, prvi sa liste ulazi u ekipu i dobija obavještenje; ocjenjuju samo saigrači sa istog završenog termina, jednom po terminu; izostanak („nije došao“) se bilježi kad ga prijavi organizator ili dvoje saigrača i utiče na pouzdanost; organizator može ukloniti igrača i otkazati termin (svi dobijaju obavještenje); podsjetnik 2 h prije termina i poziv na ocjenjivanje; novi termin → obavještenje igračima tog sporta u njihovom radijusu.

**API (sve POST rute primaju JSON):**
`/api/auth/{register,login,logout,demo,providers}`, `/api/auth/{google,apple}` · `GET /api/sync` · `GET /api/events` · `/api/profile` · `/api/sessions` · `/api/sessions/:id/{join,leave,cancel,remove,ratings,invite}` · `/api/threads/direct` · `/api/threads/:id/{messages,read}` · `/api/notifications/{:id/read,read-all}`

**Skaliranje:** stanje se drži u memoriji kao keš i provjerava prema reviziji u bazi, a izmjene idu pod zaključavanjem — pa nad istom Supabase bazom smije raditi više instanci (Vercel funkcije, lokalni server). Dovoljno za regionalno lansiranje (stotine do nekoliko hiljada korisnika). Sljedeći koraci: djelimični sync umjesto punog snimka, Supabase Realtime umjesto pollinga na Vercelu i web push obavještenja na telefon.

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
