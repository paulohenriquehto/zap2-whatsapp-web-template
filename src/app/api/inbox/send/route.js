import { getWhatsAppGateway } from '../../../../whatsapp-singleton.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const body = await request.json();
  const gateway = getWhatsAppGateway();

  const result = await gateway.sendTextMessage({
    chatJid: body?.chatJid,
    text: body?.text,
  });

  return Response.json({
    ok: true,
    messageId: result?.key?.id ?? null,
  });
}
