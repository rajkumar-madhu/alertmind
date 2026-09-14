#!/usr/bin/env bash
# Start the Docker daemon if it is not already running, and make the socket
# usable by the current (non-root) user. Safe to call repeatedly (idempotent).
#
# Cloud Agent VMs boot without a running dockerd, so both the install and start
# phases call this before invoking `docker`/`docker compose`.
set -euo pipefail

if sudo docker info >/dev/null 2>&1; then
  sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
  exit 0
fi

echo "[docker] starting dockerd"
sudo mkdir -p /var/log
sudo sh -c 'nohup dockerd >/var/log/dockerd.log 2>&1 &'

for _ in $(seq 1 60); do
  if sudo docker info >/dev/null 2>&1; then
    sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
    echo "[docker] daemon ready"
    exit 0
  fi
  sleep 1
done

echo "[docker] ERROR: dockerd did not become ready within 60s" >&2
sudo tail -n 20 /var/log/dockerd.log >&2 || true
exit 1
