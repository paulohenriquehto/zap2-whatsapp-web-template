import {
  getChatContactJid,
  getChatTitle,
  getChatType,
  getMessageStatus,
  getMessageText,
  getMessageTimestamp,
  getMessageType,
  getPhoneNumberFromJid,
  normalizeJid,
  serializePayload,
} from './whatsapp-helpers.js';
import { query, transaction } from './database.js';

const defaultSessionKey = 'primary';

const mapChatRow = (row) => ({
  chatJid: row.chat_jid,
  sessionKey: row.session_key,
  contactJid: row.contact_jid,
  chatType: row.chat_type,
  title: row.title,
  avatarUrl: row.avatar_url ?? row.profile_photo_url ?? null,
  lastMessageId: row.last_message_id,
  lastMessagePreview: row.last_message_preview ?? '',
  lastMessageAt: row.last_message_at,
  unreadCount: row.unread_count ?? 0,
  archived: row.archived,
  pinned: row.pinned,
});

const mapMessageRow = (row) => ({
  id: row.id,
  chatJid: row.chat_jid,
  messageId: row.message_id,
  senderJid: row.sender_jid,
  recipientJid: row.recipient_jid,
  participantJid: row.participant_jid,
  fromMe: row.from_me,
  messageType: row.message_type,
  textBody: row.text_body ?? '',
  quotedMessageId: row.quoted_message_id,
  status: row.status,
  sentAt: row.sent_at,
  media: row.media_id
    ? {
        id: row.media_id,
        kind: row.media_kind,
        mimeType: row.mime_type,
        fileSizeBytes: row.file_size_bytes,
        durationSeconds: row.duration_seconds,
        url: `/api/media/${row.media_id}`,
      }
    : null,
});

const buildLastMessagePreview = ({ textBody, messageType }) => {
  if (textBody) {
    return textBody;
  }

  if (messageType === 'imageMessage') {
    return 'Imagem';
  }

  if (messageType === 'audioMessage') {
    return 'Audio';
  }

  return '';
};

export const upsertSession = async ({
  sessionKey = defaultSessionKey,
  phoneNumber = null,
  status,
  metadata = {},
}) => {
  await query(
    `
      INSERT INTO wa_sessions (
        session_key,
        phone_number,
        status,
        connected_at,
        last_seen_at,
        metadata,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        CASE WHEN $3 = 'connected' THEN now() ELSE NULL END,
        now(),
        $4::jsonb,
        now()
      )
      ON CONFLICT (session_key) DO UPDATE SET
        phone_number = COALESCE(EXCLUDED.phone_number, wa_sessions.phone_number),
        status = EXCLUDED.status,
        connected_at = CASE
          WHEN EXCLUDED.status = 'connected' THEN now()
          ELSE wa_sessions.connected_at
        END,
        last_seen_at = now(),
        metadata = wa_sessions.metadata || EXCLUDED.metadata,
        updated_at = now()
    `,
    [sessionKey, phoneNumber, status, JSON.stringify(metadata)],
  );
};

export const upsertContact = async (contact) => {
  const contactJid = normalizeJid(contact?.id ?? contact?.jid);

  if (!contactJid) {
    return null;
  }

  await query(
    `
      INSERT INTO wa_contacts (
        contact_jid,
        phone_number,
        display_name,
        push_name,
        verified_name,
        profile_photo_url,
        profile_photo_fetched_at,
        metadata,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 IS NULL THEN NULL ELSE now() END, $7::jsonb, now())
      ON CONFLICT (contact_jid) DO UPDATE SET
        phone_number = COALESCE(EXCLUDED.phone_number, wa_contacts.phone_number),
        display_name = COALESCE(EXCLUDED.display_name, wa_contacts.display_name),
        push_name = COALESCE(EXCLUDED.push_name, wa_contacts.push_name),
        verified_name = COALESCE(EXCLUDED.verified_name, wa_contacts.verified_name),
        profile_photo_url = COALESCE(EXCLUDED.profile_photo_url, wa_contacts.profile_photo_url),
        profile_photo_fetched_at = CASE
          WHEN EXCLUDED.profile_photo_url IS NULL THEN wa_contacts.profile_photo_fetched_at
          ELSE now()
        END,
        metadata = wa_contacts.metadata || EXCLUDED.metadata,
        updated_at = now()
    `,
    [
      contactJid,
      getPhoneNumberFromJid(contactJid),
      contact?.name ?? null,
      contact?.notify ?? null,
      contact?.verifiedName ?? null,
      contact?.imgUrl ?? null,
      JSON.stringify(serializePayload(contact)),
    ],
  );

  return contactJid;
};

export const updateProfilePhoto = async ({ jid, url }) => {
  const normalizedJid = normalizeJid(jid);

  if (!normalizedJid) {
    return;
  }

  await query(
    `
      UPDATE wa_contacts
      SET profile_photo_url = $2,
          profile_photo_fetched_at = now(),
          updated_at = now()
      WHERE contact_jid = $1
    `,
    [normalizedJid, url],
  );

  await query(
    `
      UPDATE wa_chats
      SET avatar_url = $2,
          updated_at = now()
      WHERE chat_jid = $1 OR contact_jid = $1
    `,
    [normalizedJid, url],
  );
};

export const upsertChat = async ({
  sessionKey = defaultSessionKey,
  chatJid,
  title = null,
  avatarUrl = null,
  unreadCount = null,
  archived = false,
  pinned = false,
  metadata = {},
}) => {
  const normalizedChatJid = normalizeJid(chatJid);

  if (!normalizedChatJid) {
    return null;
  }

  const contactJid = getChatContactJid(normalizedChatJid);

  await query(
    `
      INSERT INTO wa_chats (
        chat_jid,
        session_key,
        contact_jid,
        chat_type,
        title,
        avatar_url,
        unread_count,
        archived,
        pinned,
        metadata,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 0), $8, $9, $10::jsonb, now())
      ON CONFLICT (chat_jid) DO UPDATE SET
        session_key = EXCLUDED.session_key,
        contact_jid = COALESCE(EXCLUDED.contact_jid, wa_chats.contact_jid),
        chat_type = EXCLUDED.chat_type,
        title = COALESCE(EXCLUDED.title, wa_chats.title),
        avatar_url = COALESCE(EXCLUDED.avatar_url, wa_chats.avatar_url),
        unread_count = COALESCE($7, wa_chats.unread_count),
        archived = EXCLUDED.archived,
        pinned = EXCLUDED.pinned,
        metadata = wa_chats.metadata || EXCLUDED.metadata,
        updated_at = now()
    `,
    [
      normalizedChatJid,
      sessionKey,
      contactJid,
      getChatType(normalizedChatJid),
      title,
      avatarUrl,
      unreadCount,
      archived,
      pinned,
      JSON.stringify(serializePayload(metadata)),
    ],
  );

  return normalizedChatJid;
};

export const persistMessage = async ({
  sessionKey = defaultSessionKey,
  message,
  upsertType = 'append',
}) => {
  const chatJid = normalizeJid(message?.key?.remoteJid);
  const messageId = message?.key?.id ?? null;

  if (!chatJid || !messageId) {
    return null;
  }

  const participantJid = normalizeJid(message?.key?.participant);
  const fromMe = Boolean(message?.key?.fromMe);
  const senderJid = fromMe
    ? null
    : participantJid ?? normalizeJid(message?.key?.remoteJid);
  const recipientJid = fromMe ? normalizeJid(message?.key?.remoteJid) : null;
  const textBody = getMessageText(message);
  const messageType = getMessageType(message);
  const lastMessagePreview = buildLastMessagePreview({ textBody, messageType });
  const sentAt = getMessageTimestamp(message);
  const status = getMessageStatus(message);
  const contactJid = getChatContactJid(chatJid);

  const persisted = await transaction(async (client) => {
    if (contactJid) {
      await client.query(
        `
          INSERT INTO wa_contacts (
            contact_jid,
            phone_number,
            updated_at
          )
          VALUES ($1, $2, now())
          ON CONFLICT (contact_jid) DO UPDATE SET
            phone_number = COALESCE(EXCLUDED.phone_number, wa_contacts.phone_number),
            updated_at = now()
        `,
        [contactJid, getPhoneNumberFromJid(contactJid)],
      );
    }

    await client.query(
      `
        INSERT INTO wa_chats (
          chat_jid,
          session_key,
          contact_jid,
          chat_type,
          title,
          unread_count,
          updated_at
        )
        VALUES ($1, $2, $3, $4, NULL, 0, now())
        ON CONFLICT (chat_jid) DO UPDATE SET
          session_key = EXCLUDED.session_key,
          contact_jid = COALESCE(EXCLUDED.contact_jid, wa_chats.contact_jid),
          chat_type = EXCLUDED.chat_type,
          updated_at = now()
      `,
      [chatJid, sessionKey, contactJid, getChatType(chatJid)],
    );

    const insertResult = await client.query(
      `
        INSERT INTO wa_messages (
          chat_jid,
          session_key,
          message_id,
          sender_jid,
          recipient_jid,
          participant_jid,
          from_me,
          message_type,
          text_body,
          quoted_message_id,
          status,
          sent_at,
          raw_payload,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, now()
        )
        ON CONFLICT (chat_jid, message_id) DO UPDATE SET
          sender_jid = COALESCE(EXCLUDED.sender_jid, wa_messages.sender_jid),
          recipient_jid = COALESCE(EXCLUDED.recipient_jid, wa_messages.recipient_jid),
          participant_jid = COALESCE(EXCLUDED.participant_jid, wa_messages.participant_jid),
          from_me = EXCLUDED.from_me,
          message_type = COALESCE(EXCLUDED.message_type, wa_messages.message_type),
          text_body = CASE
            WHEN COALESCE(EXCLUDED.text_body, '') = '' THEN wa_messages.text_body
            ELSE EXCLUDED.text_body
          END,
          quoted_message_id = COALESCE(EXCLUDED.quoted_message_id, wa_messages.quoted_message_id),
          status = COALESCE(EXCLUDED.status, wa_messages.status),
          sent_at = EXCLUDED.sent_at,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = now()
        RETURNING id
      `,
      [
        chatJid,
        sessionKey,
        messageId,
        senderJid,
        recipientJid,
        participantJid,
        fromMe,
        messageType,
        textBody,
        message?.message?.extendedTextMessage?.contextInfo?.stanzaId ?? null,
        status,
        sentAt,
        JSON.stringify(serializePayload(message)),
      ],
    );

    await client.query(
      `
        UPDATE wa_chats
        SET
          last_message_id = $2,
          last_message_preview = $3,
          last_message_at = $4,
          unread_count = CASE
            WHEN $5 THEN unread_count + 1
            ELSE unread_count
          END,
          updated_at = now()
        WHERE chat_jid = $1
      `,
      [
        chatJid,
        messageId,
        lastMessagePreview,
        sentAt,
        upsertType === 'notify' && !fromMe,
      ],
    );

    return {
      messagePk: insertResult.rows[0]?.id ?? null,
      chatJid,
      messageId,
    };
  });

  return persisted;
};

export const applyMessageUpdate = async ({ key, update }) => {
  const chatJid = normalizeJid(key?.remoteJid);
  const messageId = key?.id ?? null;

  if (!chatJid || !messageId) {
    return;
  }

  const status = update?.status ? String(update.status).toLowerCase() : null;
  const textBody = getMessageText(update);

  await query(
    `
      UPDATE wa_messages
      SET
        status = COALESCE($3, status),
        text_body = CASE
          WHEN COALESCE($4, '') = '' THEN text_body
          ELSE $4
        END,
        raw_payload = raw_payload || $5::jsonb,
        updated_at = now()
      WHERE chat_jid = $1
        AND message_id = $2
    `,
    [chatJid, messageId, status, textBody, JSON.stringify(serializePayload(update))],
  );
};

export const listChats = async () => {
  const result = await query(
    `
      SELECT
        c.chat_jid,
        c.session_key,
        c.contact_jid,
        c.chat_type,
        c.title,
        c.avatar_url,
        c.last_message_id,
        c.last_message_preview,
        c.last_message_at,
        c.unread_count,
        c.archived,
        c.pinned,
        ct.profile_photo_url
      FROM wa_chats c
      LEFT JOIN wa_contacts ct
        ON ct.contact_jid = c.contact_jid
      ORDER BY c.pinned DESC, c.last_message_at DESC NULLS LAST, c.updated_at DESC
    `,
  );

  return result.rows.map(mapChatRow);
};

export const listMessages = async ({ chatJid, limit = 80 }) => {
  const normalizedChatJid = normalizeJid(chatJid);

  const result = await query(
    `
      SELECT
        wm.id,
        wm.chat_jid,
        wm.message_id,
        wm.sender_jid,
        wm.recipient_jid,
        wm.participant_jid,
        wm.from_me,
        wm.message_type,
        wm.text_body,
        wm.quoted_message_id,
        wm.status,
        wm.sent_at,
        m.id AS media_id,
        m.media_kind,
        m.mime_type,
        m.file_size_bytes,
        m.duration_seconds
      FROM wa_messages wm
      LEFT JOIN wa_media m
        ON m.message_pk = wm.id
      WHERE wm.chat_jid = $1
      ORDER BY wm.sent_at DESC, wm.id DESC
      LIMIT $2
    `,
    [normalizedChatJid, limit],
  );

  await query(
    `
      UPDATE wa_chats
      SET unread_count = 0,
          updated_at = now()
      WHERE chat_jid = $1
    `,
    [normalizedChatJid],
  );

  return result.rows.reverse().map(mapMessageRow);
};

export const upsertAudioMedia = async ({
  messagePk,
  chatJid,
  messageId,
  mimeType,
  fileSizeBytes,
  durationSeconds,
  storagePath,
}) => {
  await query(
    `
      INSERT INTO wa_media (
        message_pk,
        chat_jid,
        message_id,
        media_kind,
        mime_type,
        file_size_bytes,
        duration_seconds,
        storage_path,
        updated_at
      )
      VALUES ($1, $2, $3, 'audio', $4, $5, $6, $7, now())
      ON CONFLICT (message_pk) DO UPDATE SET
        mime_type = COALESCE(EXCLUDED.mime_type, wa_media.mime_type),
        file_size_bytes = COALESCE(EXCLUDED.file_size_bytes, wa_media.file_size_bytes),
        duration_seconds = COALESCE(EXCLUDED.duration_seconds, wa_media.duration_seconds),
        storage_path = EXCLUDED.storage_path,
        updated_at = now()
    `,
    [
      messagePk,
      chatJid,
      messageId,
      mimeType,
      fileSizeBytes,
      durationSeconds,
      storagePath,
    ],
  );
};

export const upsertImageMedia = async ({
  messagePk,
  chatJid,
  messageId,
  mimeType,
  fileSizeBytes,
  storagePath,
}) => {
  await query(
    `
      INSERT INTO wa_media (
        message_pk,
        chat_jid,
        message_id,
        media_kind,
        mime_type,
        file_size_bytes,
        storage_path,
        updated_at
      )
      VALUES ($1, $2, $3, 'image', $4, $5, $6, now())
      ON CONFLICT (message_pk) DO UPDATE SET
        mime_type = COALESCE(EXCLUDED.mime_type, wa_media.mime_type),
        file_size_bytes = COALESCE(EXCLUDED.file_size_bytes, wa_media.file_size_bytes),
        storage_path = EXCLUDED.storage_path,
        updated_at = now()
    `,
    [messagePk, chatJid, messageId, mimeType, fileSizeBytes, storagePath],
  );
};

export const getMediaById = async (mediaId) => {
  const result = await query(
    `
      SELECT
        id,
        message_pk,
        chat_jid,
        message_id,
        media_kind,
        mime_type,
        file_size_bytes,
        duration_seconds,
        storage_path
      FROM wa_media
      WHERE id = $1
      LIMIT 1
    `,
    [mediaId],
  );

  return result.rows[0] ?? null;
};

export const getChat = async (chatJid) => {
  const normalizedChatJid = normalizeJid(chatJid);

  const result = await query(
    `
      SELECT
        c.chat_jid,
        c.session_key,
        c.contact_jid,
        c.chat_type,
        c.title,
        c.avatar_url,
        c.last_message_id,
        c.last_message_preview,
        c.last_message_at,
        c.unread_count,
        c.archived,
        c.pinned,
        ct.profile_photo_url
      FROM wa_chats c
      LEFT JOIN wa_contacts ct
        ON ct.contact_jid = c.contact_jid
      WHERE c.chat_jid = $1
      LIMIT 1
    `,
    [normalizedChatJid],
  );

  return result.rows[0] ? mapChatRow(result.rows[0]) : null;
};

export const hydrateHistorySet = async ({
  sessionKey = defaultSessionKey,
  chats = [],
  contacts = [],
  messages = [],
}) => {
  for (const contact of contacts) {
    await upsertContact(contact);
  }

  for (const chat of chats) {
    const chatJid = normalizeJid(chat.id);
    const contactJid = getChatContactJid(chatJid);
    const contact = contacts.find(
      (entry) => normalizeJid(entry.id ?? entry.jid) === contactJid,
    );

    await upsertChat({
      sessionKey,
      chatJid,
      title: getChatTitle({
        chatJid,
        contact,
        fallbackName: chat.name ?? null,
      }),
      unreadCount: chat.unreadCount ?? 0,
      archived: Boolean(chat.archived),
      pinned: Boolean(chat.pinned),
      metadata: serializePayload(chat),
    });
  }

  for (const message of messages) {
    await persistMessage({ sessionKey, message, upsertType: 'append' });
  }
};

export const buildChatTitle = ({ chatJid, contact, fallbackName }) =>
  getChatTitle({ chatJid, contact, fallbackName });
