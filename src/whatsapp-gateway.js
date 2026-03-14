import { EventEmitter } from 'node:events';
import path from 'node:path';

import makeWASocket, {
  ALL_WA_PATCH_NAMES,
  downloadContentFromMessage,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from 'baileys';
import pino from 'pino';
import QRCode from 'qrcode';

import { ensureDatabase } from './lib/database.js';
import {
  applyMessageUpdate,
  buildChatTitle,
  hydrateHistorySet,
  persistMessage,
  removeChatLabelAssociation,
  sanitizeContactPhoneNumbers,
  updateContactPhoneNumber,
  updateProfilePhoto,
  upsertAudioMedia,
  upsertChat,
  upsertChatLabelAssociation,
  upsertImageMedia,
  upsertContact,
  upsertLabel,
  upsertSession,
} from './lib/inbox-store.js';
import {
  getAudioPayload,
  getChatContactJid,
  getImagePayload,
  isAudioMessage,
  isImageMessage,
  normalizeJid,
} from './lib/whatsapp-helpers.js';
import {
  buildMediaStoragePath,
  ensureMediaDirectory,
  getFileSize,
  writeMediaFile,
} from './lib/media-storage.js';
import {
  needsAudioTranscode,
  transcodeToVoiceNote,
  VOICE_NOTE_MIME_TYPE,
} from './lib/audio-transcoder.js';
import { streamToBuffer } from './lib/stream-helpers.js';

const buildTimestamp = () => new Date().toISOString();
const defaultSessionKey = 'primary';

export class WhatsAppGateway {
  constructor({ authFolder }) {
    this.authFolder = authFolder;
    this.events = new EventEmitter();
    this.logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
    this.socket = null;
    this.reconnectTimer = null;
    this.isStarting = false;
    this.profilePhotoCooldowns = new Map();
    this.state = {
      status: 'idle',
      headline: 'Preparando ambiente',
      detail:
        'Inicializando a sessao do WhatsApp para gerar o QR code de emparelhamento.',
      qrCodeDataUrl: null,
      accountLabel: null,
      updatedAt: buildTimestamp(),
    };
  }

  getSnapshot = () => ({ ...this.state });

  subscribe = (listener) => {
    this.events.on('state', listener);
    return () => this.events.off('state', listener);
  };

  subscribeInbox = (listener) => {
    this.events.on('inbox', listener);
    return () => this.events.off('inbox', listener);
  };

  notifyInboxChanged = (payload = {}) => {
    this.events.emit('inbox', {
      ...payload,
      updatedAt: buildTimestamp(),
    });
  };

  syncSessionState = async (status, extra = {}) => {
    await upsertSession({
      sessionKey: defaultSessionKey,
      status,
      phoneNumber: extra.phoneNumber ?? null,
      metadata: {
        accountLabel: this.state.accountLabel,
        ...extra,
      },
    });
  };

  setState = (partialState) => {
    this.state = {
      ...this.state,
      ...partialState,
      updatedAt: buildTimestamp(),
    };

    this.events.emit('state', this.getSnapshot());
  };

  scheduleReconnect = () => {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.start();
    }, 1500);
  };

  start = async () => {
    if (this.isStarting) {
      return;
    }

    this.isStarting = true;

    try {
      await ensureDatabase();
      await sanitizeContactPhoneNumbers();
      await ensureMediaDirectory();

      const { version } = await fetchLatestBaileysVersion();
      const { state, saveCreds } = await useMultiFileAuthState(
        path.resolve(this.authFolder),
      );

      this.socket = makeWASocket({
        auth: state,
        version,
        logger: this.logger,
        browser: ['Windows', 'Chrome', '10.0'],
        markOnlineOnConnect: false,
        syncFullHistory: true,
      });

      this.setState({
        status: 'connecting',
        headline: 'Conectando ao WhatsApp',
        detail:
          'Abrindo o canal com o WhatsApp Web. O QR code aparece assim que o pareamento for solicitado.',
      });

      await this.syncSessionState('connecting');

      this.socket.ev.on('creds.update', saveCreds);
      this.socket.ev.on('connection.update', (update) => {
        void this.handleConnectionUpdate(update);
      });
      this.socket.ev.on('messaging-history.set', (event) => {
        void this.handleHistorySet(event);
      });
      this.socket.ev.on('chats.upsert', (chats) => {
        void this.handleChatsUpsert(chats);
      });
      this.socket.ev.on('contacts.upsert', (contacts) => {
        void this.handleContactsUpsert(contacts);
      });
      this.socket.ev.on('messages.upsert', (event) => {
        void this.handleMessagesUpsert(event);
      });
      this.socket.ev.on('messages.update', (updates) => {
        void this.handleMessagesUpdate(updates);
      });
      this.socket.ev.on('groups.upsert', (groups) => {
        void this.handleGroupsUpsert(groups);
      });
      this.socket.ev.on('groups.update', (groups) => {
        void this.handleGroupsUpdate(groups);
      });
      this.socket.ev.on('chats.phoneNumberShare', (event) => {
        void this.handlePhoneNumberShare(event);
      });
      this.socket.ev.on('labels.edit', (label) => {
        void this.handleLabelEdit(label);
      });
      this.socket.ev.on('labels.association', (event) => {
        void this.handleLabelAssociation(event);
      });
    } catch (error) {
      this.setState({
        status: 'error',
        headline: 'Falha ao iniciar a sessao',
        detail:
          error instanceof Error
            ? error.message
            : 'Nao foi possivel iniciar a conexao com o WhatsApp.',
        qrCodeDataUrl: null,
      });

      await this.syncSessionState('error', {
        reason: error instanceof Error ? error.message : 'unknown',
      }).catch(() => {});

      this.scheduleReconnect();
    } finally {
      this.isStarting = false;
    }
  };

  handleConnectionUpdate = async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrCodeDataUrl = await QRCode.toDataURL(qr, {
        errorCorrectionLevel: 'M',
        margin: 1,
        scale: 8,
        color: {
          dark: '#123c35',
          light: '#f8fbf5',
        },
      });

      this.setState({
        status: 'qr_ready',
        headline: 'Escaneie para conectar',
        detail:
          'Abra o WhatsApp no celular, entre em Dispositivos conectados e leia o QR code desta tela.',
        qrCodeDataUrl,
      });

      await this.syncSessionState('qr_ready');
      return;
    }

    if (connection === 'open') {
      const accountLabel = this.socket?.user?.id?.split(':')[0] ?? null;

      this.setState({
        status: 'connected',
        headline: 'Dispositivo conectado',
        detail: accountLabel
          ? `Sessao ativa para o numero ${accountLabel}. O QR code nao e mais necessario.`
          : 'Sessao ativa. O QR code nao e mais necessario.',
        qrCodeDataUrl: null,
        accountLabel,
      });

      await this.syncSessionState('connected', {
        phoneNumber: accountLabel,
      });
      await this.syncAppState();
      await this.syncGroupMetadata();
      this.notifyInboxChanged({ scope: 'session' });
      return;
    }

    if (connection === 'close') {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode ??
        lastDisconnect?.error?.statusCode;

      if (statusCode === DisconnectReason.loggedOut) {
        this.setState({
          status: 'logged_out',
          headline: 'Sessao desconectada',
          detail:
            'O WhatsApp encerrou o vinculo desta sessao. Reinicie o servidor ou limpe a pasta .auth para gerar um novo pareamento.',
          qrCodeDataUrl: null,
          accountLabel: null,
        });

        await this.syncSessionState('logged_out');
        return;
      }

      this.setState({
        status: 'reconnecting',
        headline: 'Conexao interrompida',
        detail:
          'A sessao caiu e o sistema esta tentando restabelecer a conexao para gerar um novo QR code.',
        qrCodeDataUrl: null,
        accountLabel: null,
      });

      await this.syncSessionState('reconnecting');
      this.scheduleReconnect();
    }
  };

  handleHistorySet = async (event) => {
    await hydrateHistorySet({
      sessionKey: defaultSessionKey,
      chats: event?.chats ?? [],
      contacts: event?.contacts ?? [],
      messages: event?.messages ?? [],
    });

    for (const message of event?.messages ?? []) {
      if (isAudioMessage(message) || isImageMessage(message)) {
        const persisted = await persistMessage({
          sessionKey: defaultSessionKey,
          message,
          upsertType: 'append',
        });

        await this.persistMediaAttachment(message, persisted);
      }
    }

    for (const contact of event?.contacts ?? []) {
      void this.refreshProfilePhoto(contact?.id ?? contact?.jid);
    }

    this.notifyInboxChanged({ scope: 'history' });
  };

  handleChatsUpsert = async (chats) => {
    for (const chat of chats) {
      const chatJid = normalizeJid(chat?.id);

      if (!chatJid) {
        continue;
      }

      await upsertChat({
        sessionKey: defaultSessionKey,
        chatJid,
        title: chat?.name ?? chat?.subject ?? null,
        unreadCount: chat?.unreadCount ?? null,
        archived: Boolean(chat?.archived),
        pinned: Boolean(chat?.pinned),
        metadata: chat,
      });

      void this.refreshProfilePhoto(chatJid);
    }

    this.notifyInboxChanged({ scope: 'chats' });
  };

  handleContactsUpsert = async (contacts) => {
    for (const contact of contacts) {
      const contactJid = await upsertContact(contact);

      if (!contactJid) {
        continue;
      }

      await upsertChat({
        sessionKey: defaultSessionKey,
        chatJid: contactJid,
        title: buildChatTitle({
          chatJid: contactJid,
          contact,
          fallbackName: null,
        }),
      });

      void this.refreshProfilePhoto(contactJid);
    }

    this.notifyInboxChanged({ scope: 'contacts' });
  };

  handleGroupsUpsert = async (groups) => {
    for (const group of groups ?? []) {
      await upsertChat({
        sessionKey: defaultSessionKey,
        chatJid: group?.id,
        title: group?.subject ?? null,
        metadata: group,
      });

      void this.refreshProfilePhoto(group?.id);
    }

    this.notifyInboxChanged({ scope: 'groups.upsert' });
  };

  handleGroupsUpdate = async (groups) => {
    for (const group of groups ?? []) {
      const groupJid = normalizeJid(group?.id);

      if (!groupJid) {
        continue;
      }

      await upsertChat({
        sessionKey: defaultSessionKey,
        chatJid: groupJid,
        title: group?.subject ?? null,
        metadata: group,
      });
    }

    this.notifyInboxChanged({ scope: 'groups.update' });
  };

  handlePhoneNumberShare = async ({ lid, jid }) => {
    const normalizedLid = normalizeJid(lid);

    if (!normalizedLid || !jid) {
      return;
    }

    await updateContactPhoneNumber({
      jid: normalizedLid,
      phoneNumber: jid,
      metadata: {
        sharedPhoneJid: jid,
      },
    });

    this.notifyInboxChanged({ scope: 'contacts.phone-share' });
  };

  handleLabelEdit = async (label) => {
    await upsertLabel(label);
    this.notifyInboxChanged({ scope: 'labels.edit', labelId: label?.id ?? null });
  };

  handleLabelAssociation = async ({ type, association }) => {
    if (association?.type !== 'label_jid') {
      return;
    }

    if (type === 'add') {
      await upsertChatLabelAssociation({
        chatJid: association.chatId,
        labelId: association.labelId,
        sessionKey: defaultSessionKey,
      });
    }

    if (type === 'remove') {
      await removeChatLabelAssociation({
        chatJid: association.chatId,
        labelId: association.labelId,
      });
    }

    this.notifyInboxChanged({
      scope: 'labels.association',
      action: type,
      chatJid: association.chatId,
      labelId: association.labelId,
    });
  };

  handleMessagesUpsert = async (event) => {
    for (const message of event?.messages ?? []) {
      const result = await persistMessage({
        sessionKey: defaultSessionKey,
        message,
        upsertType: event?.type ?? 'append',
      });

      await this.persistMediaAttachment(message, result);

      if (result?.chatJid) {
        const contactJid = getChatContactJid(result.chatJid) ?? result.chatJid;
        void this.refreshProfilePhoto(contactJid);
      }

      if (result?.participantContactJid) {
        void this.refreshProfilePhoto(result.participantContactJid);
      }
    }

    this.notifyInboxChanged({ scope: 'messages' });
  };

  handleMessagesUpdate = async (updates) => {
    for (const update of updates) {
      await applyMessageUpdate(update);
    }

    this.notifyInboxChanged({ scope: 'messages.update' });
  };

  syncGroupMetadata = async () => {
    if (!this.socket) {
      return;
    }

    const groups = await this.socket.groupFetchAllParticipating();

    for (const group of Object.values(groups ?? {})) {
      await upsertChat({
        sessionKey: defaultSessionKey,
        chatJid: group?.id,
        title: group?.subject ?? null,
        metadata: group,
      });

      void this.refreshProfilePhoto(group?.id);
    }
  };

  syncAppState = async () => {
    if (!this.socket) {
      return;
    }

    try {
      await this.socket.resyncAppState(ALL_WA_PATCH_NAMES, true);
    } catch (error) {
      this.logger.debug(
        {
          err: error instanceof Error ? error.message : error,
        },
        'failed to resync whatsapp app state',
      );
    }
  };

  persistMediaAttachment = async (message, persistedMessage) => {
    if (!this.socket || !persistedMessage?.messagePk) {
      return;
    }

    const chatJid = normalizeJid(message?.key?.remoteJid);
    const messageId = message?.key?.id;
    const audioPayload = getAudioPayload(message);
    const imagePayload = getImagePayload(message);
    const payload = audioPayload ?? imagePayload;
    const mediaKind = audioPayload ? 'audio' : imagePayload ? 'image' : null;

    if (!chatJid || !messageId || !payload?.mediaKey || !mediaKind) {
      return;
    }

    try {
      const mediaStream = await downloadContentFromMessage(payload, mediaKind);
      const mediaBuffer = await streamToBuffer(mediaStream);
      const { relativePath, absolutePath } = buildMediaStoragePath({
        chatJid,
        messageId,
        mimeType: payload.mimetype,
      });

      await writeMediaFile({
        absolutePath,
        buffer: mediaBuffer,
      });

      if (mediaKind === 'audio') {
        await upsertAudioMedia({
          messagePk: persistedMessage.messagePk,
          chatJid,
          messageId,
          mimeType: payload.mimetype ?? 'audio/ogg',
          fileSizeBytes: await getFileSize(absolutePath),
          durationSeconds: payload.seconds ?? null,
          storagePath: relativePath,
        });
      } else if (mediaKind === 'image') {
        await upsertImageMedia({
          messagePk: persistedMessage.messagePk,
          chatJid,
          messageId,
          mimeType: payload.mimetype ?? 'image/jpeg',
          fileSizeBytes: await getFileSize(absolutePath),
          storagePath: relativePath,
        });
      }

      this.notifyInboxChanged({ scope: 'media', chatJid, messageId, mediaKind });
    } catch (error) {
      this.logger.debug(
        {
          chatJid,
          messageId,
          mediaKind,
          err: error instanceof Error ? error.message : error,
        },
        'failed to persist media attachment',
      );
    }
  };

  refreshProfilePhoto = async (jid) => {
    const normalizedJid = normalizeJid(jid);

    if (!this.socket || !normalizedJid) {
      return;
    }

    const lastFetchAt = this.profilePhotoCooldowns.get(normalizedJid);

    if (lastFetchAt && Date.now() - lastFetchAt < 5 * 60 * 1000) {
      return;
    }

    this.profilePhotoCooldowns.set(normalizedJid, Date.now());

    try {
      const profilePhotoUrl = await this.socket.profilePictureUrl(
        normalizedJid,
        'image',
      );

      if (profilePhotoUrl) {
        await updateProfilePhoto({
          jid: normalizedJid,
          url: profilePhotoUrl,
        });
        this.notifyInboxChanged({ scope: 'avatars', jid: normalizedJid });
      }
    } catch {}
  };

  assertReadyToSend = (chatJid) => {
    const normalizedChatJid = normalizeJid(chatJid);

    if (!this.socket || this.state.status !== 'connected') {
      throw new Error('A sessao do WhatsApp nao esta conectada.');
    }

    if (!normalizedChatJid) {
      throw new Error('Conversa invalida para envio.');
    }

    return normalizedChatJid;
  };

  persistOutboundAudio = async ({
    chatJid,
    messageId,
    messagePk,
    buffer,
    mimeType,
    durationSeconds,
  }) => {
    if (!messagePk || !messageId || !buffer?.length) {
      return;
    }

    const { relativePath, absolutePath } = buildMediaStoragePath({
      chatJid,
      messageId,
      mimeType,
    });

    await writeMediaFile({
      absolutePath,
      buffer,
    });

    await upsertAudioMedia({
      messagePk,
      chatJid,
      messageId,
      mimeType,
      fileSizeBytes: await getFileSize(absolutePath),
      durationSeconds,
      storagePath: relativePath,
    });
  };

  sendTextMessage = async ({ chatJid, text }) => {
    const normalizedChatJid = this.assertReadyToSend(chatJid);
    const trimmedText = text?.trim();

    if (!trimmedText) {
      throw new Error('A mensagem nao pode ser vazia.');
    }

    const response = await this.socket.sendMessage(normalizedChatJid, {
      text: trimmedText,
    });

    if (response) {
      await persistMessage({
        sessionKey: defaultSessionKey,
        message: response,
        upsertType: 'append',
      });
    }

    this.notifyInboxChanged({ scope: 'send', chatJid: normalizedChatJid });

    return response;
  };

  sendAudioMessage = async ({
    chatJid,
    buffer,
    mimeType = 'audio/webm',
    durationSeconds = null,
  }) => {
    const normalizedChatJid = this.assertReadyToSend(chatJid);

    if (!buffer?.length) {
      throw new Error('O audio nao pode ser vazio.');
    }

    const preparedAudio = needsAudioTranscode(mimeType)
      ? await transcodeToVoiceNote({ buffer, mimeType })
      : {
          buffer,
          mimeType: VOICE_NOTE_MIME_TYPE,
        };

    const response = await this.socket.sendMessage(normalizedChatJid, {
      audio: preparedAudio.buffer,
      mimetype: preparedAudio.mimeType,
      ptt: true,
    });

    if (response) {
      const persisted = await persistMessage({
        sessionKey: defaultSessionKey,
        message: response,
        upsertType: 'append',
      });

      await this.persistOutboundAudio({
        chatJid: normalizedChatJid,
        messageId: response?.key?.id ?? null,
        messagePk: persisted?.messagePk ?? null,
        buffer: preparedAudio.buffer,
        mimeType: preparedAudio.mimeType,
        durationSeconds:
          typeof durationSeconds === 'number' && Number.isFinite(durationSeconds)
            ? Math.max(0, Math.round(durationSeconds))
            : null,
      });
    }

    this.notifyInboxChanged({
      scope: 'send.audio',
      chatJid: normalizedChatJid,
    });

    return response;
  };

  addChatLabel = async ({ chatJid, labelId }) => {
    const normalizedChatJid = this.assertReadyToSend(chatJid);
    const normalizedLabelId = String(labelId ?? '').trim();

    if (!normalizedLabelId) {
      throw new Error('Tag invalida para este chat.');
    }

    await this.socket.addChatLabel(normalizedChatJid, normalizedLabelId);
    await upsertChatLabelAssociation({
      chatJid: normalizedChatJid,
      labelId: normalizedLabelId,
      sessionKey: defaultSessionKey,
    });

    this.notifyInboxChanged({
      scope: 'labels.chat.add',
      chatJid: normalizedChatJid,
      labelId: normalizedLabelId,
    });
  };

  removeChatLabel = async ({ chatJid, labelId }) => {
    const normalizedChatJid = this.assertReadyToSend(chatJid);
    const normalizedLabelId = String(labelId ?? '').trim();

    if (!normalizedLabelId) {
      throw new Error('Tag invalida para este chat.');
    }

    await this.socket.removeChatLabel(normalizedChatJid, normalizedLabelId);
    await removeChatLabelAssociation({
      chatJid: normalizedChatJid,
      labelId: normalizedLabelId,
    });

    this.notifyInboxChanged({
      scope: 'labels.chat.remove',
      chatJid: normalizedChatJid,
      labelId: normalizedLabelId,
    });
  };
}
