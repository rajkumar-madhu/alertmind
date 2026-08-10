#!/usr/bin/env bash
# Seed AlertMind's RAG knowledge base from the wecrew cluster's operational docs.
#
# The api pod can't see the host filesystem, so this bundles the docs into JSON,
# copies bundle + ingester into the pod, and runs the ingester there (it needs
# Django settings, the DB, and in-cluster Ollama for embeddings).
#
#   ./sync-cluster-kb.sh            # ingest
#   ./sync-cluster-kb.sh --dry-run  # list what would be ingested, write nothing
#
# Idempotent: chunks are keyed by source path, so re-running updates in place.
set -euo pipefail

NS="${NS:-alertmind}"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE="$(mktemp -t kb-bundle.XXXXXX.json)"
trap 'rm -f "$BUNDLE"' EXIT

# Operational docs that describe how this cluster actually works. Keep this list
# curated — the KB is what the LLM cites as a runbook, so noise costs accuracy.
# This repo's own CLAUDE.md is resolved from $HERE, not hardcoded: the checkout has
# already moved once (/root/alertmind-src -> /root/projects/alertmind-src) and the
# hardcoded path silently became a "skip (missing)", quietly dropping the KB's largest
# source while the sync still reported success.
DOCS=(
  "/root/CLAUDE.md"
  "$(dirname "$HERE")/CLAUDE.md"
)
while IFS= read -r f; do DOCS+=("$f"); done < <(find /root/k8s -name "*.md" -type f 2>/dev/null | sort)

python3 - "$BUNDLE" "${DOCS[@]}" <<'PY'
import json, os, sys
out, bundle = [], sys.argv[1]
for path in sys.argv[2:]:
    if not os.path.isfile(path):
        print(f"  skip (missing): {path}", file=sys.stderr); continue
    text = open(path, encoding="utf-8", errors="replace").read().strip()
    if len(text) < 200:
        print(f"  skip (too short): {path}", file=sys.stderr); continue
    # Title: first markdown H1, else the containing directory + filename.
    title = next((l.lstrip("# ").strip() for l in text.splitlines() if l.startswith("# ")), None)
    if not title:
        title = f"{os.path.basename(os.path.dirname(path))}/{os.path.basename(path)}"
    out.append({"path": path, "title": title, "content": text})
json.dump(out, open(bundle, "w"))
print(f"bundled {len(out)} docs ({sum(len(d['content']) for d in out)//1024} KB)", file=sys.stderr)
PY

if [[ $DRY_RUN -eq 1 ]]; then
  echo "--- would ingest ---"
  python3 -c "import json,sys;[print(f\"  {d['title']}  <- {d['path']}\") for d in json.load(open(sys.argv[1]))]" "$BUNDLE"
  exit 0
fi

POD="$(kubectl -n "$NS" get pod -l app=api -o jsonpath='{.items[0].metadata.name}')"
echo "==> ingesting into pod/$POD"
kubectl -n "$NS" cp "$BUNDLE" "$POD:/tmp/kb-bundle.json"
kubectl -n "$NS" cp "$HERE/ingest-cluster-kb.py" "$POD:/tmp/ingest-cluster-kb.py"
kubectl -n "$NS" exec "$POD" -- python3 /tmp/ingest-cluster-kb.py /tmp/kb-bundle.json
