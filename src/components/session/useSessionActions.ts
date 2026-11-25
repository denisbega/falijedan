import { useCallback } from 'react';
import { joinSession, leaveSession } from '../../lib/api';
import { relativeDay, timeHM } from '../../lib/format';
import type { SessionView } from '../../lib/types';
import { useToast } from '../ui';

export function useSessionActions() {
  const { toast, error } = useToast();

  const leave = useCallback(
    async (s: SessionView, silent = false) => {
      try {
        await leaveSession(s.id);
        if (!silent) toast({ tone: 'info', title: 'Odjavljen si sa termina', description: 'Mjesto je oslobođeno za drugog igrača.' });
      } catch (e) {
        error(e);
      }
    },
    [toast, error],
  );

  const join = useCallback(
    async (s: SessionView, waitlist = false) => {
      try {
        const r = await joinSession(s.id, { waitlist });
        if (r.status === 'waitlist') {
          toast({ title: 'Na listi čekanja si', description: 'Čim se oslobodi mjesto, prebacujemo te u ekipu.' });
        } else {
          toast({
            title: 'Prijavljen si!',
            description: `Vidimo se ${relativeDay(s.startsAt).toLowerCase()} u ${timeHM(s.startsAt)} — ${s.venueName}.`,
            action: { label: 'Poništi', onClick: () => void leave(s, true) },
          });
        }
        return true;
      } catch (e) {
        error(e);
        return false;
      }
    },
    [toast, error, leave],
  );

  return { join, leave };
}
