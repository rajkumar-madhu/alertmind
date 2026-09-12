#!/usr/bin/env bash
# Create AlertMind's cluster secrets imperatively (idempotent).
# NEVER commit real values. Override by exporting env vars before running.
#
# Why this exists: k8s/base/secret.yaml used to carry LIVE credentials and was applied
# by the kustomization, which violated the cluster-wide "never commit live secrets"
# rule in /root/CLAUDE.md. The manifest is gone; `secret.example.yaml` documents the
# shape and this script creates the real thing. `apply -k` no longer manages
# alertmind-secrets, so this must run BEFORE the first `kubectl apply -k`.
#
# Default behaviour:
#   - If a secret already exists and you passed no env overrides, leave it alone.
#   - New installs generate random passwords unless you export them.
#
# Flags:
#   --rotate / --force   Recreate secrets even if they exist (uses env or fresh random)
#   --print              Print the values used (careful on shared terminals)
#   --status             Show which secrets exist, print nothing sensitive
#   --dry-run            Show what would be created, write nothing
set -euo pipefail

NS="${NS:-alertmind}"
ROTATE=0
PRINT=0
STATUS=0
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --rotate|--force) ROTATE=1 ;;
    --print)          PRINT=1 ;;
    --status)         STATUS=1 ;;
    --dry-run)        DRY_RUN=1 ;;
    --help|-h)
      cat <<'EOF'
Usage: ./create-secrets.sh [--rotate] [--print] [--status] [--dry-run]

Creates, in namespace alertmind:
  alertmind-secrets   POSTGRES_PASSWORD / DATABASE_URL / JWT_SECRET / WEBHOOK_SECRET /
                      FLOWISE_PASS / N8N_PASS / SLACK_WEBHOOK_URL / SMTP_* (blank unless exported)
  alertmind-llm       api-key  — the LLM provider key (xAI/Grok by default)

Env overrides (optional):
  POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB JWT_SECRET WEBHOOK_SECRET
  FLOWISE_PASS N8N_PASS SLACK_WEBHOOK_URL
  SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS
  LLM_API_KEY
EOF
      exit 0
      ;;
    *) echo "Unknown arg: $arg" >&2; exit 1 ;;
  esac
done

secret_exists() { kubectl -n "$NS" get secret "$1" >/dev/null 2>&1; }

if [[ $STATUS -eq 1 ]]; then
  for s in alertmind-secrets alertmind-llm; do
    if secret_exists "$s"; then
      n=$(kubectl -n "$NS" get secret "$s" -o go-template='{{len .data}}')
      echo "  $s: present ($n keys)"
    else
      echo "  $s: MISSING"
    fi
  done
  exit 0
fi

rand() { openssl rand -base64 24 | tr -d '/+=' | head -c 32; }

kubectl get namespace "$NS" >/dev/null 2>&1 || kubectl create namespace "$NS"

POSTGRES_USER="${POSTGRES_USER:-alertmind}"
POSTGRES_DB="${POSTGRES_DB:-alertmind}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(rand)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-$(rand)}"
FLOWISE_PASS="${FLOWISE_PASS:-$(rand)}"
N8N_PASS="${N8N_PASS:-$(rand)}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
SMTP_HOST="${SMTP_HOST:-}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"

# postgresql.yaml runs the DB in-cluster as Service `postgresql` on 5432.
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgresql:5432/${POSTGRES_DB}"

if secret_exists alertmind-secrets && [[ $ROTATE -eq 0 ]]; then
  echo "==> alertmind-secrets already exists — leaving it alone (--rotate to replace)"
elif [[ $DRY_RUN -eq 1 ]]; then
  echo "==> would create secret/alertmind-secrets in $NS (14 keys)"
else
  kubectl -n "$NS" create secret generic alertmind-secrets \
    --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
    --from-literal=DATABASE_URL="$DATABASE_URL" \
    --from-literal=JWT_SECRET="$JWT_SECRET" \
    --from-literal=WEBHOOK_SECRET="$WEBHOOK_SECRET" \
    --from-literal=SUPABASE_URL="" \
    --from-literal=SUPABASE_SERVICE_KEY="" \
    --from-literal=SUPABASE_ANON_KEY="" \
    --from-literal=SLACK_WEBHOOK_URL="$SLACK_WEBHOOK_URL" \
    --from-literal=SMTP_HOST="$SMTP_HOST" \
    --from-literal=SMTP_PORT="$SMTP_PORT" \
    --from-literal=SMTP_USER="$SMTP_USER" \
    --from-literal=SMTP_PASS="$SMTP_PASS" \
    --from-literal=FLOWISE_PASS="$FLOWISE_PASS" \
    --from-literal=N8N_PASS="$N8N_PASS" \
    --dry-run=client -o yaml | kubectl apply -f -
  echo "==> alertmind-secrets created/updated"
fi

# Existing clusters created alertmind-secrets before WEBHOOK_SECRET existed.
# Merge the key without rotating DATABASE_URL / JWT_SECRET.
if secret_exists alertmind-secrets; then
  has_wh=$(kubectl -n "$NS" get secret alertmind-secrets -o jsonpath='{.data.WEBHOOK_SECRET}' 2>/dev/null || true)
  if [[ -z "$has_wh" || $ROTATE -eq 1 ]]; then
    if [[ $DRY_RUN -eq 1 ]]; then
      echo "==> would set WEBHOOK_SECRET on alertmind-secrets"
    else
      kubectl -n "$NS" patch secret alertmind-secrets --type merge \
        -p "{\"stringData\":{\"WEBHOOK_SECRET\":\"${WEBHOOK_SECRET}\"}}"
      echo "==> WEBHOOK_SECRET set on alertmind-secrets"
    fi
  fi
fi

# The LLM key is deliberately a separate Secret: api.yaml/celery.yaml mount it with
# optional: true, so the manifests still apply on a cluster that has no key yet.
if [[ -n "${LLM_API_KEY:-}" ]]; then
  if secret_exists alertmind-llm && [[ $ROTATE -eq 0 ]]; then
    echo "==> alertmind-llm already exists — leaving it alone (--rotate to replace)"
  elif [[ $DRY_RUN -eq 1 ]]; then
    echo "==> would create secret/alertmind-llm in $NS"
  else
    kubectl -n "$NS" create secret generic alertmind-llm \
      --from-literal=api-key="$LLM_API_KEY" \
      --dry-run=client -o yaml | kubectl apply -f -
    echo "==> alertmind-llm created/updated"
  fi
else
  secret_exists alertmind-llm \
    || echo "==> LLM_API_KEY not set and alertmind-llm missing — generation will fall back to Ollama"
fi

if [[ $PRINT -eq 1 && $DRY_RUN -eq 0 ]]; then
  echo
  echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
  echo "JWT_SECRET=$JWT_SECRET"
  echo "WEBHOOK_SECRET=$WEBHOOK_SECRET"
  echo "FLOWISE_PASS=$FLOWISE_PASS"
  echo "N8N_PASS=$N8N_PASS"
fi
