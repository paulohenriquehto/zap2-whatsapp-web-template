import { Pool } from 'pg';

const globalState = globalThis;

const defaultDatabaseUrl = 'postgresql://zap2:zap2@postgres:5432/zap2';

const schemaSql = `
CREATE TABLE IF NOT EXISTS wa_sessions (
  session_key text PRIMARY KEY,
  phone_number text,
  status text NOT NULL,
  connected_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wa_contacts (
  contact_jid text PRIMARY KEY,
  phone_number text,
  display_name text,
  push_name text,
  verified_name text,
  profile_photo_url text,
  profile_photo_fetched_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wa_chats (
  chat_jid text PRIMARY KEY,
  session_key text NOT NULL,
  contact_jid text REFERENCES wa_contacts(contact_jid) ON DELETE SET NULL,
  chat_type text NOT NULL,
  title text,
  avatar_url text,
  last_message_id text,
  last_message_preview text,
  last_message_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  pinned boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wa_messages (
  id bigserial PRIMARY KEY,
  chat_jid text NOT NULL REFERENCES wa_chats(chat_jid) ON DELETE CASCADE,
  session_key text NOT NULL,
  message_id text NOT NULL,
  sender_jid text,
  recipient_jid text,
  participant_jid text,
  from_me boolean NOT NULL DEFAULT false,
  message_type text,
  text_body text,
  quoted_message_id text,
  status text NOT NULL DEFAULT 'received',
  sent_at timestamptz NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_jid, message_id)
);

CREATE INDEX IF NOT EXISTS wa_chats_last_message_at_idx
  ON wa_chats (last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS wa_messages_chat_jid_sent_at_idx
  ON wa_messages (chat_jid, sent_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS wa_media (
  id bigserial PRIMARY KEY,
  message_pk bigint NOT NULL REFERENCES wa_messages(id) ON DELETE CASCADE,
  chat_jid text NOT NULL REFERENCES wa_chats(chat_jid) ON DELETE CASCADE,
  message_id text NOT NULL,
  media_kind text NOT NULL,
  mime_type text,
  file_size_bytes bigint,
  duration_seconds integer,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_pk),
  UNIQUE (chat_jid, message_id, media_kind)
);

CREATE INDEX IF NOT EXISTS wa_media_chat_jid_idx
  ON wa_media (chat_jid, created_at DESC);

CREATE TABLE IF NOT EXISTS wa_labels (
  id text PRIMARY KEY,
  session_key text NOT NULL DEFAULT 'primary',
  source text NOT NULL DEFAULT 'whatsapp',
  name text NOT NULL,
  color integer NOT NULL DEFAULT 0,
  deleted boolean NOT NULL DEFAULT false,
  predefined_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wa_chat_labels (
  chat_jid text NOT NULL REFERENCES wa_chats(chat_jid) ON DELETE CASCADE,
  label_id text NOT NULL REFERENCES wa_labels(id) ON DELETE CASCADE,
  session_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_jid, label_id)
);

CREATE INDEX IF NOT EXISTS wa_chat_labels_label_id_idx
  ON wa_chat_labels (label_id, created_at DESC);

ALTER TABLE wa_labels
  ADD COLUMN IF NOT EXISTS session_key text NOT NULL DEFAULT 'primary';

ALTER TABLE wa_labels
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'whatsapp';

UPDATE wa_labels
SET session_key = 'primary'
WHERE session_key IS NULL;

UPDATE wa_labels
SET source = 'whatsapp'
WHERE source IS NULL;

CREATE INDEX IF NOT EXISTS wa_labels_session_source_idx
  ON wa_labels (session_key, source, deleted, name);
`;

const buildPool = () =>
  new Pool({
    connectionString: process.env.DATABASE_URL ?? defaultDatabaseUrl,
  });

export const getPool = () => {
  if (!globalState.__zap2Pool) {
    globalState.__zap2Pool = buildPool();
  }

  return globalState.__zap2Pool;
};

export const ensureDatabase = async () => {
  if (!globalState.__zap2SchemaPromise) {
    globalState.__zap2SchemaPromise = getPool().query(schemaSql);
  }

  return globalState.__zap2SchemaPromise;
};

export const query = async (text, params = []) => {
  await ensureDatabase();
  return getPool().query(text, params);
};

export const transaction = async (runner) => {
  await ensureDatabase();

  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    const result = await runner(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
