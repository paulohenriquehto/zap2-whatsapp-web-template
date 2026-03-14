export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    ok: true,
    service: 'zap2',
    timestamp: new Date().toISOString(),
  });
}
