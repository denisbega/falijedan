// Provjera slanja emaila: npm run email:test -- tvoja@adresa.com
// Ključ i pošiljalac iz .env (ili okruženja): BREVO_API_KEY ili RESEND_API_KEY + EMAIL_FROM.
// Provjerava ključ, potvrđenost pošiljaoca (Brevo) i šalje probni email istim kodom kao server.
import { config } from '../server/config.ts';
import { emailErrorHint, sendEmail } from '../server/email.ts';

const to = process.argv[2];
const { brevoKey, resendKey, from } = config.email;

// Bez process.exit nakon fetch-a (na Windowsu ruši Node dok je konekcija otvorena) — prekid preko izuzetka
class Stop extends Error {}
const ok = (s) => console.log(`✓ ${s}`);
const fail = (s) => {
  console.log(`✗ ${s}`);
  throw new Stop();
};

async function main() {
  if (!brevoKey && !resendKey) fail('Nema BREVO_API_KEY ni RESEND_API_KEY (u .env ili okruženju).');
  if (!from) fail('Nema EMAIL_FROM.');
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(from)) fail(`EMAIL_FROM mora biti samo adresa (npr. ime@gmail.com), bez imena, navodnika i <> — sada je: ${from}`);
  ok(`EMAIL_FROM: ${from}`);

  if (brevoKey) {
    if (brevoKey.startsWith('xsmtpsib-')) fail(emailErrorHint(401, '', brevoKey));
    if (!brevoKey.startsWith('xkeysib-')) console.log('! BREVO_API_KEY ne počinje sa "xkeysib-" — provjeri da si kopirao cijeli API ključ.');
    const api = (p) =>
      fetch(`https://api.brevo.com/v3${p}`, { headers: { 'api-key': brevoKey, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });

    const acc = await api('/account');
    if (!acc.ok) {
      const body = (await acc.text()).trim();
      fail(`Brevo odbija ključ (${acc.status}): ${body}\n  → ${emailErrorHint(acc.status, body, brevoKey) || 'provjeri ključ'}`);
    }
    ok(`Brevo ključ radi (nalog ${(await acc.json()).email})`);

    const s = await api('/senders');
    const senders = s.ok ? ((await s.json()).senders ?? []) : [];
    const sender = senders.find((x) => x.email?.toLowerCase() === from.toLowerCase());
    if (!sender)
      fail(
        `${from} nije dodan kao pošiljalac u Brevo (Senders, Domains & Dedicated IPs → Senders → Add a sender).` +
          (senders.length ? `\n  Postojeći: ${senders.map((x) => `${x.email}${x.active ? '' : ' (nepotvrđen)'}`).join(', ')}` : ''),
      );
    if (!sender.active) fail(`Pošiljalac ${from} postoji, ali nije potvrđen — klikni link iz Brevo emaila (ili "Verify" u Senders).`);
    ok(`Pošiljalac ${from} je potvrđen u Brevo`);
  }

  if (!to) return console.log('\nZa probno slanje: npm run email:test -- adresa@primjer.com');
  try {
    await sendEmail({
      to,
      subject: 'Probni email — FaliJedan',
      html: '<p>Ako ovo čitaš, slanje emaila iz FaliJedan radi. ✅</p>',
      text: 'Ako ovo čitaš, slanje emaila iz FaliJedan radi.',
    });
  } catch {
    fail('Slanje nije uspjelo — razlog je ispisan iznad.');
  }
  ok(`Brevo/Resend je prihvatio email za ${to}. Ako ne stigne za par minuta: provjeri Spam/Promocije i Brevo → Transactional → Logs.`);
}

main().catch((e) => {
  if (!(e instanceof Stop)) console.error(e);
  process.exitCode = 1;
});
