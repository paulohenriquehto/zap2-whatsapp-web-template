# Conversas WhatsApp

## Goal
Transformar a tela atual de QR em um inbox estilo WhatsApp Web, com lista de conversas na lateral, chat ativo na direita, persistencia em PostgreSQL, sincronizacao de mensagens recebidas/enviadas e fotos de perfil.

## Tasks
- [ ] Definir o recorte funcional do inbox: apos `connected`, trocar a UI de pareamento por layout em 2 colunas com sidebar, cabecalho da conversa, timeline e composer. -> Verify: existe mapa de estados `pairing`/`inbox` e wireframe funcional descrito abaixo.
- [ ] Persistir sessao, contatos, chats e mensagens em PostgreSQL. -> Verify: schema criado com tabelas `wa_sessions`, `wa_contacts`, `wa_chats`, `wa_messages`, `wa_message_status`, `wa_profile_photos`.
- [ ] Capturar eventos do Baileys para entrada e saida de mensagens. -> Verify: `messages.upsert`, `messages.update`, `chats.upsert`, `contacts.upsert` e eventos de envio atualizam o banco sem duplicar registros.
- [ ] Criar camada server-side de inbox com queries por conversa e por mensagem. -> Verify: rotas/API entregam lista de conversas, detalhe da conversa, pagina de mensagens e envio de nova mensagem.
- [ ] Implementar sincronizacao incremental do cliente com SSE ou polling fino. -> Verify: ao chegar nova mensagem o chat aberto atualiza e a sidebar reordena a conversa.
- [ ] Implementar envio de mensagem pelo composer. -> Verify: mensagem enviada sai pelo Baileys, entra no banco como `outgoing` e aparece no chat com status inicial.
- [ ] Buscar e atualizar fotos de perfil automaticamente. -> Verify: contatos com foto exibem avatar remoto e contatos sem foto usam fallback consistente.
- [ ] Tratar historico, idempotencia e estados operacionais. -> Verify: reinicio do container nao perde conversas persistidas, mensagens nao duplicam e sessao desconectada cai para estado controlado.
- [ ] Validar UX e operacao ponta a ponta. -> Verify: login por QR, abertura da inbox, leitura de historico, recebimento em tempo real e envio de mensagem funcionando localmente.

## Done When
- [ ] Ao escanear o QR, o usuario entra no inbox automaticamente.
- [ ] A sidebar mostra conversas com nome, foto, ultimo texto, horario e contador de nao lidas.
- [ ] O painel direito mostra historico real da conversa e atualiza em tempo real.
- [ ] O composer envia mensagem real pelo WhatsApp e registra input/output no banco.
- [ ] O sistema suporta reinicio sem perder sessao nem historico sincronizado.

## Arquitetura Proposta

### 1. Fluxo principal
- `WhatsAppGateway` continua responsavel por conexao e auth.
- Criamos um `WhatsAppSyncService` para transformar eventos do Baileys em operacoes de banco.
- Criamos um `ConversationService` para leitura do inbox.
- A UI deixa de ser uma tela unica de QR e passa a ser uma shell com dois modos:
  - `pairing`
  - `inbox`

### 2. Estrutura de backend
- `src/whatsapp-gateway.js`
  - manter conexao/socket
  - publicar eventos de dominio, nao query de UI
- `src/server/db/*` ou `src/lib/db/*`
  - conexao PostgreSQL
  - repositories
- `src/server/services/whatsapp-sync/*`
  - handlers de `messages.upsert`, `messages.update`, `chats.upsert`, `contacts.upsert`
- `src/app/api/inbox/chats/route.js`
  - lista de conversas
- `src/app/api/inbox/chats/[chatId]/route.js`
  - metadados do chat ativo
- `src/app/api/inbox/chats/[chatId]/messages/route.js`
  - mensagens paginadas
- `src/app/api/inbox/send/route.js`
  - envio de mensagem
- `src/app/api/inbox/events/route.js`
  - stream de atualizacao da inbox

### 3. Banco de dados
Eu nao recomendo modelar isso como “só salvar texto enviado e recebido”. Isso fica fraco rapido. O certo e modelar sessao, conversa, participante, mensagem e status.

#### `wa_sessions`
- `id`
- `phone_number`
- `device_id`
- `status`
- `connected_at`
- `last_seen_at`
- `created_at`
- `updated_at`

#### `wa_contacts`
- `id`
- `jid` unique
- `push_name`
- `display_name`
- `phone_number`
- `profile_photo_url`
- `profile_photo_etag`
- `is_business`
- `created_at`
- `updated_at`

#### `wa_chats`
- `id`
- `jid` unique
- `session_id`
- `contact_id` nullable
- `chat_type` (`direct`, `group`, `broadcast`)
- `title`
- `last_message_id`
- `last_message_at`
- `unread_count`
- `archived`
- `pinned`
- `created_at`
- `updated_at`

#### `wa_messages`
- `id`
- `session_id`
- `chat_id`
- `sender_jid`
- `recipient_jid`
- `wamid` unique
- `direction` (`incoming`, `outgoing`, `system`)
- `message_type`
- `text_body`
- `raw_payload` jsonb
- `quoted_message_id` nullable
- `sent_at`
- `delivered_at` nullable
- `read_at` nullable
- `failed_at` nullable
- `created_at`

#### `wa_message_status`
- `id`
- `message_id`
- `status` (`queued`, `sent`, `server_ack`, `device_ack`, `read`, `failed`)
- `status_at`
- `meta` jsonb

#### `wa_profile_photos`
- `id`
- `contact_id`
- `photo_url`
- `source`
- `fetched_at`
- `expires_at`

### 4. Regras de sincronizacao
- `messages.upsert`
  - insere mensagem nova
  - faz upsert por `wamid`
  - atualiza `wa_chats.last_message_*`
- `messages.update`
  - atualiza status de entrega/leitura
- `chats.upsert`
  - cria ou atualiza conversa
- `contacts.upsert`
  - cria ou atualiza nome/telefone
- `profilePictureUrl(jid)`
  - buscar sob demanda e cachear no banco

### 5. UI alvo baseada nas imagens
As imagens mostram um padrao claro:
- esquerda: busca, filtros, lista de conversas, avatar, nome, preview, horario, badge de nao lidas
- direita: header da conversa, bolhas de entrada/saida, hora, status e composer fixo

Vamos reproduzir esse fluxo, mas nao copiar cegamente o WhatsApp Web. O objetivo correto e:
- linguagem visual inspirada
- experiencia de inbox operacional
- estrutura propria e sustentavel

### 6. Decisoes tecnicas
- Banco: PostgreSQL
- Acesso ao banco: eu prefiro `pg` ou `drizzle` aqui; eu nao subiria Prisma sem necessidade porque esse fluxo e event-driven, com muito upsert e jsonb.
- Atualizacao em tempo real: SSE primeiro
- Paginacao de mensagens: cursor por `sent_at` + `id`
- Fotos de perfil: fetch lazy + refresh periodico

### 7. Riscos que precisam ser tratados
- Baileys nao e uma replica 1:1 do WhatsApp Web; historico completo depende de sincronizacao/eventos reais.
- Fotos de perfil podem falhar ou expirar; precisa fallback visual.
- Mensagem enviada precisa entrar no banco mesmo antes de confirmacao final, senao o chat parece quebrado.
- Idempotencia e obrigatoria; reinicio sem isso duplica historico.
- Grupo e broadcast aumentam muito a complexidade; para v1 eu recomendo focar em conversa direta primeiro.

### 8. Recorte recomendado de V1
- Conversas diretas primeiro
- Texto somente primeiro
- Fotos de perfil automaticas
- Sidebar com busca simples
- Composer com envio de texto
- Status de entrega basico

Depois:
- grupos
- audio/imagem/documento
- reacoes
- reply/quoted messages
- filtros e labels
