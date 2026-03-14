import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { getFileExtensionFromMimeType } from './media-storage.js';

const execFileAsync = promisify(execFile);

export const VOICE_NOTE_MIME_TYPE = 'audio/ogg; codecs=opus';

const normalizeMimeType = (mimeType) => mimeType?.toLowerCase().trim() ?? '';

export const needsAudioTranscode = (mimeType) =>
  !normalizeMimeType(mimeType).startsWith('audio/ogg');

export const transcodeToVoiceNote = async ({ buffer, mimeType }) => {
  if (!buffer?.length) {
    throw new Error('O audio nao pode ser vazio para transcodificacao.');
  }

  const workspace = await mkdtemp(path.join(tmpdir(), 'zap2-audio-'));
  const inputPath = path.join(
    workspace,
    `input.${getFileExtensionFromMimeType(mimeType)}`,
  );
  const outputPath = path.join(workspace, 'output.ogg');

  try {
    await writeFile(inputPath, buffer);

    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-c:a',
      'libopus',
      '-b:a',
      '32k',
      outputPath,
    ]);

    return {
      buffer: await readFile(outputPath),
      mimeType: VOICE_NOTE_MIME_TYPE,
    };
  } catch (error) {
    if (error instanceof Error && /ffmpeg/i.test(error.message)) {
      throw new Error(
        'FFmpeg nao esta disponivel para converter o audio gravado.',
      );
    }

    throw new Error('Falha ao converter o audio para o formato do WhatsApp.');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
};
