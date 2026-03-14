# Zap2 | Template WhatsApp Web

Zap2 e um template de WhatsApp Web para uso dentro de CRMs, ERPs, paineis internos e softwares de atendimento que precisem de uma camada real de conexao com WhatsApp.

Este projeto foi desenvolvido por Paulo Henrique e construido em cima de uma base personalizada sobre:

- Next.js 16
- React 19
- Baileys 6
- PostgreSQL 16
- FFmpeg

Importante: este repositorio nao usa Baileys de forma "crua". A biblioteca foi encapsulada por uma camada propria de gateway, persistencia, sincronizacao de labels, armazenamento de midia, transcodificacao de audio, enriquecimento de contatos e renderizacao estilo WhatsApp Web. Em outras palavras, a base foi adaptada para entregar mais usabilidade operacional e melhor previsibilidade de integracao.

## O que este template entrega

- Pareamento via QR Code em interface estilo WhatsApp Web
- Sessao persistida no servidor
- Lista de conversas e leitura de mensagens
- Envio de texto e audio
- Armazenamento local de midias
- Labels do WhatsApp e labels internas do sistema
- Drawer de detalhes do contato
- Identificacao de participantes em grupos
- Atualizacao em tempo real via Server-Sent Events

## Quando usar este template

Use este projeto quando voce precisar:

1. Criar um modulo de WhatsApp em um sistema novo
2. Introduzir uma nova tela de WhatsApp em um CRM ja existente
3. Reaproveitar a camada Node.js + Baileys como servico especializado para sistemas PHP, Java, .NET ou stacks sem runtime Node no backend principal

## Leitura recomendada

- [Documentacao principal](./docs/whatsapp-web-template/README.md)
- [Projeto novo](./docs/whatsapp-web-template/projeto-novo.md)
- [Projeto existente](./docs/whatsapp-web-template/projeto-existente.md)
- [Modos de integracao](./docs/whatsapp-web-template/modos-de-integracao.md)
- [Banco de dados](./docs/whatsapp-web-template/banco-de-dados.md)
- [API e eventos](./docs/whatsapp-web-template/api-e-eventos.md)
- [Guia para integracao guiada por IA](./docs/whatsapp-web-template/guia-para-ia.md)

## Se voce for uma IA, leia isto antes de tocar no codigo

Se voce e uma LLM, um agente de programacao ou qualquer IA usada para integrar este projeto em outro sistema, nao comece copiando arquivos.

Comece entendendo o projeto que vai receber este template.

O passo correto e:

1. analisar a stack atual do sistema host
2. descobrir qual backend ele usa
3. descobrir qual banco de dados ele usa
4. descobrir se ja existe autenticacao, autorizacao e ownership de clientes
5. decidir se esta integracao deve ser interna ou se este modulo deve rodar como servico isolado

Depois dessa leitura tecnica, a IA deve perguntar ao usuario o que nao pode ser inferido com seguranca:

1. voce quer a integracao em pasta/modulo isolado, que e o formato recomendado?
2. voce quer unificar esse codigo com o projeto principal sem perder nada do sistema atual?
3. qual nome a nova pagina deve ter no menu lateral: `Chat`, `WhatsApp` ou outro nome do produto?
4. o modulo vai rodar com os containers proprios do Zap2?
5. o modulo vai usar o banco atual do projeto ou um PostgreSQL dedicado?

Se o projeto host for novo, voce pode seguir a implantacao completa deste template, com PostgreSQL, tabelas `wa_*`, persistencia de credenciais e persistencia de midia.

Se o projeto host ja existir, primeiro analise o banco e a arquitetura antes de criar qualquer tabela ou mover qualquer codigo. Nao substitua estruturas do sistema principal sem necessidade. Adapte a integracao com cuidado.

Para CRM ou sistema grande ja em operacao, o caminho padrao recomendado e manter Zap2 em uma pasta/aplicacao dedicada dentro do workspace do cliente, por exemplo `apps/whatsapp`, `services/zap2` ou `integrations/zap2`, criar uma nova pagina `Chat` ou `WhatsApp` no menu lateral e rodar os containers do modulo sem misturar tudo no codigo central do CRM.

Em projetos PHP, Java, .NET ou stacks nao-Node, a estrategia normalmente correta nao e portar Baileys para dentro do backend principal. O caminho mais seguro costuma ser manter este modulo como servico Node.js especializado e integrar por rota, subdominio, reverse proxy, SSO e API.

Se estiver em duvida, leia primeiro:

- [Documentacao principal](./docs/whatsapp-web-template/README.md)
- [Projeto existente](./docs/whatsapp-web-template/projeto-existente.md)
- [Modos de integracao](./docs/whatsapp-web-template/modos-de-integracao.md)
- [Banco de dados](./docs/whatsapp-web-template/banco-de-dados.md)
- [Guia para integracao guiada por IA](./docs/whatsapp-web-template/guia-para-ia.md)

## Aviso arquitetural importante

Este template esta pronto para um caso de sessao principal (`session_key = 'primary'`), o que o torna excelente como base inicial e template funcional. Para uso multi-tenant ou multi-conta em CRMs maiores, a camada de sessao deve ser promovida para um modelo por empresa, por numero ou por canal.

Criado por Paulo Henrique 
