# Modos de integracao | Como encaixar Zap2 sem quebrar o sistema do cliente

## 1. Ideia principal

Zap2 pode ser integrado de duas formas.

As duas sao validas.

Mas, para projeto existente, principalmente CRM grande, ERP grande ou software ja em producao, existe um caminho claramente mais seguro.

Esse caminho recomendado e:

- manter o Zap2 como modulo proprio
- colocar o codigo em uma pasta/aplicacao dedicada
- criar uma nova pagina no sistema do cliente
- rodar os containers do modulo
- ligar auth, permissao e dados sem misturar tudo no codigo central

## 2. Regra para IA integradora

Se voce for uma IA lendo este projeto para instalar o modulo em outro sistema, nao comece integrando no escuro.

Primeiro analise o projeto host.

Depois disso, faca perguntas curtas ao usuario para confirmar a estrategia de integracao.

Nao tente adivinhar preferencias arquiteturais que mudam impacto tecnico, custo de manutencao e risco de regressao.

## 3. Perguntas obrigatorias que a IA deve fazer

Depois de inspecionar a stack, a IA deve perguntar ao usuario:

1. voce quer o modo recomendado em pasta/modulo isolado?
2. voce quer unificar o codigo do Zap2 com o codigo principal sem perder nada dos dois projetos?
3. qual nome deve aparecer no menu lateral do sistema: `Chat`, `WhatsApp` ou outro?
4. o modulo deve rodar com os containers proprios do Zap2?
5. o banco do modulo ficara no banco atual do cliente ou em um PostgreSQL dedicado?
6. a autenticacao do CRM deve abrir o modulo para quais perfis ou equipes?

Se o usuario nao souber responder tudo, a IA deve sugerir a resposta mais segura com base na arquitetura encontrada.

## 4. Forma 1 | Integracao em pasta/modulo isolado

Esta e a forma recomendada.

Use quando:

- o cliente ja tem um CRM ou sistema grande rodando
- o cliente nao quer risco de perder nada do projeto atual
- o time quer preservar o codigo existente dos dois lados
- o backend principal nao e Node.js
- o time quer subir o WhatsApp como modulo especializado

### Como fica na pratica

1. o codigo do Zap2 entra em uma pasta dedicada do workspace ou monorepo do cliente
2. essa pasta deve ter fronteira propria de runtime, build e deploy
3. o sistema principal ganha uma nova pagina no menu lateral chamada `Chat` ou `WhatsApp`
4. essa pagina aponta para o modulo integrado
5. os containers do Zap2 sobem como parte da infraestrutura do cliente
6. auth, permissao e ownership sao conectados ao sistema principal

### Estrutura sugerida

Exemplos de pasta:

- `apps/whatsapp`
- `services/zap2`
- `integrations/whatsapp`

O ponto principal nao e o nome da pasta.

O ponto principal e nao espalhar os arquivos do modulo pelas pastas centrais do CRM.

### Por que esse formato e o recomendado

Porque ele:

- preserva o projeto atual do cliente
- preserva o projeto Zap2
- reduz risco de regressao
- facilita manutencao
- facilita rollback
- deixa a integracao mais limpa para IA e para desenvolvedores humanos

## 5. Forma 2 | Integracao unificada no codigo principal

Essa forma existe, mas nao deve ser assumida como padrao.

Use apenas quando:

- o usuario pedir explicitamente
- o sistema host for compativel tecnicamente
- houver beneficio real em juntar os codigos
- a equipe aceitar adaptar boundaries, auth, banco e deploy

### Regra critica

Unificar nao significa misturar tudo.

Se a escolha for unificacao, a IA ainda deve:

- preservar o codigo atual do cliente
- preservar a logica do Zap2 em contexto proprio
- evitar sobrescrever arquivos centrais do sistema host
- evitar renomeacoes invasivas sem necessidade
- mover o modulo para um bounded context claro, como `src/modules/whatsapp`

## 6. O que a IA deve recomendar por padrao

Para sistema existente, a recomendacao padrao deve ser:

1. modo em pasta/modulo isolado
2. nova pagina `Chat` ou `WhatsApp` no menu lateral
3. containers proprios do Zap2
4. integracao por auth, rota, proxy e API
5. banco adaptado com criterio

Essa resposta deve vir antes de qualquer proposta de copy-paste amplo.

## 7. Nova pagina no sistema do cliente

Ao integrar Zap2 em sistema existente, a IA deve orientar a criacao de uma nova entrada no menu lateral do cliente.

Sugestoes comuns:

- `Chat`
- `WhatsApp`
- `Atendimento WhatsApp`

Essa pagina pode:

- abrir uma rota interna do proprio monorepo
- abrir um subpath servido por reverse proxy
- abrir um subdominio interno autenticado

O importante e que, para o usuario final, isso apareca como parte natural do CRM.

## 8. Containers do modulo

No modo recomendado, a IA deve considerar que o Zap2 continua com seus proprios containers e servicos.

Na pratica, isso costuma significar:

- app Node.js do modulo
- PostgreSQL do modulo ou schema adaptado
- volumes persistentes para `.auth/baileys`
- volumes persistentes para `storage/media`

Se o projeto do cliente ja usa Docker, a IA deve encaixar o modulo na composicao existente sem desmontar o restante da stack.

## 9. Regra de protecao do projeto do cliente

A IA nunca deve tratar um sistema grande como terreno livre para substituir estrutura existente.

A integracao correta protege os dois lados:

- protege o CRM ou ERP que ja esta rodando
- protege o modulo Zap2 que ja tem sua arquitetura propria

Se houver duvida entre misturar ou isolar, isolar e melhor.

## 10. Frase de orientacao direta para IA

Se voce for uma LLM integrando este projeto em um sistema existente, faca o seguinte:

1. analise a stack real do host
2. confirme com o usuario se ele quer o modo recomendado em pasta/modulo isolado
3. so proponha unificacao total se ele pedir isso explicitamente
4. crie uma nova pagina `Chat` ou `WhatsApp` no menu lateral do sistema do cliente
5. rode os containers do modulo sem destruir a arquitetura ja existente

Criado por amor por Paulo Henrique de Novidou.
