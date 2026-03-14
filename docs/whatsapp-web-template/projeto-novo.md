# Projeto novo | Como subir este template do zero

## 1. Quando usar este caminho

Use este fluxo quando o produto ainda vai nascer ou quando voce tem liberdade para definir infraestrutura, banco e organizacao do modulo.

## 2. Infraestrutura minima

Voce vai precisar de:

1. Node.js 22+
2. PostgreSQL 16+
3. FFmpeg instalado
4. persistencia em disco para:
   - `.auth/baileys`
   - `storage/media`
5. porta HTTP para expor a aplicacao

## 3. Stack base recomendada

- Frontend e backend: Next.js 16
- Banco: PostgreSQL
- Realtime: Server-Sent Events
- Filesystem: volume persistente
- Deploy: Docker Compose, container unico para app e outro para banco

## 4. Bootstrap recomendado

### Opcao A | Usar exatamente este template

1. clonar o projeto
2. instalar dependencias
3. subir PostgreSQL
4. definir `DATABASE_URL`
5. garantir FFmpeg
6. iniciar o app

### Opcao B | Reaproveitar como modulo dentro de um monorepo novo

1. criar um app Next.js
2. importar:
   - `src/whatsapp-gateway.js`
   - `src/whatsapp-singleton.js`
   - `src/lib/*`
   - `src/components/whatsapp-*`
   - `src/app/api/*` relacionados ao modulo
3. manter o banco PostgreSQL
4. manter volumes de auth e midia

## 5. Variaveis e diretorios obrigatorios

### Variavel principal

- `DATABASE_URL`

### Diretorios que devem persistir

- `.auth/baileys`
  - guarda credenciais da sessao do WhatsApp
- `storage/media`
  - guarda audios e imagens persistidos

Se esses caminhos nao persistirem entre reinicios:

- o QR podera precisar ser lido novamente
- a midia historica pode ser perdida

## 6. Banco de dados em projeto novo

Em projeto novo, o caminho mais limpo e deixar o proprio template criar as tabelas necessarias no PostgreSQL.

Tabelas criadas:

- `wa_sessions`
- `wa_contacts`
- `wa_chats`
- `wa_messages`
- `wa_media`
- `wa_labels`
- `wa_chat_labels`

Leitura detalhada: [Banco de dados](./banco-de-dados.md)

## 7. Fluxo funcional do modulo

1. usuario abre a pagina
2. frontend consulta `/api/session`
3. frontend assina `/api/events`
4. se a sessao nao estiver conectada, exibe QR
5. apos conectar, carrega inbox
6. inbox consome:
   - `/api/inbox/chats`
   - `/api/inbox/chats/:chatJid/messages`
   - `/api/inbox/chats/:chatJid/details`
   - `/api/inbox/events`
7. envio de mensagem usa `/api/inbox/send`

## 8. Estrutura de menu recomendada

Em produto novo, o modulo pode entrar como:

- `Atendimento > WhatsApp`
- `CRM > Inbox WhatsApp`
- `Canais > WhatsApp`

## 9. Checklists de implementacao

### Checklist tecnico

- banco PostgreSQL ativo
- `DATABASE_URL` configurada
- FFmpeg disponivel no ambiente
- volumes persistentes montados
- rota `/health` respondendo `200`
- QR code funcional
- inbox atualizando por SSE
- envio de texto funcional
- envio de audio funcional

### Checklist de produto

- rota protegida por autenticacao do produto
- menu visivel para perfis corretos
- nomenclatura da pagina ajustada ao dominio do cliente
- regras de acesso definidas
- plano de multi-sessao definido, se necessario

## 10. Ponto de atencao para crescimento

Se o sistema novo for multiempresa ou multiatendente, nao congele o design atual de `session_key = 'primary'`.

A adaptacao correta e transformar a sessao em entidade de dominio, por exemplo:

- `workspace_id`
- `company_id`
- `channel_id`
- `whatsapp_connection_id`

## 11. Recomendacao final para projeto novo

Se voce esta com liberdade total, nao simplifique demais a infraestrutura.

As quatro coisas que devem ser tratadas como obrigatorias desde o dia 1 sao:

1. PostgreSQL
2. persistencia de credenciais
3. persistencia de midia
4. modelo de sessao preparado para evoluir
