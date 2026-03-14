import { getWhatsAppGateway } from '../../../../../../whatsapp-singleton.js';
import {
  createLocalLabel,
  getLabelById,
  removeChatLabelAssociation,
  upsertChatLabelAssociation,
} from '../../../../../../lib/inbox-store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, context) {
  try {
    const params = await context.params;
    const chatJid = decodeURIComponent(params.chatJid);
    const body = await request.json();
    const action = String(body?.action ?? '').trim();

    if (action === 'create') {
      const name = String(body?.name ?? '').trim();

      if (!name) {
        return Response.json(
          {
            ok: false,
            error: 'Informe o nome da etiqueta.',
          },
          { status: 400 },
        );
      }

      const label = await createLocalLabel({
        name,
      });

      if (body?.assignToChat !== false) {
        await upsertChatLabelAssociation({
          chatJid,
          labelId: label.id,
          labelSource: label.source,
          sessionKey: label.sessionKey,
        });
      }

      return Response.json({
        ok: true,
        action,
        label,
      });
    }

    const labelId = String(body?.labelId ?? '').trim();

    if (!labelId) {
      return Response.json(
        {
          ok: false,
          error: 'Etiqueta invalida.',
        },
        { status: 400 },
      );
    }

    const label = await getLabelById({ labelId });

    if (!label || label.deleted) {
      return Response.json(
        {
          ok: false,
          error: 'Etiqueta nao encontrada.',
        },
        { status: 404 },
      );
    }

    if (action === 'add') {
      if (label.source === 'local') {
        await upsertChatLabelAssociation({
          chatJid,
          labelId: label.id,
          labelSource: label.source,
          sessionKey: label.sessionKey,
        });
      } else {
        const gateway = getWhatsAppGateway();
        await gateway.addChatLabel({ chatJid, labelId: label.id });
      }
    } else if (action === 'remove') {
      if (label.source === 'local') {
        await removeChatLabelAssociation({
          chatJid,
          labelId: label.id,
        });
      } else {
        const gateway = getWhatsAppGateway();
        await gateway.removeChatLabel({ chatJid, labelId: label.id });
      }
    } else {
      return Response.json(
        {
          ok: false,
          error: 'Acao de etiqueta invalida.',
        },
        { status: 400 },
      );
    }

    return Response.json({
      ok: true,
      action,
      label,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Falha ao atualizar a etiqueta do chat.',
      },
      { status: 500 },
    );
  }
}
