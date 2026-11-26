/**
 * Slanje emaila (potvrda naloga, reset lozinke) — Brevo ili Resend preko HTTP API-ja, bez dodatnih biblioteka.
 * Bez podešenog ključa: u razvoju se sadržaj (sa linkom) ispisuje u konzolu; u produkciji se ništa ne loguje
 * (linkovi su tajni — ne smiju završiti u logovima hostinga).
 */
import { config, emailEnabled } from './config.ts';
import { ApiError } from '../src/lib/rules.ts';

export interface Mail {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(m: Mail): Promise<void> {
  const { brevoKey, resendKey, from, fromName } = config.email;
  if (!emailEnabled) {
    if (!config.isProd) console.log(`\n✉  [email — razvoj, nije poslan]\n   Za: ${m.to}\n   Naslov: ${m.subject}\n${m.text.replace(/^/gm, '   ')}\n`);
    else console.warn('email: slanje nije podešeno (BREVO_API_KEY ili RESEND_API_KEY + EMAIL_FROM)');
    return;
  }
  let res: Response;
  try {
    res = brevoKey
      ? await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ sender: { name: fromName, email: from }, to: [{ email: m.to, ...(m.toName ? { name: m.toName } : {}) }], subject: m.subject, htmlContent: m.html, textContent: m.text }),
          signal: AbortSignal.timeout(10000),
        })
      : await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: `${fromName} <${from}>`, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
          signal: AbortSignal.timeout(10000),
        });
  } catch (e) {
    console.error('email: servis nedostupan:', e instanceof Error ? e.message : e);
    throw new ApiError('Slanje emaila trenutno ne radi. Pokušaj ponovo za koji minut.', 503);
  }
  if (!res.ok) {
    // Odgovor servisa logujemo bez adrese primaoca i bez linka
    const body = (await res.text().catch(() => '')).slice(0, 300);
    const hint = emailErrorHint(res.status, body, brevoKey);
    console.error(`email: ${brevoKey ? 'Brevo' : 'Resend'} odbio slanje (${res.status}): ${body}${hint ? `\n  → ${hint}` : ''}`);
    throw new ApiError('Slanje emaila trenutno ne radi. Pokušaj ponovo za koji minut.', 503);
  }
}

/** Šta popraviti, za najčešće razloge odbijanja (Brevo/Resend) — ide u log servera. */
export function emailErrorHint(status: number, body: string, brevoKey = ''): string {
  const b = body.toLowerCase();
  if (brevoKey) {
    if (b.includes('unrecognised ip') || b.includes('unrecognized ip') || b.includes('authorised_ips'))
      return 'Brevo blokira nepoznatu IP adresu (Vercel nema stalnu IP) → app.brevo.com/security/authorised_ips → isključi blokiranje nepoznatih IP adresa.';
    if (status === 401 && brevoKey.startsWith('xsmtpsib-'))
      return 'BREVO_API_KEY je SMTP ključ (xsmtpsib-…). Treba API ključ (xkeysib-…): Brevo → SMTP & API → API Keys → Generate a new API key.';
    if (status === 401 || b.includes('key not found'))
      return 'Brevo ne prepoznaje BREVO_API_KEY (pogrešan, obrisan ili nepotpun ključ). Napravi novi u Brevo → SMTP & API → API Keys, pa redeploy.';
    if (b.includes('sender') && (b.includes('not valid') || b.includes('invalid')))
      return 'EMAIL_FROM nije potvrđen pošiljalac u Brevo → Senders, Domains & Dedicated IPs → Senders → dodaj adresu i potvrdi je linkom iz emaila.';
    if (b.includes('not yet activated') || b.includes('not activated') || b.includes('permission_denied'))
      return 'Brevo nalog još nije aktiviran za slanje (transactional). Dovrši profil u Brevo ili piši njihovoj podršci da aktiviraju nalog.';
  } else {
    if (b.includes('domain is not verified') || b.includes('verify a domain'))
      return 'Domena iz EMAIL_FROM nije potvrđena u Resend → Domains.';
    if (b.includes('only send testing emails'))
      return 'Resend bez potvrđene domene šalje samo na tvoju adresu — dodaj domenu u Resend → Domains (ili koristi Brevo).';
    if (status === 401 || status === 403) return 'Resend ne prihvata RESEND_API_KEY — napravi novi ključ.';
  }
  return '';
}

/* ---------- Šabloni ---------- */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(title: string, intro: string, button: string, link: string, outro: string) {
  return `<!doctype html><html lang="bs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#0B0F0D;font-family:Manrope,Segoe UI,Helvetica,Arial,sans-serif;color:#EAF2EC">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0B0F0D;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#141A17;border:1px solid #23302A;border-radius:20px;padding:32px">
<tr><td style="font-size:22px;font-weight:800;letter-spacing:-0.02em">Fali<span style="color:#20C45A">Jedan</span></td></tr>
<tr><td style="padding-top:24px;font-size:20px;font-weight:800">${esc(title)}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;line-height:1.6;color:#B8C7BE">${intro}</td></tr>
<tr><td style="padding:28px 0"><a href="${esc(link)}" style="display:inline-block;background:#20C45A;color:#04130A;text-decoration:none;font-weight:800;font-size:15px;padding:14px 26px;border-radius:14px">${esc(button)}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#8A9A91">${outro}<br><br>Ako dugme ne radi, kopiraj ovaj link u browser:<br><span style="word-break:break-all;color:#B8C7BE">${esc(link)}</span></td></tr>
</table>
<p style="font-size:12px;color:#5F6F66;margin-top:16px">FaliJedan · rekreativni sportski termini</p>
</td></tr></table></body></html>`;
}

export function verifyEmailMail(to: string, firstName: string, link: string): Mail {
  return {
    to,
    toName: firstName,
    subject: 'Potvrdi email adresu — FaliJedan',
    html: layout(
      'Potvrdi svoju email adresu',
      `Ćao ${esc(firstName)}! Hvala što si se registrovao/la na FaliJedan. Potvrdi email adresu da bi mogao/la da se prijavljuješ na termine, organizuješ i dopisuješ sa igračima.`,
      'Potvrdi email',
      link,
      'Link važi 48 sati. Ako nisi ti napravio/la nalog, slobodno ignoriši ovu poruku.',
    ),
    text: `Ćao ${firstName}!\n\nPotvrdi email adresu za FaliJedan otvaranjem ovog linka (važi 48 sati):\n${link}\n\nAko nisi ti napravio/la nalog, ignoriši ovu poruku.`,
  };
}

export function resetPasswordMail(to: string, firstName: string, link: string): Mail {
  return {
    to,
    toName: firstName,
    subject: 'Nova lozinka — FaliJedan',
    html: layout(
      'Postavi novu lozinku',
      `Ćao ${esc(firstName)}! Neko (vjerovatno ti) je zatražio novu lozinku za tvoj FaliJedan nalog.`,
      'Postavi novu lozinku',
      link,
      'Link važi 30 minuta i može se iskoristiti samo jednom. Nakon promjene lozinke bićeš odjavljen/a sa svih drugih uređaja. Ako nisi ti tražio/la promjenu, ignoriši ovu poruku — lozinka ostaje ista.',
    ),
    text: `Ćao ${firstName}!\n\nZa novu lozinku na FaliJedan otvori ovaj link (važi 30 minuta, jednokratan):\n${link}\n\nAko nisi ti tražio/la promjenu, ignoriši ovu poruku — lozinka ostaje ista.`,
  };
}
