import { getChatDetails } from '../../../../../../lib/inbox-store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, context) {
  const params = await context.params;
  const chatJid = decodeURIComponent(params.chatJid);
  const details = await getChatDetails(chatJid);

  if (!details) {
    return Response.json(
      {
        ok: false,
        error: 'Conversa nao encontrada.',
      },
      { status: 404 },
    );
  }

  return Response.json({
    ok: true,
    ...details,
  });
}
