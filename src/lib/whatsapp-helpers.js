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

export const getPhoneNumberFromJid = (jid) => {
  if (!jid) {
    return null;
  }

  return jid.split('@')[0] ?? null;
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

export const getMessageTimestamp = (message) => {
  const seconds = safeLongToNumber(message?.messageTimestamp);
  const epoch = seconds ? seconds * 1000 : Date.now();
  return new Date(epoch).toISOString();
};

export const getChatTitle = ({ chatJid, contact, fallbackName }) => {
  if (contact?.name) {
    return contact.name;
  }

  if (contact?.notify) {
    return contact.notify;
  }

  if (contact?.verifiedName) {
    return contact.verifiedName;
  }

  if (fallbackName) {
    return fallbackName;
  }

  return getPhoneNumberFromJid(chatJid) ?? chatJid;
};

export const getMessageStatus = (message) => {
  if (message?.status) {
    return String(message.status).toLowerCase();
  }

  return message?.key?.fromMe ? 'sent' : 'received';
};

export const serializePayload = (value) =>
  JSON.parse(JSON.stringify(value ?? {}));
