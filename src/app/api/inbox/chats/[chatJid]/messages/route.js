import { getChat, listMessages } from '../../../../../../lib/inbox-store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, context) {
  const params = await context.params;
  const chatJid = decodeURIComponent(params.chatJid);

  const [chat, messages] = await Promise.all([
    getChat(chatJid),
    listMessages({ chatJid }),
  ]);

  return Response.json({
    chat,
    messages,
  });
}
