# API e eventos | Contrato do modulo

## 1. Principio

O template expõe uma API operacional simples para sessao, inbox, detalhes, labels, envio e midia.

## 2. Endpoints de sessao

### `GET /api/session`

Retorna snapshot atual da sessao.

Campos relevantes:

- `status`
- `headline`
- `detail`
- `qrCodeDataUrl`
- `updatedAt`

Status conhecidos:

- `idle`
- `connecting`
- `qr_ready`
- `connected`
- `reconnecting`
- `logged_out`
- `error`

### `GET /api/events`

SSE para acompanhar eventos de sessao.

Evento principal:

- `session`

Heartbeat:

- `heartbeat`

## 3. Endpoints da inbox

### `GET /api/inbox/chats`

Lista as conversas consolidadas.

### `GET /api/inbox/chats/:chatJid/messages`

Retorna:

- `chat`
- `messages`

Observacoes:

- mensagens de grupo retornam `participant`
- audios e imagens retornam `media`

### `GET /api/inbox/chats/:chatJid/details`

Retorna:

- `chat`
- `firstMessage`
- `labels`
- `availableLabels`

### `POST /api/inbox/chats/:chatJid/labels`

Acoes suportadas:

- `add`
- `remove`
- `create`

Comportamento:

- labels `whatsapp` usam gateway e sincronizacao
- labels `local` existem somente no sistema

### `GET /api/inbox/events`

SSE da inbox.

Evento principal:

- `inbox`

Usado para:

- atualizar lista de chats
- atualizar thread ativa
- atualizar drawer de detalhes

## 4. Endpoint de envio

### `POST /api/inbox/send`

### Envio de texto

Payload JSON:

```json
{
  "chatJid": "5511999999999@s.whatsapp.net",
  "text": "Ola"
}
```

### Envio de audio

Payload `multipart/form-data`:

- `chatJid`
- `audio`
- `durationSeconds`

O backend converte o audio para formato de voice note quando necessario.

## 5. Endpoint de midia

### `GET /api/media/:mediaId`

Serve o arquivo persistido com `Cache-Control` privado e imutavel.

## 6. Endpoints de health

- `GET /api/health`
- `GET /health`

## 7. Eventos internos relevantes

O gateway emite mudancas de inbox com `scope`, por exemplo:

- `history`
- `messages`
- `messages.update`
- `send`
- `send.audio`
- `labels.edit`
- `labels.association`
- `avatars`
- `media`

Esses eventos permitem refresh seletivo no frontend.

## 8. Recomendacao para integracao externa

Se um projeto PHP/Java quiser consumir o modulo sem incorporar a UI completa, os endpoints mais importantes sao:

1. `/api/session`
2. `/api/inbox/chats`
3. `/api/inbox/chats/:chatJid/messages`
4. `/api/inbox/chats/:chatJid/details`
5. `/api/inbox/send`

## 9. O que nao esta neste contrato

Ainda nao existe no template:

- autenticacao nativa de usuario do CRM
- RBAC do produto hospedeiro
- multi-tenant completo
- API publica versionada

Se isso for necessario para o produto host, crie uma camada de facade acima destas rotas.
