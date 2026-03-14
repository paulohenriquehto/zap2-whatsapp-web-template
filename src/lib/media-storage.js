import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const mediaRoot = path.resolve(process.cwd(), 'storage', 'media');

const extensionByMimeType = {
  'audio/ogg': 'ogg',
  'audio/ogg; codecs=opus': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const sanitizeSegment = (value) =>
  String(value ?? 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');

export const ensureMediaDirectory = async () => {
  await mkdir(mediaRoot, { recursive: true });
  return mediaRoot;
};

export const getMediaRoot = () => mediaRoot;

export const getFileExtensionFromMimeType = (mimeType) => {
  if (!mimeType) {
    return 'bin';
  }

  return extensionByMimeType[mimeType.toLowerCase()] ?? 'bin';
};

export const buildMediaStoragePath = ({ chatJid, messageId, mimeType }) => {
  const ext = getFileExtensionFromMimeType(mimeType);
  const chatFolder = sanitizeSegment(chatJid);
  const fileName = `${sanitizeSegment(messageId)}.${ext}`;

  return {
    relativePath: path.join(chatFolder, fileName),
    absolutePath: path.join(mediaRoot, chatFolder, fileName),
  };
};

export const writeMediaFile = async ({ absolutePath, buffer }) => {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);
};

export const getFileSize = async (absolutePath) => {
  const file = await stat(absolutePath);
  return file.size;
};
