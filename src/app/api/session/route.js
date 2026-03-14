import { getWhatsAppGateway } from '../../../whatsapp-singleton.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const gateway = getWhatsAppGateway();
  return Response.json(gateway.getSnapshot());
}
