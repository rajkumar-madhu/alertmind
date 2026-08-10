#!/usr/bin/env python3
"""Seed AlertMind's RAG knowledge base from the wecrew cluster's operational docs.

Runs INSIDE the alertmind `api` pod (it needs the Django settings, the DB, and the
in-cluster Ollama for embeddings). Drive it from the host with:

    scripts/sync-cluster-kb.sh

Chunks each markdown doc on heading boundaries, embeds with nomic-embed-text (768d)
and writes to `alertmind_documents`.

Idempotent: every chunk carries a stable `doc_key` in its metadata, and existing rows
with that key are deleted before reinsert — so re-running updates in place instead of
duplicating. Note the retrieval filter in `query_vector_store()` matches on the
*metadata* JSONB (`metadata @> {"collection": ...}`), not the `collection` column, so
`collection` is written into both.
"""
import hashlib
import json
import os
import sys

import django

# The script is copied to /tmp, so the app dir is not on sys.path by default.
APP_DIR = os.environ.get("APP_DIR", "/app")
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "alertmind.settings")
django.setup()

from django.db import connection  # noqa: E402
from api.tasks import generate_embedding  # noqa: E402

BUNDLE = sys.argv[1] if len(sys.argv) > 1 else "/tmp/kb-bundle.json"
COLLECTION = "runbooks"
MAX_CHARS = 1400          # ~350 tokens; nomic-embed-text handles this comfortably
MIN_CHARS = 120           # skip scraps that carry no retrievable meaning


def chunk_markdown(text):
    """Split on markdown headings, then hard-wrap anything still oversized."""
    blocks, current = [], []
    for line in text.splitlines():
        if line.startswith("#") and current and sum(len(x) for x in current) > MIN_CHARS:
            blocks.append("\n".join(current))
            current = [line]
        else:
            current.append(line)
    if current:
        blocks.append("\n".join(current))

    out = []
    for b in blocks:
        b = b.strip()
        if len(b) <= MAX_CHARS:
            out.append(b)
            continue
        para, buf = b.split("\n\n"), ""
        for p in para:
            if len(buf) + len(p) + 2 > MAX_CHARS and buf:
                out.append(buf.strip())
                buf = p
            else:
                buf = f"{buf}\n\n{p}" if buf else p
        if buf.strip():
            out.append(buf.strip())
    return [c for c in out if len(c) >= MIN_CHARS]


def main():
    with open(BUNDLE) as fh:
        docs = json.load(fh)

    inserted = replaced = skipped = failed = 0
    with connection.cursor() as cur:
        for doc in docs:
            path, text = doc["path"], doc["content"]
            doc_key = hashlib.sha256(path.encode()).hexdigest()[:16]

            cur.execute(
                "DELETE FROM alertmind_documents WHERE metadata->>'doc_key' = %s", [doc_key]
            )
            if cur.rowcount:
                replaced += cur.rowcount

            for i, chunk in enumerate(chunk_markdown(text)):
                # Prefix the source so retrieved context is self-describing in the prompt.
                body = f"[{doc['title']} — {path}]\n\n{chunk}"
                emb = generate_embedding(body)
                if not emb:
                    failed += 1
                    continue
                meta = {
                    "collection": COLLECTION,
                    "doc_key": doc_key,
                    "source_file": path,
                    "title": doc["title"],
                    "chunk": i,
                    "origin": "wecrew-cluster-docs",
                }
                cur.execute(
                    "INSERT INTO alertmind_documents (content, metadata, embedding, collection, created_at)"
                    " VALUES (%s, %s::jsonb, %s::vector, %s, NOW())",
                    [body, json.dumps(meta), "[" + ",".join(map(str, emb)) + "]", COLLECTION],
                )
                inserted += 1
            print(f"  {path}: ok", flush=True)

    print(f"\ninserted={inserted} replaced_old={replaced} skipped={skipped} embed_failures={failed}")
    if failed:
        print("WARNING: some chunks had no embedding — check OLLAMA_BASE_URL reachability.")
        sys.exit(1)


if __name__ == "__main__":
    main()
