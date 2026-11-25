/**
 * Posao koji se nastavlja nakon što je odgovor poslan (npr. demo igrači odgovaraju za par sekundi).
 * Na Vercelu ga prijavljujemo preko waitUntil (isti mehanizam koji koristi @vercel/functions),
 * da funkcija ne bude ugašena prije kraja; na običnom serveru se samo izvršava.
 */
const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

export function background(task: Promise<unknown>) {
  const safe = task.catch((e) => console.warn('pozadinski posao:', e));
  const ctx = (globalThis as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined } | undefined>)[REQUEST_CONTEXT]?.get?.();
  ctx?.waitUntil?.(safe);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
