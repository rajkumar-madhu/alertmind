#!/usr/bin/env bash
# AlertMind ITSM — Cloud Agent start phase (runs on every boot).
#
# Starts Docker, applies the nested-Docker networking fix, brings up the
# core compose stack, waits for readiness, and restarts nginx so it
# re-resolves upstream container IPs.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Core services (Flowise/n8n are optional and intentionally omitted).
CORE_SERVICES="db redis keycloak opa api celery_worker celery_beat web nginx"

# 1. Docker daemon.
bash scripts/dev/docker-daemon.sh

# 2. Nested-Docker networking fix.
#    In this nested VM, Docker cannot fully program the bridge FORWARD/NAT
#    rules, which breaks same-bridge container-to-container traffic
#    (api<->db<->keycloak<->opa and nginx->api). Disabling bridge netfilter
#    lets that traffic pass at L2 while host port mappings (DNAT) still work.
sudo modprobe br_netfilter 2>/dev/null || true
sudo sysctl -w net.bridge.bridge-nf-call-iptables=0 net.bridge.bridge-nf-call-ip6tables=0 >/dev/null 2>&1 || true

# 3. Ensure .env exists (install normally creates it; this is a safety net).
[ -f .env ] || cp scripts/dev/dev.env .env

# 4. Bring the core stack up (idempotent; will not duplicate containers).
echo "[start] docker compose up (core services)"
docker compose up -d $CORE_SERVICES

# 5. Wait for API health.
echo "[start] waiting for API health (http://localhost:4000/api/health/)..."
for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api/health/ 2>/dev/null || true)
  if [ "$code" = "200" ]; then echo "[start] API healthy"; break; fi
  sleep 3
done

# 6. Wait for the Keycloak realm to finish importing.
echo "[start] waiting for Keycloak realm..."
for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' \
    http://localhost:8088/auth/realms/alertmind/.well-known/openid-configuration 2>/dev/null || true)
  if [ "$code" = "200" ]; then echo "[start] Keycloak realm ready"; break; fi
  sleep 5
done

# 7. Restart nginx so it re-resolves api/web/keycloak upstream IPs. Compose does
#    not gate nginx on Keycloak readiness, so nginx can otherwise cache a stale
#    upstream IP at first boot and return 502/504 for /auth and /api.
docker compose restart nginx

echo "[start] stack is up:"
docker compose ps --format 'table {{.Name}}\t{{.Status}}' 2>/dev/null || true
echo "[start] app:      http://localhost:8090"
echo "[start] api:      http://localhost:4000/api/health/"
echo "[start] keycloak: http://localhost:8088/auth  (demo: admin@alertmind.ai / Admin@2026)"
