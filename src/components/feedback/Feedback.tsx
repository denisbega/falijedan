/**
 * Test faza: obavještenje pri prijavi + prijava buga/prijedloga. Prijava ide kao poruka adminu (FaliJedan podrška),
 * pa admin odgovara u Poruke. Bez admin naloga (ADMIN_EMAILS) ništa od ovoga se ne prikazuje.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Bug, FlaskConical, Lightbulb, Send } from 'lucide-react';
import { JUST_LOGGED_IN_KEY, openDirectThread, sendMessage } from '../../lib/api';
import { useDB, useMe } from '../../lib/hooks';
import { store } from '../../lib/store';
import { GlassButton, GlassModal, GlassTabs, GlassTextarea, useToast } from '../ui';

type Kind = 'bug' | 'idea';
interface FeedbackApi {
  /** Postoji admin kome se prijava šalje (korisnik nije sam admin) */
  available: boolean;
  open: (kind?: Kind) => void;
}

const Ctx = createContext<FeedbackApi>({ available: false, open: () => undefined });
export const useFeedback = () => useContext(Ctx);

const seenKey = (userId: string) => `falijedan:test-faza:${userId}`;

/** Prikaži nakon svake prijave, i jednom svakom korisniku koji je već bio prijavljen kad je obavještenje uvedeno. */
function shouldShowNotice(userId: string): boolean {
  try {
    return localStorage.getItem(JUST_LOGGED_IN_KEY) === '1' || !localStorage.getItem(seenKey(userId));
  } catch {
    return false;
  }
}
function markNoticeShown(userId: string) {
  try {
    localStorage.removeItem(JUST_LOGGED_IN_KEY);
    localStorage.setItem(seenKey(userId), new Date().toISOString());
  } catch {
    /* privatni režim — obavještenje se jednostavno ne pamti */
  }
}

/** Kratak opis uređaja za prijavu buga (bez ličnih podataka). */
function deviceInfo(): string {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'nepoznat sistem';
  const browser = /SamsungBrowser/i.test(ua)
    ? 'Samsung Internet'
    : /Edg\//i.test(ua)
      ? 'Edge'
      : /OPR\//i.test(ua)
        ? 'Opera'
        : /Firefox|FxiOS/i.test(ua)
          ? 'Firefox'
          : /Chrome|CriOS/i.test(ua)
            ? 'Chrome'
            : /Safari/i.test(ua)
              ? 'Safari'
              : 'browser';
  const installed = window.matchMedia?.('(display-mode: standalone)').matches ? ', instalirana aplikacija' : '';
  return `${os}, ${browser}${installed}`;
}

const MAX_TEXT = 850; // poruka ima limit 1000 znakova — ostatak je zaglavlje i podaci o uređaju

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const db = useDB();
  const navigate = useNavigate();
  const { toast, error } = useToast();
  const support = useMemo(() => (me && !me.admin ? (db.users.find((u) => u.admin && !u.deleted) ?? null) : null), [db, me]);

  const [notice, setNotice] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('bug');
  const [text, setText] = useState('');
  const [page, setPage] = useState('/');
  const [busy, setBusy] = useState(false);
  // Pri pokretanju se prvo prikazuju keširani podaci — obavještenje tek kad server potvrdi ko je prijavljen
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    let alive = true;
    void store.refresh().then(() => alive && setSynced(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!synced || !me || !support || !shouldShowNotice(me.id)) return;
    markNoticeShown(me.id);
    setNotice(true);
  }, [synced, me, support]);

  const open = useCallback((k: Kind = 'bug') => {
    setKind(k);
    setPage(window.location.pathname);
    setNotice(false);
    setFormOpen(true);
  }, []);
  const api = useMemo<FeedbackApi>(() => ({ available: !!support, open }), [support, open]);

  const send = async () => {
    if (!support) return;
    setBusy(true);
    try {
      const header = kind === 'bug' ? '🐞 PRIJAVA BUGA' : '💡 PRIJEDLOG';
      const body = `${header}\n${text.trim()}\n\n— Stranica: ${page.slice(0, 60)} · ${deviceInfo()}`;
      const threadId = await openDirectThread(support.id);
      await sendMessage(threadId, body);
      setFormOpen(false);
      setText('');
      toast({
        title: 'Hvala! Prijava je poslana.',
        description: 'Odgovor ti stiže u Poruke.',
        action: { label: 'Otvori', onClick: () => navigate(`/poruke/${threadId}`) },
      });
    } catch (e) {
      error(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Ctx.Provider value={api}>
      {children}

      <GlassModal
        open={notice && !!support}
        onClose={() => setNotice(false)}
        title="FaliJedan je u test fazi"
        footer={
          <div className="flex flex-col gap-3 sm:flex-row">
            <GlassButton variant="secondary" className="sm:flex-1" onClick={() => setNotice(false)}>
              Razumijem
            </GlassButton>
            <GlassButton icon={Bug} className="sm:flex-[2]" onClick={() => open('bug')}>
              Prijavi bug ili ideju
            </GlassButton>
          </div>
        }
      >
        <div className="space-y-3 text-[15px] leading-relaxed text-fj-text-2">
          <span className="grid size-12 place-items-center rounded-[14px] border border-[rgba(32,196,90,0.3)] bg-[rgba(32,196,90,0.12)] text-fj-green" aria-hidden>
            <FlaskConical className="size-6" />
          </span>
          <p>Aplikacija je još uvijek u testnoj fazi — moguće je da nešto ne radi kako treba ili da se funkcije i izgled mijenjaju.</p>
          <p>
            Ako primijetiš grešku ili imaš ideju šta bi trebalo dodati ili poboljšati, <span className="font-bold text-white">javi nam</span> — svaka prijava pomaže
            da FaliJedan bude bolji.
          </p>
          <p className="text-[13px]">Prijavu uvijek možeš poslati iz menija: „Prijavi bug“ (na telefonu u Profilu).</p>
        </div>
      </GlassModal>

      <GlassModal
        open={formOpen && !!support}
        onClose={() => !busy && setFormOpen(false)}
        title="Prijavi bug ili ideju"
        description="Poruka ide direktno adminu, a odgovor stiže u Poruke."
        footer={
          <div className="flex gap-3">
            <GlassButton variant="secondary" className="flex-1" onClick={() => setFormOpen(false)} disabled={busy}>
              Odustani
            </GlassButton>
            <GlassButton icon={Send} className="flex-[2]" onClick={send} disabled={text.trim().length < 5} loading={busy}>
              Pošalji
            </GlassButton>
          </div>
        }
      >
        <div className="space-y-4">
          <GlassTabs
            ariaLabel="Vrsta prijave"
            value={kind}
            onChange={setKind}
            tabs={[
              {
                value: 'bug',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Bug className="size-4" aria-hidden /> Bug / greška
                  </span>
                ),
              },
              {
                value: 'idea',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Lightbulb className="size-4" aria-hidden /> Prijedlog
                  </span>
                ),
              },
            ]}
          />
          <GlassTextarea
            label={kind === 'bug' ? 'Šta se desilo?' : 'Šta bi dodao ili poboljšao?'}
            placeholder={kind === 'bug' ? 'Npr. kad kliknem „Prijavi se“ na terminu, ništa se ne desi…' : 'Npr. bilo bi super da mogu filtrirati termine po cijeni…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_TEXT}
            rows={5}
          />
          <p className="text-[13px] text-fj-text-2">Uz prijavu šaljemo stranicu na kojoj si bio/la i vrstu uređaja ({deviceInfo()}) — bez ličnih podataka.</p>
        </div>
      </GlassModal>
    </Ctx.Provider>
  );
}
