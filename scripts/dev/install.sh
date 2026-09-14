#!/usr/bin/env bash
# AlertMind ITSM — Cloud Agent install phase.
#
# Durable, idempotent setup that is baked into the environment build snapshot:
# installs Docker + Compose, generates the local .env, builds the React SPA
# bundle (frontend/Dockerfile bakes ./dist), and builds/pulls the container
# images so the start phase can bring the stack up quickly.
#
# Per-boot runtime steps (starting services) live in scripts/dev/start.sh.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
echo "[install] repo root: $REPO_ROOT"

# Core services for the dev stack. Flowise and n8n are optional (their nginx
# routes are commented out — "core-only local run"), so we skip them to keep
# the environment lean and reliable.
CORE_THIRD_PARTY="db redis keycloak opa nginx"

# 1. System packages (idempotent).
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "[install] installing docker.io + docker-compose-v2"
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2
fi

# 2. Ensure the Docker daemon is running (needed to build/pull images).
bash scripts/dev/docker-daemon.sh

# 3. Generate the local .env (never clobber an existing one).
if [ ! -f .env ]; then
  echo "[install] creating .env from scripts/dev/dev.env"
  cp scripts/dev/dev.env .env
fi

# 4. Build the React SPA bundle. frontend/Dockerfile just COPYs ./dist, so the
#    bundle must exist before the web image is built.
echo "[install] building frontend bundle (npm ci && npm run build)"
( cd frontend && npm ci && npm run build )

# 5. Build first-party images and pre-pull core third-party images.
echo "[install] building api + web images"
docker compose build api web
echo "[install] pulling third-party images: $CORE_THIRD_PARTY"
docker compose pull $CORE_THIRD_PARTY

echo "[install] done"
