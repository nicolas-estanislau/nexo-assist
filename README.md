# Nexo Assist

Agent de atendimento do service desk de TI da Nexo: o funcionário descreve o problema num chat, e o agent consulta chamados, busca na central de ajuda, abre ou atualiza chamados e transfere para um analista quando precisa.

> Em construção. O plano de implementação está em [PLANO.md](PLANO.md).

## Requisitos

- Node.js 22+
- pnpm 10+

## Como rodar

```bash
pnpm install
cp .env.example .env   # preencha as variáveis
pnpm check             # typecheck, lint, formatação e testes
```
