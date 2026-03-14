import {
  extractMessageContent,
  getContentType,
  jidNormalizedUser,
  normalizeMessageContent,
} from 'baileys';

const safeLongToNumber = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  if (typeof value === 'object') {
    if (typeof value.toNumber === 'function') {
      const numeric = value.toNumber();
      return Number.isFinite(numeric) ? numeric : null;
    }

    if ('low' in value && typeof value.low === 'number') {
      return value.low;
    }
  }

  return null;
};

const normalizeDisplayValue = (value) => {
  if (typeof value !== 'string') {
    return value ?? null;
  }

  const normalized = value.replace(/[\s\u2800]+/gu, ' ').trim();
  return normalized || null;
};

export const normalizeJid = (jid) => {
  if (!jid) {
    return null;
  }

  try {
    return jidNormalizedUser(jid);
  } catch {
    return jid;
  }
};

export const getChatType = (jid) => {
  if (!jid) {
    return 'direct';
  }

  if (jid.endsWith('@g.us')) {
    return 'group';
  }

  if (jid.endsWith('@broadcast') || jid === 'status@broadcast') {
    return 'broadcast';
  }

  return 'direct';
};

export const isLidJid = (jid) => String(jid ?? '').endsWith('@lid');

export const getPhoneNumberFromJid = (jid) => {
  if (!jid) {
    return null;
  }

  const [localPart = '', server = ''] = jid.split('@');

  if (!localPart || ['g.us', 'broadcast', 'lid', 'newsletter'].includes(server)) {
    return null;
  }

  const digitsOnly = localPart.replace(/\D/g, '');

  return digitsOnly || localPart || null;
};

export const formatPhoneNumberForDisplay = (phoneNumber) => {
  const digits = String(phoneNumber ?? '').replace(/\D/g, '');

  if (!digits) {
    return null;
  }

  if (digits.startsWith('55') && digits.length === 13) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }

  if (digits.startsWith('55') && digits.length === 12) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  return digits;
};

export const getChatContactJid = (chatJid) => {
  if (getChatType(chatJid) !== 'direct') {
    return null;
  }

  return normalizeJid(chatJid);
};

const readTextFromContent = (content) => {
  if (!content) {
    return '';
  }

  if (content.conversation) {
    return content.conversation;
  }

  if (content.extendedTextMessage?.text) {
    return content.extendedTextMessage.text;
  }

  if (content.imageMessage?.caption) {
    return content.imageMessage.caption;
  }

  if (content.videoMessage?.caption) {
    return content.videoMessage.caption;
  }

  if (content.documentMessage?.caption) {
    return content.documentMessage.caption;
  }

  if (content.buttonsResponseMessage?.selectedDisplayText) {
    return content.buttonsResponseMessage.selectedDisplayText;
  }

  if (content.listResponseMessage?.title) {
    return content.listResponseMessage.title;
  }

  if (content.templateButtonReplyMessage?.selectedDisplayText) {
    return content.templateButtonReplyMessage.selectedDisplayText;
  }

  return '';
};

export const getMessageText = (message) => {
  const normalized = normalizeMessageContent(message?.message);
  const extracted = extractMessageContent(normalized);

  return (
    readTextFromContent(extracted) ||
    readTextFromContent(normalized) ||
    ''
  ).trim();
};

export const getMessageType = (message) => {
  const normalized = normalizeMessageContent(message?.message);
  return getContentType(normalized) ?? 'unknown';
};

export const getAudioPayload = (message) => {
  const normalized = normalizeMessageContent(message?.message);
  return normalized?.audioMessage ?? null;
};

export const isAudioMessage = (message) => Boolean(getAudioPayload(message));

export const getImagePayload = (message) => {
  const normalized = normalizeMessageContent(message?.message);
  return normalized?.imageMessage ?? null;
};

export const isImageMessage = (message) => Boolean(getImagePayload(message));

export const getMessageTimestamp = (message) => {
  const seconds = safeLongToNumber(message?.messageTimestamp);
  const epoch = seconds ? seconds * 1000 : Date.now();
  return new Date(epoch).toISOString();
};

export const getChatTitle = ({ chatJid, contact, fallbackName }) => {
  if (getChatType(chatJid) === 'group') {
    const normalizedFallbackName = normalizeDisplayValue(fallbackName);
    return normalizedFallbackName ?? chatJid ?? 'Grupo sem nome';
  }

  const contactName = normalizeDisplayValue(contact?.name);
  if (contactName) {
    return contactName;
  }

  const pushName = normalizeDisplayValue(contact?.notify);
  if (pushName) {
    return pushName;
  }

  const verifiedName = normalizeDisplayValue(contact?.verifiedName);
  if (verifiedName) {
    return verifiedName;
  }

  const normalizedFallbackName = normalizeDisplayValue(fallbackName);
  if (normalizedFallbackName) {
    return normalizedFallbackName;
  }

  if (isLidJid(chatJid)) {
    return 'Contato WhatsApp';
  }

  return (
    formatPhoneNumberForDisplay(getPhoneNumberFromJid(chatJid)) ??
    chatJid
  );
};

export const getMessageStatus = (message) => {
  if (message?.status) {
    return String(message.status).toLowerCase();
  }

  return message?.key?.fromMe ? 'sent' : 'received';
};

export const serializePayload = (value) =>
  JSON.parse(JSON.stringify(value ?? {}));
