#!/usr/bin/env bash
# Configura os segredos dos dois apps no Fly, sem mostrar nenhum valor na tela.
# - TICKETS_API_TOKEN e SESSION_SECRET: gerados aqui, aleatórios.
# - ANTHROPIC_API_KEY: lida do .env local.
# Uso (na raiz do repositório): bash scripts/fly-secrets.sh
set -euo pipefail

WEB_APP="${WEB_APP:-nexo-assist-web}"
TICKETS_APP="${TICKETS_APP:-nexo-assist-tickets}"

random() { node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"; }

ANTHROPIC_API_KEY="$(grep -E '^ANTHROPIC_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d '\r"')"
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "ANTHROPIC_API_KEY não encontrada no .env." >&2
  exit 1
fi

TOKEN="$(random)"
fly secrets set --stage -a "$TICKETS_APP" "TICKETS_API_TOKEN=$TOKEN" >/dev/null
fly secrets set --stage -a "$WEB_APP" \
  "TICKETS_API_TOKEN=$TOKEN" \
  "SESSION_SECRET=$(random)" \
  "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" >/dev/null
echo "Segredos configurados em $TICKETS_APP e $WEB_APP (aplicados no próximo deploy)."
