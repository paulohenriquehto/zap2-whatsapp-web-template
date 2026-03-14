import { getWhatsAppGateway } from '../../../../whatsapp-singleton.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const encoder = new TextEncoder();

const encodeEvent = (event, payload) =>
  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);

export async function GET(request) {
  const gateway = getWhatsAppGateway();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (payload) => {
        if (!closed) {
          controller.enqueue(encodeEvent('inbox', payload));
        }
      };

      const unsubscribe = gateway.subscribeInbox(send);
      const heartbeat = setInterval(() => {
        if (!closed) {
          controller.enqueue(encodeEvent('heartbeat', { ts: Date.now() }));
        }
      }, 15000);

      const cleanup = () => {
        if (closed) {
          return;
        }

        closed = true;
        clearInterval(heartbeat);
        unsubscribe();

        try {
          controller.close();
        } catch {}
      };

      request.signal.addEventListener('abort', cleanup, { once: true });
      send({ scope: 'bootstrap', updatedAt: new Date().toISOString() });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
