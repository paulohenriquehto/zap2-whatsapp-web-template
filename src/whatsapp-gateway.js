import { EventEmitter } from 'node:events';
import path from 'node:path';

import makeWASocket, {
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
  upsertAudioMedia,
  upsertImageMedia,
  updateProfilePhoto,
  upsertChat,
  upsertContact,
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
import { streamToBuffer } from './lib/stream-helpers.js';

const buildTimestamp = () => new Date().toISOString();
const defaultSessionKey = 'primary';

export class WhatsAppGateway {
  constructor({ authFolder }) {
    this.authFolder = authFolder;
    this.events = new EventEmitter();
    this.logger = pino({ level: 'silent' });
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
        title: chat?.name ?? null,
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
    }

    this.notifyInboxChanged({ scope: 'messages' });
  };

  handleMessagesUpdate = async (updates) => {
    for (const update of updates) {
      await applyMessageUpdate(update);
    }

    this.notifyInboxChanged({ scope: 'messages.update' });
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

  sendTextMessage = async ({ chatJid, text }) => {
    const normalizedChatJid = normalizeJid(chatJid);
    const trimmedText = text?.trim();

    if (!this.socket || this.state.status !== 'connected') {
      throw new Error('A sessao do WhatsApp nao esta conectada.');
    }

    if (!normalizedChatJid) {
      throw new Error('Conversa invalida para envio.');
    }

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
}
