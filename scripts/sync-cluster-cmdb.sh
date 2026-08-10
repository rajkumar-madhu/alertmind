#!/usr/bin/env bash
# Populate AlertMind's CMDB from the live wecrew cluster.
#
# Discovers real configuration items with kubectl, then upserts them into
# `cmdb_items` inside the api pod. Gives incidents a real `affected_ci` to point at
# instead of free text.
#
#   ./sync-cluster-cmdb.sh                  # sync the default namespaces
#   ./sync-cluster-cmdb.sh --dry-run        # print what would be written
#   NAMESPACES="alertmind n8n" ./sync-cluster-cmdb.sh
#
# Idempotent: items are keyed by name, so re-running updates rather than duplicating.
# Items previously synced from the cluster that have since disappeared are marked
# status=decommissioned rather than deleted — CMDB history is worth keeping.
set -euo pipefail

NS="${NS:-alertmind}"
NAMESPACES="${NAMESPACES:-alertmind wecrew n8n hermes harbor keycloak wecrew-ops}"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

ITEMS="$(mktemp -t cmdb-items.XXXXXX.json)"
trap 'rm -f "$ITEMS"' EXIT

# Map a workload to a CMDB type using its image/name — a rough but useful heuristic.
classify() {
  case "$1" in
    *postgres*|*mysql*|*mariadb*|*clickhouse*)      echo database ;;
    *redis*|*valkey*|*memcach*)                     echo database ;;
    *nginx*|*traefik*|*ingress*|*proxy*)            echo network ;;
    *ollama*|*llm*|*embed*)                         echo service ;;
    *)                                              echo application ;;
  esac
}

echo "==> discovering across: $NAMESPACES"
{
  echo "["
  first=1
  for ns in $NAMESPACES; do
    kubectl get ns "$ns" >/dev/null 2>&1 || { echo "  (skip missing ns: $ns)" >&2; continue; }

    # Deployments + StatefulSets = the running components.
    while IFS=$'\t' read -r kind name replicas image; do
      [[ -z "$name" ]] && continue
      type="$(classify "${image}${name}")"
      status="active"; [[ "${replicas:-0}" == "0" ]] && status="stopped"
      [[ $first -eq 0 ]] && echo ","
      first=0
      printf '{"name":"%s/%s","type":"%s","status":"%s","environment":"production","team":"%s","metadata":{"kind":"%s","namespace":"%s","image":"%s","source":"k8s-sync"}}' \
        "$ns" "$name" "$type" "$status" "$ns" "$kind" "$ns" "$image"
    done < <(
      kubectl -n "$ns" get deploy,statefulset \
        -o jsonpath='{range .items[*]}{.kind}{"\t"}{.metadata.name}{"\t"}{.status.readyReplicas}{"\t"}{.spec.template.spec.containers[0].image}{"\n"}{end}' 2>/dev/null
    )

    # Ingress hosts = the externally reachable services.
    while IFS=$'\t' read -r name host; do
      [[ -z "$host" ]] && continue
      [[ $first -eq 0 ]] && echo ","
      first=0
      printf '{"name":"%s","type":"application","status":"active","environment":"production","hostname":"%s","team":"%s","metadata":{"kind":"Ingress","namespace":"%s","ingress":"%s","source":"k8s-sync"}}' \
        "$host" "$host" "$ns" "$ns" "$name"
    done < <(
      kubectl -n "$ns" get ingress \
        -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.rules[0].host}{"\n"}{end}' 2>/dev/null
    )
  done
  echo "]"
} > "$ITEMS"

COUNT="$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1]))))" "$ITEMS")"
echo "==> discovered $COUNT items"

if [[ $DRY_RUN -eq 1 ]]; then
  python3 -c "
import json,sys
for i in json.load(open(sys.argv[1])): print(f\"  {i['type']:12} {i['name']:45} {i['status']}\")
" "$ITEMS"
  exit 0
fi

POD="$(kubectl -n "$NS" get pod -l app=api -o jsonpath='{.items[0].metadata.name}')"
kubectl -n "$NS" cp "$ITEMS" "$POD:/tmp/cmdb-items.json"
kubectl -n "$NS" exec -i "$POD" -- python3 - <<'PY'
import json, os, sys
sys.path.insert(0, os.environ.get("APP_DIR", "/app"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "alertmind.settings")
import django; django.setup()
from api.models import CmdbItem

items = json.load(open("/tmp/cmdb-items.json"))
seen, created, updated = set(), 0, 0
for it in items:
    seen.add(it["name"])
    obj, was_new = CmdbItem.objects.update_or_create(
        name=it["name"],
        defaults={k: v for k, v in it.items() if k != "name"},
    )
    created += was_new
    updated += (not was_new)

# Anything previously synced from k8s but no longer present is decommissioned, not deleted.
stale = CmdbItem.objects.filter(metadata__source="k8s-sync").exclude(name__in=seen).exclude(status="decommissioned")
n_stale = stale.count()
stale.update(status="decommissioned")

print(f"created={created} updated={updated} decommissioned={n_stale} total={CmdbItem.objects.count()}")
PY
