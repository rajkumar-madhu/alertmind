#!/usr/bin/env bash
# Start the Docker daemon if it is not already running, and make the socket
# usable by the current (non-root) user. Safe to call repeatedly (idempotent).
#
# Cloud Agent VMs boot without a running dockerd, so both the install and start
# phases call this before invoking `docker`/`docker compose`.
#
# Nested-VM storage: these pods run Docker inside an overlay filesystem, and
# BuildKit's default containerd-overlayfs cache mounts fail there with
# "mount ... overlay ... invalid argument" (overlay-on-overlay). We therefore
# run the daemon on the userspace `fuse-overlayfs` driver with the containerd
# image store disabled, which works for both image pulls and `docker build`.
set -euo pipefail

if sudo docker info >/dev/null 2>&1; then
  sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
  exit 0
fi

# Ensure fuse-overlayfs is available.
if ! command -v fuse-overlayfs >/dev/null 2>&1; then
  echo "[docker] installing fuse-overlayfs"
  sudo apt-get update -y
  # --force-confold: fuse3 ships an /etc/fuse.conf conffile that otherwise
  # triggers an interactive prompt and breaks the noninteractive install.
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    -o Dpkg::Options::=--force-confold -o Dpkg::Options::=--force-confdef \
    fuse-overlayfs
fi

# Configure the daemon storage driver (only write a default if none exists).
sudo mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  echo "[docker] writing /etc/docker/daemon.json (fuse-overlayfs)"
  printf '%s\n' '{ "storage-driver": "fuse-overlayfs", "features": { "containerd-snapshotter": false } }' \
    | sudo tee /etc/docker/daemon.json >/dev/null
fi

echo "[docker] starting dockerd"
sudo mkdir -p /var/log
sudo sh -c 'nohup dockerd >/var/log/dockerd.log 2>&1 &'

for _ in $(seq 1 60); do
  if sudo docker info >/dev/null 2>&1; then
    sudo chmod 666 /var/run/docker.sock 2>/dev/null || true
    echo "[docker] daemon ready (storage: $(sudo docker info -f '{{.Driver}}' 2>/dev/null))"
    exit 0
  fi
  sleep 1
done

echo "[docker] ERROR: dockerd did not become ready within 60s" >&2
sudo tail -n 20 /var/log/dockerd.log >&2 || true
exit 1
