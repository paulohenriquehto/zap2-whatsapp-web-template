import { getWhatsAppGateway } from '../../../../whatsapp-singleton.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const gateway = getWhatsAppGateway();
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const audioFile = formData.get('audio');
      const chatJid = String(formData.get('chatJid') ?? '');
      const durationValue = Number(formData.get('durationSeconds'));

      if (!(audioFile instanceof File)) {
        return Response.json(
          {
            ok: false,
            error: 'Arquivo de audio invalido.',
          },
          { status: 400 },
        );
      }

      const result = await gateway.sendAudioMessage({
        chatJid,
        buffer: Buffer.from(await audioFile.arrayBuffer()),
        mimeType: audioFile.type || 'audio/webm',
        durationSeconds: Number.isFinite(durationValue)
          ? Math.max(0, Math.round(durationValue))
          : null,
      });

      return Response.json({
        ok: true,
        kind: 'audio',
        messageId: result?.key?.id ?? null,
      });
    }

    const body = await request.json();

    const result = await gateway.sendTextMessage({
      chatJid: body?.chatJid,
      text: body?.text,
    });

    return Response.json({
      ok: true,
      kind: 'text',
      messageId: result?.key?.id ?? null,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Falha ao enviar a mensagem.',
      },
      { status: 500 },
    );
  }
}
