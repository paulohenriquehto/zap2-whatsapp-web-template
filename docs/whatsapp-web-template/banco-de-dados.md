# Banco de dados | Estrutura e adaptacao

## 1. Banco padrao do template

O banco padrao do template e PostgreSQL.

Motivo:

- schema atual escrito para PostgreSQL
- uso de `jsonb`
- uso de `timestamptz`
- upserts com `ON CONFLICT`
- merges de metadata em JSON

Se o seu sistema ja usa PostgreSQL, a adaptacao e direta.

Se o seu sistema usa outro banco, a recomendacao pratica e manter um PostgreSQL dedicado para o modulo, a menos que exista uma necessidade real de reescrever toda a camada de persistencia.

## 2. Tabelas atuais

### `wa_sessions`

Responsabilidade:

- estado da conexao com o WhatsApp
- numero conectado
- metadata da sessao

Campos principais:

- `session_key`
- `phone_number`
- `status`
- `connected_at`
- `last_seen_at`
- `metadata`

### `wa_contacts`

Responsabilidade:

- identidade de contato ou participante
- nomes resolvidos
- foto de perfil
- metadata do contato

Campos principais:

- `contact_jid`
- `phone_number`
- `display_name`
- `push_name`
- `verified_name`
- `profile_photo_url`
- `metadata`

### `wa_chats`

Responsabilidade:

- conversa consolidada
- tipo da conversa
- ultimo preview
- contador de nao lidas

Campos principais:

- `chat_jid`
- `session_key`
- `contact_jid`
- `chat_type`
- `title`
- `avatar_url`
- `last_message_id`
- `last_message_preview`
- `last_message_at`
- `unread_count`
- `archived`
- `pinned`
- `metadata`

### `wa_messages`

Responsabilidade:

- historico de mensagens
- texto, status, remetente, quoted id e payload bruto

Campos principais:

- `id`
- `chat_jid`
- `session_key`
- `message_id`
- `sender_jid`
- `recipient_jid`
- `participant_jid`
- `from_me`
- `message_type`
- `text_body`
- `quoted_message_id`
- `status`
- `sent_at`
- `raw_payload`

### `wa_media`

Responsabilidade:

- ponte entre mensagem e arquivo persistido

Campos principais:

- `id`
- `message_pk`
- `chat_jid`
- `message_id`
- `media_kind`
- `mime_type`
- `file_size_bytes`
- `duration_seconds`
- `storage_path`

### `wa_labels`

Responsabilidade:

- cadastro das etiquetas
- suporte a origem WhatsApp e origem local

Campos principais:

- `id`
- `session_key`
- `source`
- `name`
- `color`
- `deleted`
- `predefined_id`
- `metadata`

### `wa_chat_labels`

Responsabilidade:

- associacao entre conversa e etiqueta

Campos principais:

- `chat_jid`
- `label_id`
- `session_key`

## 3. Relacoes funcionais

- `wa_chats.contact_jid -> wa_contacts.contact_jid`
- `wa_messages.chat_jid -> wa_chats.chat_jid`
- `wa_media.message_pk -> wa_messages.id`
- `wa_chat_labels.chat_jid -> wa_chats.chat_jid`
- `wa_chat_labels.label_id -> wa_labels.id`

## 4. Como adaptar em banco existente

### Opcao 1 | Mesmo banco, mesmas tabelas

Use quando:

- o sistema host ja usa PostgreSQL
- o time aceita prefixo `wa_*`

### Opcao 2 | Mesmo banco, schema separado

Use quando:

- o produto ja e maduro
- voce quer isolar o dominio WhatsApp

Exemplo:

- `whatsapp.wa_sessions`
- `whatsapp.wa_contacts`
- `whatsapp.wa_chats`

### Opcao 3 | Banco dedicado do modulo

Use quando:

- o banco do host nao e PostgreSQL
- o time quer reduzir risco
- a integracao sera sidecar

## 5. O que precisa ser adaptado em sistemas ja existentes

### Identidade de dono da sessao

Em CRM real, `session_key` nao deve ficar so como `primary`.

O correto e relacionar a sessao com:

- empresa
- workspace
- canal
- unidade de negocio

### Ownership de conversas

Se o CRM tem agentes, filas ou squads, voce provavelmente precisara de tabelas adicionais, por exemplo:

- `crm_whatsapp_connections`
- `crm_whatsapp_chat_owners`
- `crm_whatsapp_agent_permissions`

Essas tabelas nao fazem parte do template atual porque pertencem ao dominio do produto host.

## 6. Labels internas vs labels do WhatsApp

O projeto suporta dois tipos de etiqueta:

- `source = 'whatsapp'`
- `source = 'local'`

Interpretacao:

- `whatsapp`: veio da conta conectada
- `local`: existe apenas no sistema

Isso e importante para CRMs porque nem toda conta conectada sera WhatsApp Business.

## 7. Recomendacao para IA ou desenvolvedor

Nao misture tabelas de CRM e tabelas tecnicas do WhatsApp sem criterio.

Mantenha a regra:

1. tabelas `wa_*` representam o motor do canal
2. tabelas do produto host representam negocio, ownership, funil, cliente, lead e automacao

Essa separacao deixa a manutencao mais limpa.
