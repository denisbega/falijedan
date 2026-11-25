/**
 * Realtime preko Server-Sent Events (/api/events).
 * Na svaku izmjenu stanja klijenti dobiju "sync" i povuku svježe podatke (uz ETag → 304 ako nema promjena za njih).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

interface Client {
  res: ServerResponse;
  userId: string;
}
const clients = new Set<Client>();

export function attachClient(req: IncomingMessage, res: ServerResponse, userId: string) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const client: Client = { res, userId };
  clients.add(client);
  req.on('close', () => clients.delete(client));
}

function send(c: Client, event: string, data: unknown) {
  c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function broadcastSync(rev: number) {
  for (const c of clients) send(c, 'sync', { rev });
}

export function sendTyping(threadId: string, userId: string, on: boolean, memberIds: string[]) {
  for (const c of clients) if (memberIds.includes(c.userId) && c.userId !== userId) send(c, 'typing', { threadId, userId, on });
}

export const connectedCount = () => clients.size;

setInterval(() => {
  for (const c of clients) c.res.write(': ping\n\n');
}, 25000).unref();
