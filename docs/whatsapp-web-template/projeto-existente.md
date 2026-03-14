# Projeto existente | Como introduzir o template em sistemas ja rodando

## 1. Ponto principal

Projeto existente exige uma decisao arquitetural antes de qualquer copy-paste.

A pergunta correta nao e "como colar esse codigo no sistema?".

A pergunta correta e:

"Qual fronteira de integracao preserva melhor o sistema host?"

Na maioria dos casos, a resposta mais segura sera:

"colocar Zap2 em uma pasta/modulo proprio, conectar ao sistema atual e criar uma nova pagina `Chat` ou `WhatsApp` no menu lateral."

## 1.1 Perguntas que a IA deve fazer ao usuario

Mesmo depois de analisar o codigo, existem decisoes que precisam ser confirmadas.

A IA deve perguntar:

- voce quer o formato recomendado em pasta/modulo isolado?
- voce quer unificar esse codigo com o projeto principal sem perder nada do que ja existe?
- qual nome deve aparecer no menu lateral: `Chat`, `WhatsApp` ou outro?
- o modulo vai subir com os containers proprios do Zap2?
- o banco sera adaptado no banco atual ou sera usado um PostgreSQL dedicado?

## 2. Matriz de decisao

### Caso A | Sistema host ja usa Next.js / Node.js

Recomendacao:

- integrar o modulo no mesmo repositorio
- manter a camada de WhatsApp isolada por contexto
- adaptar rotas, auth e banco

### Caso B | Sistema host usa PostgreSQL, mas nao e Next.js

Recomendacao:

- preferir rodar o modulo como servico isolado
- integrar por URL interna, reverse proxy, SSO e consumo de API

### Caso C | Sistema host usa PHP, Java, .NET ou outro backend nao-Node

Recomendacao forte:

- nao portar Baileys para o backend host
- manter este template como servico Node.js dedicado
- integrar visualmente e funcionalmente o modulo ao produto principal

Essa e a decisao mais segura.

## 3. Por que o sidecar/servico dedicado e a melhor estrategia em PHP e Java

Porque a implementacao atual depende de:

- runtime Node.js
- Baileys
- filesystem local
- SSE
- FFmpeg
- semantica SQL de PostgreSQL

Tentar migrar isso para PHP ou Java dentro do backend principal gera:

- mais acoplamento
- mais risco de regressao
- mais custo de manutencao
- retrabalho desnecessario

## 4. Duas formas validas de integrar

### Forma 1 | Integracao em pasta/modulo isolado

Esta e a forma recomendada para projeto existente.

Use se o host for CRM, ERP ou software maduro e o usuario quiser preservar os dois lados da integracao.

Nesse formato:

1. o codigo do Zap2 entra em uma pasta dedicada, como `apps/whatsapp`, `services/zap2` ou `integrations/whatsapp`
2. os containers do proprio modulo continuam existindo
3. o sistema host ganha uma nova pagina no menu lateral chamada `Chat` ou `WhatsApp`
4. auth, permissao e ownership sao conectados ao sistema principal
5. o restante do CRM continua intacto

### Forma 2 | Integracao interna no mesmo app

Use se o host for Next.js/Node e o time aceitar incorporar:

- componentes React
- route handlers
- gateway singleton
- store PostgreSQL

### Forma 2 | Integracao por modulo externo

Use se o host for PHP, Java, Laravel, Spring, .NET, Rails ou stack mista.

Nesse formato:

1. o sistema principal autentica o usuario
2. o modulo Zap2 recebe contexto seguro
3. a tela de WhatsApp entra como pagina embutida, subrota ou subdominio
4. a troca de dados com o sistema host ocorre por API

## 5. Como adaptar para projeto existente com banco de dados ja pronto

### Se o banco existente ja for PostgreSQL

Voce tem duas opcoes:

1. criar as tabelas `wa_*` dentro do mesmo banco
2. criar um schema separado, por exemplo `whatsapp`

A melhor opcao em produto maduro costuma ser:

- mesmo banco
- schema separado
- nomenclatura clara

### Se o banco existente nao for PostgreSQL

Aqui precisa de rigor.

O projeto atual usa SQL e tipos especificos de PostgreSQL, como:

- `jsonb`
- `timestamptz`
- `ON CONFLICT`
- operadores de merge em JSON

Entao existem duas rotas possiveis:

1. manter um PostgreSQL dedicado para o modulo WhatsApp
2. reescrever a camada de persistencia para o banco host

Recomendacao pratica:

- para ganhar velocidade e reduzir risco, mantenha PostgreSQL dedicado

## 6. Como introduzir a tela no sistema host

### Em projeto Next.js

- preferir uma pasta/aplicacao dedicada do contexto WhatsApp dentro do workspace
- se a integracao for realmente interna, mover componentes e rotas para um bounded context tipo `src/modules/whatsapp`
- adaptar auth
- adaptar layout
- adaptar rotas
- manter isolamento do gateway e store

### Em projeto PHP / Laravel

- subir Zap2 como servico Node independente
- publicar a tela via subdominio interno ou reverse proxy
- autenticar por token assinado, SSO ou sessao compartilhada via gateway do host
- opcionalmente abrir o modulo em iframe somente se politica de seguranca permitir

### Em projeto Java / Spring

- mesma recomendacao do sidecar Node
- usar reverse proxy interno
- compartilhar identidade do usuario por JWT, header assinado ou sessao centralizada

## 7. O que o desenvolvedor ou a IA precisa adaptar

### Autenticacao

O template nao conhece usuario do CRM.

Voce precisa:

- proteger a rota da pagina
- mapear permissao
- opcionalmente registrar auditoria de acesso

### Multiempresa / multicanal

Hoje o template opera bem como base single-session.

Em CRM real, adapte:

- `session_key`
- ownership das conversas
- permissao por agente
- filtros por equipe

### Banco

Precisa decidir:

- mesmo banco vs banco dedicado
- mesmo schema vs schema separado
- estrategia de backup de credenciais e midias

### UI

Precisa decidir:

- pagina inteira
- aba do CRM
- modulo interno
- microfrontend

## 8. Estrategia recomendada por cenario

### Cenario 1 | CRM Next.js + PostgreSQL

Melhor caminho:

- incorporar diretamente
- manter o contexto WhatsApp em pasta propria
- criar schema ou prefixo `wa_*`

### Cenario 2 | CRM Laravel + MySQL

Melhor caminho:

- manter Zap2 como servico Node + PostgreSQL
- integrar via tela embutida e API

### Cenario 3 | CRM Spring Boot + Oracle

Melhor caminho:

- manter Zap2 como servico isolado
- nao tentar portar persistencia logo no inicio

## 9. Checklist de integracao em projeto existente

### Checklist arquitetural

- perguntar ao usuario se ele quer modo pasta/modulo isolado ou unificacao
- definir se a integracao sera embed, pasta dedicada ou sidecar
- definir ownership da sessao WhatsApp
- definir estrategia de auth
- definir estrategia de banco
- definir estrategia de deploy

### Checklist tecnico

- criar ou mapear a nova pagina `Chat` ou `WhatsApp` no menu do host
- decidir em qual pasta/modulo o Zap2 ficara dentro do workspace do cliente
- mapear storage persistente
- mapear observabilidade e logs
- mapear backup de `.auth` e `storage/media`
- validar latencia e politica de reverse proxy

### Checklist de produto

- definir nomenclatura do modulo
- definir perfis com acesso
- definir relacao entre WhatsApp e entidades do CRM
- definir se labels internas serao sincronizadas com regras de negocio do host

## 10. Regra pratica para quem esta integrando

Se o sistema host nao for Node.js, trate este projeto como modulo especializado e nao como trecho de codigo para espalhar dentro do monolito.

Essa decisao e tecnicamente mais limpa e operacionalmente mais barata.
