import { access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { getMediaRoot } from '../../../../lib/media-storage.js';
import { getMediaById } from '../../../../lib/inbox-store.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, context) {
  const params = await context.params;
  const mediaId = Number(params.mediaId);

  if (!Number.isFinite(mediaId)) {
    return new Response('Media invalida.', { status: 400 });
  }

  const media = await getMediaById(mediaId);

  if (!media) {
    return new Response('Media nao encontrada.', { status: 404 });
  }

  const absolutePath = path.join(getMediaRoot(), media.storage_path);
  await access(absolutePath);

  const stream = createReadStream(absolutePath);

  return new Response(Readable.toWeb(stream), {
    headers: {
      'Content-Type': media.mime_type ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
