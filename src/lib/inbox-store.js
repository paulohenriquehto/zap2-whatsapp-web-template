import { randomUUID } from 'node:crypto';

import {
  formatPhoneNumberForDisplay,
  getChatContactJid,
  getChatTitle,
  getChatType,
  getMessageStatus,
  getMessageText,
  getMessageTimestamp,
  getMessageType,
  getPhoneNumberFromJid,
  isLidJid,
  normalizeJid,
  serializePayload,
} from './whatsapp-helpers.js';
import { query, transaction } from './database.js';

const defaultSessionKey = 'primary';
const LOCAL_LABEL_COLOR_VARIANTS = 20;

const normalizeDisplayValue = (value) => {
  if (typeof value !== 'string') {
    return value ?? null;
  }

  const normalized = value.replace(/[\s\u2800]+/gu, ' ').trim();
  return normalized || null;
};

const getJidLocalPart = (jid) => {
  const normalizedJid = normalizeJid(jid);
  if (!normalizedJid) {
    return null;
  }

  const [localPart = ''] = normalizedJid.split('@');
  return localPart || null;
};

const normalizeDigits = (value) => String(value ?? '').replace(/\D/g, '');
const normalizeLabelSource = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase() === 'local'
    ? 'local'
    : 'whatsapp';

const getDeterministicLocalLabelColor = (labelName) => {
  const normalizedName = normalizeDisplayValue(labelName) ?? 'Etiqueta';
  let hash = 0;

  for (const character of normalizedName) {
    hash = (hash * 31 + character.charCodeAt(0)) % LOCAL_LABEL_COLOR_VARIANTS;
  }

  return hash;
};

const isGenericDirectTitle = ({ title, chatJid, contactJid, phoneNumber }) => {
  const normalizedTitle = normalizeDisplayValue(title);

  if (!normalizedTitle) {
    return false;
  }

  const comparableValue = normalizedTitle.toLowerCase();
  const comparableDigits = normalizeDigits(normalizedTitle);
  const comparableTexts = [
    normalizeJid(chatJid),
    normalizeJid(contactJid),
    getJidLocalPart(chatJid),
    getJidLocalPart(contactJid),
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  if (comparableTexts.includes(comparableValue)) {
    return true;
  }

  if (!comparableDigits) {
    return false;
  }

  const comparableNumbers = [
    phoneNumber,
    getPhoneNumberFromJid(chatJid),
    getPhoneNumberFromJid(contactJid),
    getJidLocalPart(chatJid),
    getJidLocalPart(contactJid),
  ]
    .map(normalizeDigits)
    .filter(Boolean);

  return comparableNumbers.includes(comparableDigits);
};

const resolveChatIdentity = (row) => {
  const chatJid = normalizeJid(row.chat_jid);
  const contactJid = normalizeJid(row.contact_jid) ?? getChatContactJid(chatJid);
  const chatType = row.chat_type ?? getChatType(chatJid);
  const phoneNumber =
    row.phone_number ??
    getPhoneNumberFromJid(contactJid) ??
    getPhoneNumberFromJid(chatJid);
  const formattedPhoneNumber = formatPhoneNumberForDisplay(phoneNumber);
  const savedName = normalizeDisplayValue(row.display_name);
  const pushName = normalizeDisplayValue(row.push_name);
  const verifiedName = normalizeDisplayValue(row.verified_name);
  const explicitTitle = normalizeDisplayValue(row.title);

  if (chatType === 'group') {
    const title = explicitTitle ?? 'Grupo sem nome';

    return {
      title,
      subtitle: 'Grupo do WhatsApp',
      phoneNumber,
      formattedPhoneNumber,
      savedName: null,
      pushName: null,
      verifiedName: null,
    };
  }

  const usableExplicitTitle = isGenericDirectTitle({
    title: explicitTitle,
    chatJid,
    contactJid,
    phoneNumber,
  })
    ? null
    : explicitTitle;
  const title =
    savedName ??
    pushName ??
    verifiedName ??
    usableExplicitTitle ??
    formattedPhoneNumber ??
    (isLidJid(chatJid ?? contactJid) ? 'Contato WhatsApp' : chatJid);
  const subtitle =
    formattedPhoneNumber && formattedPhoneNumber !== title
      ? formattedPhoneNumber
      : isLidJid(chatJid ?? contactJid)
        ? 'Contato do WhatsApp'
        : null;

  return {
    title,
    subtitle,
    phoneNumber,
    formattedPhoneNumber,
    savedName,
    pushName,
    verifiedName,
  };
};

const resolveContactIdentity = ({
  jid,
  phoneNumber = null,
  displayName = null,
  pushName = null,
  verifiedName = null,
  title = null,
}) => {
  const normalizedJid = normalizeJid(jid);
  const normalizedPhoneNumber =
    phoneNumber ??
    getPhoneNumberFromJid(normalizedJid);
  const formattedPhoneNumber = formatPhoneNumberForDisplay(normalizedPhoneNumber);
  const savedName = normalizeDisplayValue(displayName);
  const normalizedPushName = normalizeDisplayValue(pushName);
  const normalizedVerifiedName = normalizeDisplayValue(verifiedName);
  const explicitTitle = normalizeDisplayValue(title);
  const usableExplicitTitle = isGenericDirectTitle({
    title: explicitTitle,
    chatJid: normalizedJid,
    contactJid: normalizedJid,
    phoneNumber: normalizedPhoneNumber,
  })
    ? null
    : explicitTitle;
  const resolvedTitle =
    savedName ??
    normalizedPushName ??
    normalizedVerifiedName ??
    usableExplicitTitle ??
    formattedPhoneNumber ??
    (isLidJid(normalizedJid) ? 'Contato WhatsApp' : normalizedJid);
  const subtitle =
    formattedPhoneNumber && formattedPhoneNumber !== resolvedTitle
      ? formattedPhoneNumber
      : null;

  return {
    jid: normalizedJid,
    title: resolvedTitle,
    subtitle,
    phoneNumber: normalizedPhoneNumber,
    formattedPhoneNumber,
    savedName,
    pushName: normalizedPushName,
    verifiedName: normalizedVerifiedName,
  };
};

const mapChatRow = (row) => {
  const identity = resolveChatIdentity(row);

  return {
    chatJid: row.chat_jid,
    sessionKey: row.session_key,
    contactJid: row.contact_jid,
    chatType: row.chat_type,
    title: identity.title,
    subtitle: identity.subtitle,
    phoneNumber: identity.phoneNumber,
    formattedPhoneNumber: identity.formattedPhoneNumber,
    avatarUrl: row.avatar_url ?? row.profile_photo_url ?? null,
    lastMessageId: row.last_message_id,
    lastMessagePreview: row.last_message_preview ?? '',
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count ?? 0,
    archived: row.archived,
    pinned: row.pinned,
  };
};

const mapMessageRow = (row) => {
  const chatType = row.chat_type ?? getChatType(row.chat_jid);
  const participantJid =
    normalizeJid(row.participant_contact_jid) ??
    normalizeJid(row.participant_jid) ??
    normalizeJid(row.sender_jid);
  const participantIdentity = participantJid
    ? resolveContactIdentity({
        jid: participantJid,
        phoneNumber: row.participant_phone_number,
        displayName: row.participant_display_name,
        pushName: row.participant_push_name,
        verifiedName: row.participant_verified_name,
      })
    : null;

  return {
    id: row.id,
    chatJid: row.chat_jid,
    chatType,
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
    participant:
      chatType === 'group' && !row.from_me && participantIdentity
        ? {
            jid: participantIdentity.jid,
            title: participantIdentity.title,
            subtitle: participantIdentity.subtitle,
            phoneNumber: participantIdentity.phoneNumber,
            formattedPhoneNumber: participantIdentity.formattedPhoneNumber,
            avatarUrl: row.participant_profile_photo_url ?? null,
          }
        : null,
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
  };
};

const buildMessagePreview = ({ textBody, messageType, mediaKind, durationSeconds }) => {
  if (textBody) {
    return textBody;
  }

  if (mediaKind === 'image' || messageType === 'imageMessage') {
    return 'Imagem';
  }

  if (mediaKind === 'audio' || messageType === 'audioMessage') {
    if (durationSeconds) {
      return `Mensagem de voz (${Math.max(0, Math.round(durationSeconds))}s)`;
    }

    return 'Mensagem de voz';
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
  const contactLid = normalizeJid(contact?.lid);
  const phoneNumber = getPhoneNumberFromJid(contactJid);
  const displayName = normalizeDisplayValue(contact?.name);
  const pushName = normalizeDisplayValue(contact?.notify);
  const verifiedName = normalizeDisplayValue(contact?.verifiedName);

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
        display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), wa_contacts.display_name),
        push_name = COALESCE(NULLIF(EXCLUDED.push_name, ''), wa_contacts.push_name),
        verified_name = COALESCE(NULLIF(EXCLUDED.verified_name, ''), wa_contacts.verified_name),
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
      phoneNumber,
      displayName,
      pushName,
      verifiedName,
      contact?.imgUrl ?? null,
      JSON.stringify(serializePayload(contact)),
    ],
  );

  if (contactLid && contactLid !== contactJid) {
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
          display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), wa_contacts.display_name),
          push_name = COALESCE(NULLIF(EXCLUDED.push_name, ''), wa_contacts.push_name),
          verified_name = COALESCE(NULLIF(EXCLUDED.verified_name, ''), wa_contacts.verified_name),
          profile_photo_url = COALESCE(EXCLUDED.profile_photo_url, wa_contacts.profile_photo_url),
          profile_photo_fetched_at = CASE
            WHEN EXCLUDED.profile_photo_url IS NULL THEN wa_contacts.profile_photo_fetched_at
            ELSE now()
          END,
          metadata = wa_contacts.metadata || EXCLUDED.metadata,
          updated_at = now()
      `,
      [
        contactLid,
        phoneNumber,
        displayName,
        pushName,
        verifiedName,
        contact?.imgUrl ?? null,
        JSON.stringify(
          serializePayload({
            ...contact,
            linkedJid: contactJid,
          }),
        ),
      ],
    );
  }

  return contactJid;
};

export const updateContactPhoneNumber = async ({ jid, phoneNumber, metadata = {} }) => {
  const normalizedJid = normalizeJid(jid);
  const normalizedPhoneNumber = getPhoneNumberFromJid(phoneNumber);

  if (!normalizedJid || !normalizedPhoneNumber) {
    return;
  }

  await query(
    `
      INSERT INTO wa_contacts (
        contact_jid,
        phone_number,
        metadata,
        updated_at
      )
      VALUES ($1, $2, $3::jsonb, now())
      ON CONFLICT (contact_jid) DO UPDATE SET
        phone_number = EXCLUDED.phone_number,
        metadata = wa_contacts.metadata || EXCLUDED.metadata,
        updated_at = now()
    `,
    [normalizedJid, normalizedPhoneNumber, JSON.stringify(serializePayload(metadata))],
  );
};

export const sanitizeContactPhoneNumbers = async () => {
  await query(
    `
      UPDATE wa_contacts
      SET phone_number = NULL,
          updated_at = now()
      WHERE contact_jid LIKE '%@lid'
        AND COALESCE(metadata->>'sharedPhoneJid', '') = ''
    `,
  );
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
      VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, COALESCE($7, 0), $8, $9, $10::jsonb, now())
      ON CONFLICT (chat_jid) DO UPDATE SET
        session_key = EXCLUDED.session_key,
        contact_jid = COALESCE(EXCLUDED.contact_jid, wa_chats.contact_jid),
        chat_type = EXCLUDED.chat_type,
        title = COALESCE(NULLIF(EXCLUDED.title, ''), wa_chats.title),
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
  const lastMessagePreview = buildMessagePreview({ textBody, messageType });
  const sentAt = getMessageTimestamp(message);
  const status = getMessageStatus(message);
  const contactJid = getChatContactJid(chatJid);
  const participantContactJid = participantJid ?? senderJid;
  const participantPushName = normalizeDisplayValue(message?.pushName);

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

    if (participantContactJid) {
      await client.query(
        `
          INSERT INTO wa_contacts (
            contact_jid,
            phone_number,
            push_name,
            updated_at
          )
          VALUES ($1, $2, $3, now())
          ON CONFLICT (contact_jid) DO UPDATE SET
            phone_number = COALESCE(EXCLUDED.phone_number, wa_contacts.phone_number),
            push_name = COALESCE(NULLIF(EXCLUDED.push_name, ''), wa_contacts.push_name),
            updated_at = now()
        `,
        [
          participantContactJid,
          getPhoneNumberFromJid(participantContactJid),
          participantPushName,
        ],
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
      participantContactJid,
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
        ct.profile_photo_url,
        ct.display_name,
        ct.push_name,
        ct.verified_name,
        ct.phone_number
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
        wc.chat_type,
        wm.from_me,
        wm.message_type,
        wm.text_body,
        wm.quoted_message_id,
        wm.status,
        wm.sent_at,
        pct.contact_jid AS participant_contact_jid,
        pct.profile_photo_url AS participant_profile_photo_url,
        pct.display_name AS participant_display_name,
        COALESCE(NULLIF(pct.push_name, ''), NULLIF(wm.raw_payload->>'pushName', '')) AS participant_push_name,
        pct.verified_name AS participant_verified_name,
        pct.phone_number AS participant_phone_number,
        m.id AS media_id,
        m.media_kind,
        m.mime_type,
        m.file_size_bytes,
        m.duration_seconds
      FROM wa_messages wm
      INNER JOIN wa_chats wc
        ON wc.chat_jid = wm.chat_jid
      LEFT JOIN wa_media m
        ON m.message_pk = wm.id
      LEFT JOIN wa_contacts pct
        ON pct.contact_jid = COALESCE(wm.participant_jid, wm.sender_jid)
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

const mapLabelRow = (row) => ({
  id: row.id,
  name: row.name,
  color: Number(row.color ?? 0),
  deleted: Boolean(row.deleted),
  predefinedId: row.predefined_id ?? null,
  source: normalizeLabelSource(row.source),
  sessionKey: row.session_key ?? defaultSessionKey,
});

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
        ct.profile_photo_url,
        ct.display_name,
        ct.push_name,
        ct.verified_name,
        ct.phone_number
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

export const upsertLabel = async (
  label,
  { sessionKey = defaultSessionKey, source = 'whatsapp' } = {},
) => {
  const labelId = normalizeDisplayValue(label?.id);
  const normalizedSessionKey =
    normalizeDisplayValue(label?.sessionKey ?? sessionKey) ?? defaultSessionKey;
  const normalizedSource = normalizeLabelSource(label?.source ?? source);

  if (!labelId) {
    return null;
  }

  await query(
    `
      INSERT INTO wa_labels (
        id,
        session_key,
        source,
        name,
        color,
        deleted,
        predefined_id,
        metadata,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        COALESCE($4, 'Tag do WhatsApp'),
        COALESCE($5, 0),
        COALESCE($6, false),
        $7,
        $8::jsonb,
        now()
      )
      ON CONFLICT (id) DO UPDATE SET
        session_key = EXCLUDED.session_key,
        source = EXCLUDED.source,
        name = COALESCE(EXCLUDED.name, wa_labels.name),
        color = COALESCE(EXCLUDED.color, wa_labels.color),
        deleted = COALESCE(EXCLUDED.deleted, wa_labels.deleted),
        predefined_id = COALESCE(EXCLUDED.predefined_id, wa_labels.predefined_id),
        metadata = wa_labels.metadata || EXCLUDED.metadata,
        updated_at = now()
    `,
    [
      labelId,
      normalizedSessionKey,
      normalizedSource,
      normalizeDisplayValue(label?.name),
      Number.isFinite(Number(label?.color)) ? Number(label.color) : 0,
      typeof label?.deleted === 'boolean' ? label.deleted : false,
      normalizeDisplayValue(label?.predefinedId),
      JSON.stringify(serializePayload(label)),
    ],
  );

  return labelId;
};

export const getLabelById = async ({
  labelId,
  sessionKey = defaultSessionKey,
}) => {
  const normalizedLabelId = normalizeDisplayValue(labelId);
  const normalizedSessionKey = normalizeDisplayValue(sessionKey) ?? defaultSessionKey;

  if (!normalizedLabelId) {
    return null;
  }

  const result = await query(
    `
      SELECT
        id,
        session_key,
        source,
        name,
        color,
        deleted,
        predefined_id
      FROM wa_labels
      WHERE id = $1
        AND session_key = $2
      LIMIT 1
    `,
    [normalizedLabelId, normalizedSessionKey],
  );

  return result.rows[0] ? mapLabelRow(result.rows[0]) : null;
};

export const createLocalLabel = async ({
  name,
  color = null,
  sessionKey = defaultSessionKey,
  metadata = {},
}) => {
  const normalizedName = normalizeDisplayValue(name);
  const normalizedSessionKey = normalizeDisplayValue(sessionKey) ?? defaultSessionKey;

  if (!normalizedName) {
    throw new Error('Informe o nome da etiqueta.');
  }

  const normalizedColor = Number.isFinite(Number(color))
    ? Number(color)
    : getDeterministicLocalLabelColor(normalizedName);
  const existingResult = await query(
    `
      SELECT
        id,
        session_key,
        source,
        name,
        color,
        deleted,
        predefined_id
      FROM wa_labels
      WHERE session_key = $1
        AND source = 'local'
        AND LOWER(name) = LOWER($2)
      LIMIT 1
    `,
    [normalizedSessionKey, normalizedName],
  );

  const existingLabel = existingResult.rows[0];

  if (existingLabel) {
    const revivedResult = await query(
      `
        UPDATE wa_labels
        SET
          deleted = false,
          color = COALESCE($2, wa_labels.color),
          metadata = wa_labels.metadata || $3::jsonb,
          updated_at = now()
        WHERE id = $1
        RETURNING
          id,
          session_key,
          source,
          name,
          color,
          deleted,
          predefined_id
      `,
      [existingLabel.id, normalizedColor, JSON.stringify(metadata)],
    );

    return mapLabelRow(revivedResult.rows[0]);
  }

  const insertResult = await query(
    `
      INSERT INTO wa_labels (
        id,
        session_key,
        source,
        name,
        color,
        deleted,
        metadata,
        updated_at
      )
      VALUES ($1, $2, 'local', $3, $4, false, $5::jsonb, now())
      RETURNING
        id,
        session_key,
        source,
        name,
        color,
        deleted,
        predefined_id
    `,
    [
      `local:${randomUUID()}`,
      normalizedSessionKey,
      normalizedName,
      normalizedColor,
      JSON.stringify(metadata),
    ],
  );

  return mapLabelRow(insertResult.rows[0]);
};

export const upsertChatLabelAssociation = async ({
  chatJid,
  labelId,
  sessionKey = defaultSessionKey,
  labelSource = 'whatsapp',
}) => {
  const normalizedChatJid = normalizeJid(chatJid);
  const normalizedLabelId = normalizeDisplayValue(labelId);
  const normalizedLabelSource = normalizeLabelSource(labelSource);
  const placeholderName =
    normalizedLabelSource === 'local' ? 'Etiqueta do sistema' : 'Tag do WhatsApp';

  if (!normalizedChatJid || !normalizedLabelId) {
    return;
  }

  await upsertChat({
    sessionKey,
    chatJid: normalizedChatJid,
  });

  await query(
    `
      INSERT INTO wa_labels (
        id,
        session_key,
        source,
        name,
        color,
        deleted,
        metadata,
        updated_at
      )
      VALUES ($1, $2, $3, $4, 0, false, '{}'::jsonb, now())
      ON CONFLICT (id) DO NOTHING
    `,
    [
      normalizedLabelId,
      sessionKey,
      normalizedLabelSource,
      placeholderName,
    ],
  );

  await query(
    `
      INSERT INTO wa_chat_labels (
        chat_jid,
        label_id,
        session_key,
        updated_at
      )
      VALUES ($1, $2, $3, now())
      ON CONFLICT (chat_jid, label_id) DO UPDATE SET
        session_key = EXCLUDED.session_key,
        updated_at = now()
    `,
    [normalizedChatJid, normalizedLabelId, sessionKey],
  );
};

export const removeChatLabelAssociation = async ({ chatJid, labelId }) => {
  const normalizedChatJid = normalizeJid(chatJid);
  const normalizedLabelId = normalizeDisplayValue(labelId);

  if (!normalizedChatJid || !normalizedLabelId) {
    return;
  }

  await query(
    `
      DELETE FROM wa_chat_labels
      WHERE chat_jid = $1
        AND label_id = $2
    `,
    [normalizedChatJid, normalizedLabelId],
  );
};

export const getChatDetails = async (chatJid) => {
  const normalizedChatJid = normalizeJid(chatJid);

  if (!normalizedChatJid) {
    return null;
  }

  const [chatResult, firstMessageResult] = await Promise.all([
    query(
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
          c.metadata AS chat_metadata,
          ct.profile_photo_url,
          ct.display_name,
          ct.push_name,
          ct.verified_name,
          ct.phone_number,
          ct.metadata AS contact_metadata
        FROM wa_chats c
        LEFT JOIN wa_contacts ct
          ON ct.contact_jid = c.contact_jid
        WHERE c.chat_jid = $1
        LIMIT 1
      `,
      [normalizedChatJid],
    ),
    query(
      `
        SELECT
          wm.message_id,
          wm.message_type,
          wm.text_body,
          wm.from_me,
          wm.sent_at,
          m.media_kind,
          m.duration_seconds
        FROM wa_messages wm
        LEFT JOIN wa_media m
          ON m.message_pk = wm.id
        WHERE wm.chat_jid = $1
        ORDER BY wm.sent_at ASC, wm.id ASC
        LIMIT 1
      `,
      [normalizedChatJid],
    ),
  ]);

  const chatRow = chatResult.rows[0];

  if (!chatRow) {
    return null;
  }

  const sessionKey = chatRow.session_key ?? defaultSessionKey;
  const [chatLabelsResult, allLabelsResult] = await Promise.all([
    query(
      `
        SELECT
          l.id,
          l.session_key,
          l.source,
          l.name,
          l.color,
          l.deleted,
          l.predefined_id
        FROM wa_chat_labels cl
        INNER JOIN wa_labels l
          ON l.id = cl.label_id
        WHERE cl.chat_jid = $1
          AND cl.session_key = $2
          AND l.session_key = $2
          AND NOT l.deleted
        ORDER BY
          CASE WHEN l.source = 'local' THEN 0 ELSE 1 END,
          l.name ASC,
          l.id ASC
      `,
      [normalizedChatJid, sessionKey],
    ),
    query(
      `
        SELECT
          id,
          session_key,
          source,
          name,
          color,
          deleted,
          predefined_id
        FROM wa_labels
        WHERE session_key = $1
          AND NOT deleted
        ORDER BY
          CASE WHEN source = 'local' THEN 0 ELSE 1 END,
          name ASC,
          id ASC
      `,
      [sessionKey],
    ),
  ]);

  const chat = mapChatRow(chatRow);
  const identity = resolveChatIdentity(chatRow);
  const firstMessageRow = firstMessageResult.rows[0] ?? null;
  const labels = chatLabelsResult.rows.map(mapLabelRow);
  const availableLabels = allLabelsResult.rows.map(mapLabelRow);

  return {
    chat: {
      ...chat,
      savedName: identity.savedName,
      pushName: identity.pushName,
      verifiedName: identity.verifiedName,
      rawJid: chatRow.chat_jid,
      contactMetadata: chatRow.contact_metadata ?? {},
      chatMetadata: chatRow.chat_metadata ?? {},
    },
    firstMessage: firstMessageRow
      ? {
          messageId: firstMessageRow.message_id,
          messageType: firstMessageRow.message_type,
          fromMe: firstMessageRow.from_me,
          sentAt: firstMessageRow.sent_at,
          preview: buildMessagePreview({
            textBody: firstMessageRow.text_body,
            messageType: firstMessageRow.message_type,
            mediaKind: firstMessageRow.media_kind,
            durationSeconds: firstMessageRow.duration_seconds,
          }),
        }
      : null,
    labels,
    availableLabels,
  };
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
