import { listChats } from '../../../../lib/inbox-store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const chats = await listChats();
  return Response.json({ chats });
}
