# Guia para integracao guiada por IA

## 1. Objetivo deste guia

Este documento existe para orientar uma IA de programacao ou um desenvolvedor assistido por IA a integrar o template Zap2 em outro sistema sem destruir a arquitetura do sistema hospedeiro.

Se voce for uma IA lendo este repositorio em busca de contexto, trate este documento como sua leitura obrigatoria antes de propor qualquer mudanca.

## 2. Regra principal

A IA nao deve assumir que pode simplesmente copiar todos os arquivos para dentro do projeto host.

Ela deve primeiro analisar o projeto host e responder estas perguntas:

1. O sistema host usa Node.js no backend?
2. O sistema host usa PostgreSQL?
3. O modulo de WhatsApp sera embutido ou rodara como servico separado?
4. O sistema host ja possui autenticacao, permissoes e ownership de clientes?
5. O sistema precisa de multi-sessao?

Depois dessa analise tecnica, a IA deve confirmar com o usuario as preferencias que mudam a arquitetura final.

Perguntas obrigatorias:

1. voce quer o formato recomendado em pasta/modulo isolado?
2. voce quer unificar esse codigo com o projeto principal sem perder nada dos dois projetos?
3. qual nome deve aparecer no menu lateral: `Chat`, `WhatsApp` ou outro?
4. o modulo vai subir com os containers proprios do Zap2?
5. o banco sera o atual do sistema ou um PostgreSQL dedicado para o modulo?

## 3. Fluxo recomendado para a IA

### Etapa 1 | Classificar o cenario

Classificar em um destes grupos:

- projeto novo
- projeto existente Node.js + PostgreSQL
- projeto existente Node.js sem PostgreSQL
- projeto existente PHP/Java/.NET

Antes de classificar, a IA deve olhar o projeto real. Ela precisa inspecionar:

- estrutura de pastas
- dependencias
- framework backend
- framework frontend
- modelo de autenticacao
- modelo de banco
- infraestrutura de deploy

### Etapa 2 | Escolher a estrategia

Se o host for projeto existente e nao houver pedido explicito de unificacao profunda:

- preferir pasta/modulo isolado
- criar nova pagina `Chat` ou `WhatsApp` no menu lateral
- manter os containers do Zap2

Se o host for Node.js + PostgreSQL:

- integrar diretamente e adaptar boundaries

Se o host for nao-Node:

- recomendar sidecar Node.js

Se o host nao tiver PostgreSQL:

- recomendar PostgreSQL dedicado para o modulo ou reescrita explicita da camada de dados

### Etapa 3 | Mapear pontos de adaptacao

A IA deve mapear:

- tela que recebera o modulo
- local exato da pasta/modulo no workspace do cliente
- mecanismo de autenticacao
- ownership de sessao
- relacao entre conversa e entidade do CRM
- estrategia de banco
- estrategia de deploy

### Etapa 4 | Executar adaptacoes

Adaptacoes minimas:

- auth
- permissao
- menu
- banco
- rotas
- storage persistente

## 4. Decisoes que a IA nao deve esconder

### Banco

O schema atual e PostgreSQL-specific.

A IA deve deixar claro quando estiver:

- reaproveitando PostgreSQL
- criando banco dedicado
- propondo reescrita para outro SGDB

### Runtime

Baileys exige Node.js.

A IA nao deve prometer integracao nativa dentro de PHP ou Java sem uma camada Node responsavel pela conexao com WhatsApp.

### Multi-sessao

O template atual parte de `primary`.

A IA deve sinalizar que CRM multiempresa precisa evoluir isso.

## 5. Checklist para a IA antes de implementar

- identificou a stack do host
- identificou o banco do host
- definiu embed vs sidecar
- confirmou com o usuario se a preferencia e pasta/modulo isolado ou unificacao
- definiu estrategia de auth
- definiu ownership da sessao
- definiu se mantera PostgreSQL dedicado
- identificou a rota/pagina que recebera o modulo

## 6. Prompt base recomendado para a IA integradora

```text
Integre o template Zap2 WhatsApp Web no sistema host respeitando a stack atual.
Antes de modificar qualquer arquivo:
1. classifique o host como Node/Next ou nao-Node
2. verifique o banco existente
3. pergunte ao usuario se ele quer o formato recomendado em pasta/modulo isolado ou se quer unificacao profunda
4. proponha como padrao uma pasta dedicada para o modulo e uma nova pagina `Chat` ou `WhatsApp` no menu lateral
5. preserve boundaries de autenticacao, banco e ownership
6. se o host nao usar PostgreSQL, recomende banco dedicado para o modulo em vez de port simplista
7. trate o modulo WhatsApp como contexto proprio
8. se houver multiempresa, nao use session_key fixa
```

## 7. Prompt para projeto novo

```text
Use Zap2 como base de um modulo WhatsApp em projeto novo.
Mantenha PostgreSQL, FFmpeg, persistencia de credenciais, persistencia de midia e prepare o design para evolucao de session_key.
```

## 8. Prompt para projeto existente Next.js

```text
Integre Zap2 no projeto Next.js existente sem espalhar logica por pastas genericas.
Primeiro confirme com o usuario se ele quer o formato recomendado em pasta/modulo isolado.
Crie um contexto/modulo de WhatsApp, preserve route handlers e isole a camada de gateway, store e componentes.
Crie uma nova pagina `Chat` ou `WhatsApp` no menu lateral e adapte auth, menu e banco do host.
```

## 9. Prompt para projeto existente PHP ou Java

```text
Integre Zap2 como servico Node.js especializado em WhatsApp.
Nao tente portar Baileys para o backend host.
Pergunte ao usuario se ele quer o modulo em pasta dedicada com containers proprios, que e o formato recomendado.
Modele a integracao por pagina embutida, reverse proxy, SSO e consumo de API.
Crie uma nova pagina `Chat` ou `WhatsApp` no menu lateral do sistema host.
Defina como o sistema host vai autenticar o usuario e mapear ownership da sessao e das conversas.
```

## 10. Regra final

Uma boa IA integradora nao tenta "encaixar" tudo no sistema hospedeiro.

Ela preserva a responsabilidade tecnica do modulo e adapta apenas o que realmente precisa ser adaptado.

Criado por amor por Paulo Henrique de Novidou.
