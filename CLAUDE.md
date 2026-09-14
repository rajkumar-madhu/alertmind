# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Stack reality check

AlertMind is an AI-powered ITSM platform. The backend was **migrated from Node/Express to Python/Django + DRF + Celery** — but `README.md` and several config files still describe the *old* Express/LangChain/Supabase/Prisma stack. **Trust the code, not `README.md`.** Concretely:
- Backend is **Django 4.2 + Django REST Framework + Celery** (`backend/`), not Express. There is no Prisma, no LangChain, no `services/`/`routes/` JS layout.
- Auth is **Keycloak (OIDC/JWT)**, not local JWT issuance. There is no `/api/auth/login` on the backend.
- The vector store is **Postgres pgvector accessed via raw SQL** (psycopg2), not Supabase's LangChain client.
- `k8s/base/secret.yaml` still carries dead `SUPABASE_*` keys (and `.env.example` more legacy keys) — the Django backend reads none of them.

## Commands

### Docker (primary workflow — `make`)
```bash
make up            # Start all services (docker compose up -d)
make down          # Stop all services
make build         # Rebuild images (--no-cache)
make pull          # Pull Ollama models: llama3.3:70b-instruct-q4_K_M, nomic-embed-text, deepseek-r1:14b
make db-init       # Run scripts/init.sql against Postgres
make logs s=api    # Tail logs for one service (api, web, db, redis, celery_worker, celery_beat, keycloak, opa, flowise, n8n, nginx)
make restart s=api # Restart one service
make status        # docker compose ps + Ollama model list
make shell-api     # sh into the Django api container
make shell-db      # psql into Postgres
make db-tables     # \dt
make backup        # pg_dump to backup_<timestamp>.sql
make clean         # down -v — DESTROYS all volumes
```
> **`make seed`** is now an alias for `make db-init` (`seed: db-init`) — the old `node src/utils/seed.js` Express target is gone. Seed data (an admin user + sample runbooks) lives in `scripts/init.sql` and is applied idempotently (`ON CONFLICT DO NOTHING`), so `make seed` is safe to re-run.

### Backend (Django, runs in-container — there is no `manage.py`)
The image entrypoint is `uvicorn alertmind.asgi:application`. Three containers share the `./backend` image:
- `api` → `uvicorn alertmind.asgi:application --host 0.0.0.0 --port 8000`
- `celery_worker` → `celery -A alertmind worker -l info`
- `celery_beat` → `celery -A alertmind beat -l info`

The DB schema is **owned by `scripts/init.sql`, not Django migrations** (there is no `api/migrations/` dir). Django models map onto existing tables via `Meta.db_table`. To change schema, edit `scripts/init.sql` and re-run `make db-init` — do **not** rely on `makemigrations`/`migrate`. The `alertmind_documents.embedding vector(768)` column is created in SQL and read/written via raw psycopg2 cursors.

### Frontend (`frontend/`, Vite + React 18)
```bash
npm run dev      # Vite dev server (--host); proxies /api → http://localhost:4000
npm run build    # Production build to dist/
npm run preview  # Preview the build
```

### Tests & linting — there are none
There is **no automated test suite** (no `pytest`/`unittest`, no `tests/` dir, no `*.test.jsx`) and **no lint/format config** (no ESLint, Prettier, ruff, or black; `frontend/package.json` defines only `dev`/`build`/`preview`). Don't waste time hunting for `npm test` or `pytest` — verify changes by running the stack (`make up`) and smoke-testing the affected route. If you add tests, you're establishing the convention, not following one.

## Service topology (docker-compose.yml)

Ports are `host:container`. **Internal service-to-service calls use the container port**, which often differs from the published host port.

| Service        | Host port | Container port | Notes |
|----------------|-----------|----------------|-------|
| nginx          | **8090, 8443** | 80, 443   | Reverse proxy / entrypoint — the proxied stack is at `http://localhost:8090`, *not* `:80` |
| web (frontend) | 5175      | 80             | Nginx-served React SPA |
| api (Django)   | 4000      | **8000**       | uvicorn ASGI |
| celery_worker  | —         | —              | RAG analysis tasks |
| celery_beat    | —         | —              | Periodic SLA scan |
| db (pgvector)  | 5435      | 5432           | `pgvector/pgvector:pg16` |
| redis          | 6389      | 6379           | Celery broker + result backend |
| keycloak       | 8088      | 8080           | Realm imported from `keycloak/alertmind-realm.json`, base path `/auth` |
| opa            | 8181      | 8181           | Authorization sidecar, loads `opa/policy.rego` |
| flowise        | 3009      | 3001           | No-code RAG builder (nginx route commented out by default) |
| n8n            | 5678      | 5678           | Webhook automation (nginx route commented out by default) |

All services share the `alertmind` Docker bridge network. **Ollama is not in compose** (`OLLAMA_BASE_URL`, default `http://ollama:11434`; prod overlay uses `http://ollama-embed:11434`). `make up` prints local URLs (`http://localhost:8090`); production is `https://alertmind.wecrew.in` / `https://alertmind.api.wecrew.in`.

## Backend architecture (`backend/`)

```
alertmind/        # Django project: settings.py, asgi.py, wsgi.py, celery.py
api/              # The single app
  urls.py         # DRF DefaultRouter + path() routes
  views.py        # ViewSets + APIViews (all REST + RAG + webhooks + dashboard)
  models.py       # User, Ticket, Comment, Runbook, CmdbItem, AlertmindDocument
  serializers.py  # DRF serializers
  auth.py         # KeycloakAuthentication (JWT verification)
  middleware.py   # OpaAuthorizationMiddleware (PBAC enforcement)
  llm.py          # Provider adapter: generate() / chat() → Groq or Ollama
  tasks.py        # Celery tasks + RAG pipeline + prompts
```

### LLM provider indirection (`api/llm.py`)
**All text generation goes through `api.llm`**, never directly to a provider. It exposes `generate(prompt, temperature, timeout)` and `chat(messages, timeout)` and resolves the provider in this order, first match wins:

1. **`LLM_API_KEY`** → any OpenAI-compatible `/chat/completions` endpoint at `LLM_API_BASE` with `LLM_API_MODEL`. **This is what the cluster uses: xAI (Grok)** — `https://api.x.ai/v1`, `grok-4.5`. The same path serves OpenAI, Together, vLLM, and Groq, since they share the wire format.
2. **`GROQ_API_KEY`** → Groq. Retained for backwards compatibility with older deploys.
3. **Ollama** → self-hosted at `OLLAMA_BASE_URL`, model `LLM_MODEL`. **Ollama has no API key** — it's the keyless fallback.

A *present but invalid* key still selects that provider — the test is "is a key set", not "does it work". That's deliberate: silently downgrading to a small local model would change answer quality with no signal. (This is exactly how the dead Groq key surfaced as visible 401s rather than quietly worse answers.)

The key lives in secret **`alertmind-llm`** (key `api-key`), created imperatively and never committed; `api.yaml`/`celery.yaml` mount it with `optional: true` so the manifests still apply on a cluster without it. `tasks.py` imports `generate`; `views.py` imports both. Add new LLM calls here rather than re-implementing a provider branch.

> **Embeddings never went through this adapter.** `generate_embedding()` in `tasks.py` always hits `OLLAMA_BASE_URL/api/embeddings` with `EMBED_MODEL` (Groq serves no embedding model). So setting `GROQ_API_KEY` does **not** remove the Ollama dependency — with Ollama unreachable, `generate_embedding` returns `None`, `query_vector_store` returns `[]`, and every analysis silently degrades to a no-context prompt with confidence pinned at 15.

### Request lifecycle
1. **nginx** (`nginx/nginx.conf`) routes `/api/` → api, `/auth/` → keycloak, everything else → the SPA. The `/flowise/` and `/webhook/` (n8n) routes — and their `upstream` blocks — are **commented out** ("disabled for core-only local run"); uncomment them in `nginx/nginx.conf` to enable Flowise/n8n through the proxy. (Note: `frontend/nginx.conf` is a separate, build-time SPA config baked into the `web` image — don't confuse it with the reverse-proxy config.)
2. **`OpaAuthorizationMiddleware`** (runs on every `/api/` request except `/api/health/` and `/api/webhook/`): re-runs `KeycloakAuthentication` to resolve the user, maps HTTP method → action (`GET`→read, `POST`→create, `PUT/PATCH`→update, `DELETE`→delete), maps the path segment after `/api/` → resource type (`tickets`→`ticket`, etc.), fetches `resource_owner`/`resource_assignee` from the DB for update/delete, then POSTs an `input` payload to OPA (`OPA_URL`). An OPA *deny* returns 403 **even in `DEBUG`**. The only `DEBUG`-relaxed path is when OPA itself is *unreachable*: that **fails closed (500) in production but is allowed through in `DEBUG`**.
3. **DRF `KeycloakAuthentication`** is the default authentication class (default permission `IsAuthenticated`). It decodes the `Bearer` JWT, fetches Keycloak's JWKS (cached in-process; unknown `kid` refetches), verifies RS256 against `KEYCLOAK_AUDIENCE`, maps realm roles to `admin|engineer|viewer`, and **upserts the user into the `users` table keyed by Keycloak `sub` (`users.token_identifier`)**. Email only links the first login to a pre-seeded row; `email_verified: false` is rejected. There is **no unsigned JWT fallback** — JWKS unreachable is a 401 in DEBUG and production.

### Authorization policy (`opa/policy.rego`, package `alertmind.authz`)
Role rules: admins → anything; engineers → read all, create tickets/comments/documents/runbooks/cmdb, update tickets they own/are-assigned, update their own comments, update (but not delete) runbooks/cmdb; viewers → read only. Deleting tickets/runbooks/cmdb stays admin-only. The middleware supplies `resource_owner`/`resource_assignee` so OPA can enforce ownership. The middleware maps `rag`→`rag` and **forces RAG endpoints (`search`/`chat`/`stats`) to the `read` action** (they POST a body but don't mutate), so any authenticated user can use the AI console; `ingest`→`document` (a `create` engineers are allowed). Resources not in the map fall through to `unknown`, which only admins can act on.

### RAG pipeline (`api/tasks.py` + `api/views.py`)
`analyze_ticket_task` (Celery) is the core: build a query from the ticket → `query_vector_store()` embeds via Ollama `nomic-embed-text` (768-dim) and runs a **raw pgvector cosine search** (`embedding <=> %s::vector`) on `alertmind_documents` filtered by `metadata @> jsonb` → assemble context → call `llm.generate()` (`P1_PROMPT` for P1, else `ITSM_PROMPT`) → `parse_llm_response()` extracts the emoji-delimited sections (🔴 ROOT CAUSE, 🔧 RESOLUTION STEPS, etc.) → write `ai_*` fields back to the ticket. Prompt templates live inline in `tasks.py`. Confidence = scaled average similarity score.

Analysis is triggered on ticket create (`TicketViewSet.perform_create`), via the `tickets/<id>/analyze` action, and by the alert/prometheus webhooks. Resolving a ticket (`tickets/<id>/resolve` or `webhook/resolved`) **ingests it back into the vector store** (`insert_vector_document`), closing the learning loop. Runbook creation ingests too.

### Celery
`alertmind/celery.py` autodiscovers tasks; broker + result backend are Redis (`REDIS_URL`). `analyze_ticket_task` runs on demand; `check_sla_breaches_task` is the periodic beat job that marks `sla_breached` and posts to `SLACK_WEBHOOK_URL` when set. The beat schedule lives in `settings.CELERY_BEAT_SCHEDULE` (runs `check_sla_breaches_task` every `SLA_SCAN_INTERVAL_SECONDS`, default 60s) — without that entry the `celery_beat` container has an empty schedule and the scan never fires.

### Key routes (`api/urls.py`)
DRF router ViewSets: `cmdb`, `runbooks`, `tickets`, `webhook`, `rag`. Extra: `health/` (AllowAny), `auth/me/`, `dashboard/`, `ingest/`.
- `tickets/` custom actions: `analyze`, `resolve`, `comments`, `add-comment`, `pir` (LLM-generated post-incident report).
- `rag/` actions: `search`, `chat`, `stats`.
- `webhook/` actions (all **AllowAny**): `alert`, `prometheus`, `resolved`.

### SLA tiers (minutes, from `views.py`)
**P1 = 15, P2 = 120, P3 = 480, P4 = 1440.** Stored as `sla_due_at`. (These differ from the values in old docs — use the code's.)

## Frontend architecture (`frontend/src/`)
- **State**: three Zustand stores in `lib/store.js` — `useAuthStore` (token in `localStorage` as `am_token`), `useAIStore` (idle→loading→done→error), `useUIStore`.
- **API client**: `lib/api.js` — single axios instance, injects `Bearer am_token`, redirects to `/login` on 401. It is a **normalizing adapter** over the Django/Keycloak backend: it appends DRF trailing slashes, logs in via the **Keycloak ROPC token endpoint** (`/auth/realms/alertmind/protocol/openid-connect/token`, client `alertmind-frontend`), polls `tickets/<id>/analyze` for async Celery results, fans the single `GET /api/dashboard/` into the stats/trend/sla view-models, and re-shapes flat serializer fields into the nested `assignee`/`creator`/`comments`/`{data:[]}` shapes the pages expect. Keep this contract in `api.js` so page components need no per-route changes.
- **Routing** (`App.jsx`, all pages lazy-loaded): `/` is a **public marketing `Landing` page** and `/login` the ROPC form; the entire authenticated app is nested under **`/app/*`** behind `PrivateRoute` (`/app` → `/app/dashboard`, plus `incidents[/new|/:id]`, `runbooks[/new|/:id]`, `ai`, `cmdb`, `settings`, `profile`). Anything unmatched redirects to `/`, so a wrong-cased or un-prefixed path silently lands on the landing page rather than 404ing.
- Dev server proxies `/api` → `:4000` and `/auth` → `:8088` (Keycloak), both overridable via `VITE_API_URL` / `VITE_KEYCLOAK_PROXY`. `vite.config.js` sets `port: 5173`, while the compose-built `web` image publishes `5175` — the realm whitelists both.
### Styling — the Sovereign brand (read before writing any style)
The **whole app** — landing page and signed-in app alike — wears the **Sovereign brand** cloned from `https://sovereign.ops.wecrew.in`, the shared wecrew identity `argus-itsm-frontend` also uses. Warm paper workspace, ink text, coral accent, blue links. Everything derives from tokens at `:root` in `index.css`; there is no second brand and no scoped override block.

| Token | Light | Role |
| --- | --- | --- |
| `--paper` / `--paper2` | `#f4f1ea` / `#ebe6dc` | page bg / header strips + inset panels |
| `--white` | `#fffcf7` | card + surface |
| `--ink` / `--ink2` / `--ink3` | `#0e1116` / `#5c5a56` / `#6e6a62` | text, muted, subtle |
| `--amber` | `#ff5b2e` | brand coral |
| `--blue` | `#2b4cff` | links, charts, focus ring |
| `--border` / `--border2` | `#ddd6c8` / `#d4cdc0` | hairlines, input borders |

Fonts: **Fraunces** (`--serif`, headings + stat numerals), **IBM Plex Sans** (`--sans`, body), **JetBrains Mono** (`--mono`, micro-labels). Buttons and inputs are flat with a **4px** radius — no gradients, no hover lift.

Three rules that are easy to break:
1. **Coral is a fill, not a text colour.** `--amber` on paper is only ~2.7:1. For coral-flavoured *text* use **`--amberFg`** (`#9a3412`, Sovereign's own `accent-foreground`) — that's what the active nav item, AI chips, and P3 badges use. Pure `--amber` is for button fills, dots, progress bars, and the `.kicker` eyebrow.
2. **Status colours must be the `*Fg` tokens, never literals.** `--redFg`/`--orangeFg`/`--greenFg`/`--blueFg`/`--amberFg` **invert between themes** because they sit on tints (`--redL` etc.) that also invert. A hardcoded `#b91c1c` looks right in light mode and is unreadable on the dark tint. The per-page `SEV`/`STA` maps in `Dashboard`/`Incidents`/`TicketDetail` follow this.
3. **Never use `--border` as a background.** It's a border colour, too dark to carry `--ink3` text (3.7:1). Use `--paper2`.

Headings need `fontWeight:600` — Fraunces' optical sizing looks thin at 400, and inline styles beat the global `h1,h2,h3` rule.

> Verified in-browser across all pages in both themes: 1 residual contrast miss in light (a 4.33:1 hint label) and 3 in dark (2.9–3.4:1 small labels). Two *deliberate* brand-inherited exceptions remain: the coral `.kicker` eyebrow (2.74:1) and white-on-coral primary buttons (3.09:1) — both are exactly what sovereign.ops.wecrew.in does, so they were kept for fidelity rather than "fixed".

## Configuration
`settings.py` reads from env (defaults exist for all): `DATABASE_URL`, `REDIS_URL`, `KEYCLOAK_SERVER_URL`/`KEYCLOAK_REALM`/`KEYCLOAK_AUDIENCE`, `OPA_URL`, `OLLAMA_BASE_URL`, `LLM_MODEL`, `EMBED_MODEL`, `GROQ_API_KEY`/`GROQ_MODEL` (default `llama-3.3-70b-versatile`; the presence of the key alone flips the provider), `SLA_SCAN_INTERVAL_SECONDS`, `SLACK_WEBHOOK_URL`, `JWT_SECRET` (Django `SECRET_KEY`). CORS/CSRF default to localhost **and** `https://alertmind.wecrew.in` / `https://alertmind.api.wecrew.in`. `ALLOWED_HOSTS` in production is those wecrew hosts plus in-cluster Service DNS (`api`); DEBUG still allows `*`. **`DEBUG` is `True` unless `NODE_ENV=production`** — DEBUG still fail-opens OPA when OPA is *unreachable*, so always set `NODE_ENV=production` for any real deployment. `.env.example` still lists some legacy keys (`SUPABASE_*`, `JWT_EXPIRES`, `CHUNK_SIZE`, …) that the Django backend ignores.

## Kubernetes (`k8s/`) — deployed on the `wecrew` kind cluster

Kustomize: `k8s/base/` (one manifest per service — `api`, `celery`, `web`, `nginx`, `postgresql`, `redis`, `opa`, `ollama-embed`, `flowise`, `n8n`, `ollama` + `namespace`/`configmap`/`secret`/`db-init-configmap`/`nginx-configmap`/`ingress`/`api-ingress`) and `k8s/overlays/prod/`. Deploy with `kubectl apply -k k8s/overlays/prod` (namespace `alertmind`, context `kind-wecrew`). See `/root/CLAUDE.md` for cluster-wide conventions.

**Read the prod overlay before assuming what runs** — it is not a thin image pin, it substantially rewrites the base:
- **Images are locally-built and side-loaded into kind**, not pulled: the GitLab names (`registry.gitlab.com/rajkumarmadhu2024/artinfra-finsot/{api,web}`) are *renamed* to `alertmind-api:deploy-<date>-groq` / `alertmind-web:deploy-<date>`. Build and `kind load` a new tag, then bump `newTag` here — there is no registry to push to and no `imagePullSecrets`.
- **`ollama`, `flowise`, `n8n` are `$patch: delete`d** — Deployments, PVCs, Services, and the `ollama-model-pull` Job. So despite `ollama.yaml` existing in base, **prod does not run Ollama in-cluster** — `OLLAMA_BASE_URL` is repointed at `http://ollama.linkedeye.svc.cluster.local:11434` (another namespace). Delete the Service alongside any workload you drop here: an endpoint-less Service makes a dead route look live and tempts an nginx `upstream` entry, which is a startup-time hard failure (see below).
- **Keycloak is external to this kustomization** (there is no `keycloak.yaml`); prod points `KEYCLOAK_SERVER_URL` at the cluster's own `http://keycloak.keycloak.svc.cluster.local:8080`.
- Base `configmap.yaml` sets `LLM_MODEL: llama3.2:3b` (not `llama3.3:70b` — that needs ~43 GB RAM, unviable on the 16 GB node) and `NODE_ENV: production`, which is what disables the DEBUG auth/OPA relaxations.

### Public exposure (two hosts, two ingresses)
Traffic reaches the cluster the standard wecrew way — host Traefik SNI-passthrough (`k8s/traefik/alertmind.yml`) → `127.0.0.1:8443` → in-cluster ingress-nginx, with `k8s/host-nginx/alertmind.wecrew.in.conf` handling plain `:80`. Both hosts get `letsencrypt-prod` certs. **The two ingresses take different paths into the app:**
- `alertmind.wecrew.in` (`ingress.yaml`, secret `alertmind-tls`) → the in-cluster **`nginx` service**, which then splits `/api/` vs the SPA.
- `alertmind.api.wecrew.in` (`api-ingress.yaml`, secret `alertmind-api-tls`) → **`api:8000` directly, bypassing the in-cluster nginx** — this is the origin the SPA is built against (`VITE_API_URL`). Changes to `nginx-configmap.yaml` therefore do *not* affect the API host; nginx-level rules must be duplicated as ingress annotations there.

Ingress rules are **host-scoped on purpose**. A hostless catch-all rule makes ingress-nginx send *any* unmatched host on this shared cluster to alertmind, hijacking other namespaces' traffic — don't reintroduce one.

### nginx upstream trap (`nginx-configmap.yaml`)
nginx resolves `upstream` server names **at startup**: an upstream naming a Service that doesn't exist in the namespace fails hard (`host not found in upstream`) and the pod CrashLoops, taking `alertmind.wecrew.in` down. Only `api`, `web`, and `keycloak` are declared as upstreams. Optional/cross-namespace targets (n8n) use a **variable** `proxy_pass` (`set $n8n_upstream …`) to defer resolution to request time, which is why the `resolver kube-dns.kube-system.svc.cluster.local` directive must stay. `/flowise/` returns a plain 503 rather than proxying, since flowise isn't deployed here.

### Cluster integrations (wecrew-ops)
The cluster's observability stack lives in namespace **`wecrew-ops`** (VictoriaMetrics, vmalert, Alertmanager, Tempo, ClickHouse, OTel collector, Grafana) — it is the Wecrew Ops product at `ops.wecrew.in` / `sovereign.ops.wecrew.in`. Four integrations connect AlertMind to it:

1. **Alerts → incidents.** The `wecrew-ops` Alertmanager posts to `http://api.alertmind.svc.cluster.local:8000/api/webhook/prometheus/` — that endpoint already expects Alertmanager's native payload (`alerts[]` with `labels`/`annotations`), maps `severity` critical→P1 / warning→P2 / info→P3, derives `affected_ci` via `derive_affected_ci()`, and fires `analyze_ticket_task`. **Do not go back to `labels.instance` for `affected_ci`** — `affected_ci` is matched against `cmdb_items.name` (`<namespace>/<workload>`, or a bare host for ingresses), and for anything scraped from kube-state-metrics `instance` is the *exporter's* address (`kube-state-metrics.wecrew-ops.svc.cluster.local:8080`), identical on every pod alert in the cluster, so it matches no CMDB item and points the TicketDetail deep links at the exporter. `derive_affected_ci()` prefers an explicit workload label → the pod name with its generated suffix stripped → service → ingress/host → node, keeping `instance` only as a last-resort fallback. The vmalert rules here emit just `instance`/`namespace`/`node`/`pod`, so in practice the pod branch does the work. AlertMind is an **additional `webhook_configs` entry on the existing `wecrew-webhook` receiver**, not a new route — the wecrew-ops receiver is listed first and untouched. `send_resolved: false` on purpose: `/webhook/prometheus/` ignores non-firing alerts and resolution has its own endpoint. **Editing that ConfigMap changes another team's live product** — back it up first and re-verify their receiver still fires.
2. **Knowledge base.** `scripts/sync-cluster-kb.sh` (+ `ingest-cluster-kb.py`) bundles the cluster's operational docs (`/root/CLAUDE.md`, `/root/k8s/**/*.md`, this file), chunks them on heading boundaries, embeds, and writes to `alertmind_documents`. Idempotent via a `doc_key` in metadata. Has `--dry-run`. Note retrieval filters on the **metadata JSONB** (`metadata @> {"collection": …}`), not the `collection` column, so both are written.
3. **CMDB.** `scripts/sync-cluster-cmdb.sh` discovers Deployments/StatefulSets/Ingress hosts across namespaces and upserts `cmdb_items` keyed by `name` (`<namespace>/<workload>`, or the bare host for ingresses). Items that vanish are marked `decommissioned`, never deleted. Has `--dry-run`; `NAMESPACES=…` overrides scope.
4. **Observability deep links.** `frontend/src/lib/observability.js` builds Grafana/ops-console URLs from `affected_ci`, rendered on TicketDetail. It links to Grafana **dashboard search, not a dashboard UID** — UIDs aren't stable across wecrew-ops redeploys, so a search always resolves where a stale UID 404s. Override the base with `VITE_OPS_URL`.

### Things that were silently broken (fixed — don't reintroduce)
- **No OPA existed on K8s.** compose has an `opa` service and `opa/policy.rego` was maintained, but no manifest was ever written, so `OPA_URL` fell back to its `settings.py` default (`http://opa:8181/...`), resolved to nothing, and — since `NODE_ENV=production` makes `DEBUG` False and `OpaAuthorizationMiddleware` **fails closed** — *every authenticated `/api/` request returned 500*. Now `k8s/base/opa.yaml`. Two traps: the Service must stay named `opa` on `8181` (the default `OPA_URL` is built from that name), and the policy is **inlined** into the ConfigMap because kustomize can't `configMapGenerator` a file outside its own directory without `LoadRestrictionsNone` — so after editing `opa/policy.rego`, re-sync the ConfigMap and restart the Deployment or the cluster keeps enforcing the old rules.
  > This is also why health checks alone can't certify a deploy here: `/api/health/` and `/api/webhook/` are the only paths exempt from the middleware, so the alert→incident→AI pipeline stayed green while the entire signed-in UI was down. Smoke-test with a real token (the demo users in `keycloak/alertmind-realm.json`) — a viewer POST should return **403**, not 500.
- **No Celery workers existed on K8s.** compose has `celery_worker`/`celery_beat`, but the original k8s port never included them, so `analyze_ticket_task.delay()` enqueued to Redis and *nothing consumed it* — every ticket stayed `ai_analyzed=false` and no SLA scan ever ran. Now `k8s/base/celery.yaml`. Keep `celery-beat` at `replicas: 1` (duplicate schedulers double-fire).
- **No Ollama existed anywhere.** All three `ollama` Services (`linkedeye`, `devarchitect`, `odysseus`) had zero endpoints and no pod existed, so `generate_embedding()` always returned `None` and vector search always returned `[]`. Now `k8s/base/ollama-embed.yaml` — embedding-only, ~274 MB model, pointed at by `OLLAMA_BASE_URL`.
- **The KB was empty** (0 documents), so even working retrieval had nothing to find.

- **The Groq key was dead** (401 Unauthorized), so every analysis fell back to "AI Analysis failed to contact LLM backend". Resolved by moving generation to **xAI/Grok** via the generic OpenAI-compatible path (secret `alertmind-llm`). The Groq secret is left in place and is simply not reached while `LLM_API_KEY` is set.

Verified end-to-end after the fix: an Alertmanager `severity: critical` alert became a **P1** incident whose AI analysis scored **73% confidence** and cited `hostinger-webhook` / cert-manager commands that exist *only* in the ingested KB docs — proof that retrieval genuinely feeds generation, rather than the model answering from parametric memory.

### Deploying a frontend change
`dist/` is baked into the image (`frontend/Dockerfile` just `COPY dist`), so build the SPA *first*:
```bash
cd frontend && npm run build
docker build -t alertmind-web:deploy-$(date +%Y%m%d) ./frontend   # from repo root
kind load docker-image alertmind-web:deploy-$(date +%Y%m%d) --name wecrew
# bump `newTag` in k8s/overlays/prod/kustomization.yaml to match, then:
kubectl -n alertmind set image deployment/web web=alertmind-web:deploy-$(date +%Y%m%d)
kubectl -n alertmind rollout status deployment/web
```
**Always `kubectl diff -k k8s/overlays/prod` before a full `apply -k`.** The repo has drifted behind hand-fixes in the cluster before; a clean diff (exit 0) is the signal that `apply -k` is a no-op and safe.

## Gotchas
- `README.md` documents the obsolete Express stack (Node 20 + LangChain + Supabase + Prisma) and wrong ports — do not rely on it.
- **`k8s/base/secret.yaml` is gone — don't recreate it.** It used to carry real credentials (Postgres password, `JWT_SECRET`, Flowise/n8n passwords) *and* be applied by the kustomization, so every `apply -k` rewrote the live Secret from a committed file — a direct violation of the "never commit live secrets" rule in `/root/CLAUDE.md`. `alertmind-secrets` and `alertmind-llm` are now created imperatively by **`k8s/create-secrets.sh`** (`--status`/`--dry-run`/`--rotate`), with `k8s/base/secret.example.yaml` documenting the shape. The path is gitignored. **Run the script before the first `apply -k` on a fresh cluster**, or api/celery start with no `DATABASE_URL`. Those previously-committed values are still live on this cluster and should be treated as compromised — rotate with `./create-secrets.sh --rotate` plus a Postgres password change when you get the chance.
- **The demo passwords are public by design, not by accident.** `admin@alertmind.ai / Admin@2026` (plus engineer/viewer) appear in `keycloak/alertmind-realm.json`, `README.md`, `scripts/init.sql`, and the `DEMO` array in `frontend/src/pages/LoginPage.jsx` — and that last one is compiled into the SPA already served at `alertmind.wecrew.in`, so anyone visiting the site can read them. Scrubbing them from the repo buys nothing and breaks the one-click demo login. If the public exposure of a working **admin** account matters, fix it at the source: rotate the password, or downgrade the public demo account to `viewer`.
- **`GROQ_API_KEY` is deliberately *not* in that file.** `api.yaml` mounts it from a separate Secret `alertmind-groq` (key `api-key`) that no manifest creates — it must exist in the namespace imperatively (`kubectl -n alertmind create secret generic alertmind-groq --from-literal=api-key=...`) or the api pods fail to start. Keep new credentials on that pattern rather than adding them to `secret.yaml`.
- Every app tier runs **`replicas: 1`** on this single-node 16 GB cluster (`api`/`web`/`nginx` were previously declared as `2` in the repo while the cluster ran `1` — a full `apply -k` would have silently scaled them up). The api is still stateless (`uploads`/`logs` are per-pod `emptyDir`), so raising it is a capacity decision, not a correctness one.
- Auth is **Keycloak ROPC**, so the password login form posts to Keycloak, not Django. The realm (`keycloak/alertmind-realm.json`) defines two clients — `alertmind-frontend` (public, used for ROPC login) and `alertmind-backend` (confidential) — and includes an `oidc-audience-mapper` that injects `aud: alertmind-frontend` into access tokens, required because Django verifies `verify_aud=True` (`KEYCLOAK_AUDIENCE`). If you add another client/audience, add a matching mapper or auth 401s. Redirect URIs and web origins include localhost **and** `https://alertmind.wecrew.in` / `https://alertmind.api.wecrew.in`.
- Schema lives in `scripts/init.sql` (incl. the `match_documents` SQL function and `ticket_daily_stats` view that `DashboardView` queries), not Django migrations. `make db-init`/`make seed` re-apply it (idempotent via `IF NOT EXISTS` / `ON CONFLICT`); it also auto-runs on first DB boot via `docker-entrypoint-initdb.d`.
- `TicketViewSet.get_queryset` supports server-side filtering on the **list** action via query params: `status`, `severity`, `category` (case-insensitive), `search` (icontains over title/description/category/affected_ci), and `limit`. Filtering is intentionally skipped for detail/update/delete actions (a sliced queryset can't be filtered by pk). There is still **no pagination** — list returns a bare array.

### Fixed in this repo (was broken against the old Express stack)
- nginx `upstream api` now points at `api:8000` (the container port; `4000` is only the host mapping).
- `make db-init` now uses the real in-container path `/docker-entrypoint-initdb.d/init.sql`; `make seed` aliases to it (the old `node src/utils/seed.js` target is gone).
- `frontend/src/lib/api.js` was realigned from dead Express routes to the Django/Keycloak contract (see Frontend architecture). `vite.config.js` now also proxies `/auth` → Keycloak for `npm run dev`.
> None of the frontend/auth changes could be run in this environment (Docker + external Ollama). They are correct-by-construction against the backend contract but unverified end-to-end — smoke-test login, dashboard, and AI analyze after `make up`.
