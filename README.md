# 🧠 AlertMind ITSM

**AI-Powered IT Service Management Platform**  
Self-hosted · Local LLM · India-first · No cloud AI costs

---

## Stack

| Layer     | Technology                                    |
|-----------|-----------------------------------------------|
| Frontend  | React 18 + React Router + Recharts + Zustand  |
| Backend   | Node.js 20 + Express + LangChain              |
| Database  | PostgreSQL 16 + pgvector (Supabase)           |
| AI / LLM  | Ollama · llama3.3:70b · nomic-embed-text      |
| RAG Build | Flowise (no-code RAG)                         |
| Automation| n8n webhooks                                  |
| Proxy     | Nginx                                         |
| Infra     | Kubernetes (wecrew) · Docker Compose locally   |

---

## Quick Start

**Production (wecrew):** `https://alertmind.wecrew.in` (SPA) · `https://alertmind.api.wecrew.in` (API)

**Local compose:**

```bash
cp .env.example .env
# For local: set NODE_ENV=development, DOMAIN=localhost,
# FRONTEND_URL=http://localhost:5173,http://localhost:5175,http://localhost:8090
# and leave VITE_API_URL empty so Vite proxies /api → :4000
make up
make db-init
```

**Access:**
- 🌐 Frontend  → `https://alertmind.wecrew.in` (prod) · `http://localhost:8090` (compose)
- 🔌 API       → `https://alertmind.api.wecrew.in/api/health` · `http://localhost:4000/api/health`
- 🔐 Keycloak  → `/auth/` on the SPA host · `http://localhost:8088/auth` locally

**Default login:** `admin@alertmind.ai` / `Admin@2026`  
⚠️ Change password immediately after first login!

---

## Service Ports

| Service    | Port  | Purpose                     |
|------------|-------|-----------------------------|
| Frontend   | 8090  | SPA via compose nginx (prod: 443) |
| API        | 4000  | Django / uvicorn (container 8000) |
| PostgreSQL | 5435  | Database + pgvector (container 5432) |
| Redis      | 6389  | Celery broker (container 6379) |
| Keycloak   | 8088  | OIDC (`/auth`) |
| OPA        | 8181  | Authorization |
| Flowise    | 3009  | No-code RAG builder (optional) |
| n8n        | 5678  | Automation / webhooks (optional) |
| Ollama     | 11434 | Embeddings (in-cluster: ollama-embed) |

---

## RAM Allocation (32GB VPS)

| Service      | RAM   |
|--------------|-------|
| llama3.3:70b | 22 GB |
| PostgreSQL   | 2 GB  |
| Flowise      | 1 GB  |
| n8n          | 1 GB  |
| API + Web    | 1 GB  |
| OS buffer    | 5 GB  |

---

## API Reference

| Endpoint                  | Method | Auth | Description              |
|---------------------------|--------|------|--------------------------|
| `/api/auth/me`            | GET    | Yes  | Get profile              |
| `/api/tickets`            | GET    | Yes  | List tickets             |
| `/api/tickets`            | POST   | Yes  | Create ticket            |
| `/api/tickets/:id`        | PATCH  | Yes  | Update ticket            |
| `/api/rag/analyze`        | POST   | Yes  | AI incident analysis     |
| `/api/rag/chat`           | POST   | Yes  | AI chat                  |
| `/api/rag/search`         | POST   | Yes  | Knowledge base search    |
| `/api/ingest/file`        | POST   | Yes  | Ingest document          |
| `/api/ingest/stats`       | GET    | Yes  | KB stats                 |
| `/api/runbooks`           | GET    | Yes  | List runbooks            |
| `/api/dashboard/stats`    | GET    | Yes  | Dashboard stats          |
| `/api/webhook/prometheus` | POST   | Cluster / secret | Prometheus alerts        |
| `/api/webhook/alert`      | POST   | Cluster / secret | Generic alert webhook    |
| `/api/cmdb`               | GET    | Yes  | CMDB items               |

---

## Prometheus Webhook

```yaml
# In-cluster (wecrew-ops Alertmanager → ClusterIP). Do not point this
# at https://alertmind.wecrew.in or https://alertmind.api.wecrew.in —
# those public hosts 403 /api/webhook/.
receivers:
  - name: alertmind
    webhook_configs:
      - url: http://api.alertmind.svc.cluster.local:8000/api/webhook/prometheus/
        send_resolved: false

route:
  receiver: alertmind
  group_wait: 10s
```

---

## n8n Automation

1. Open n8n → `http://localhost:5678` (compose; not on the wecrew public hosts)
2. Import: `docs/n8n-alertmind-workflow.json`
3. Workflow: Prometheus alert → AlertMind ticket → Slack notify

---

## Security Hardening

```bash
# Change default passwords
nano .env   # JWT_SECRET, POSTGRES_PASSWORD, WEBHOOK_SECRET, FLOWISE_PASS, N8N_PASS

# Public hosts are TLS via the wecrew ingress (alertmind.wecrew.in /
# alertmind.api.wecrew.in). Do not expose compose ports 4000/5435/6389/8088.
```

---

## Project Structure

```
alertmind/
├── docker-compose.yml
├── .env.example
├── Makefile
├── README.md
│
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── prisma/schema.prisma
│   └── src/
│       ├── server.js
│       ├── middleware/    (auth.js, errorHandler.js)
│       ├── prompts/       (itsm.js)
│       ├── routes/        (auth, tickets, rag, ingest, runbooks, dashboard, webhook, cmdb)
│       ├── services/      (ragService, ingestService, authService, slaService)
│       └── utils/         (logger.js)
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── lib/           (api.js, store.js)
│       ├── hooks/         (index.js)
│       ├── components/    (layout/Layout.jsx)
│       └── pages/         (Dashboard, Incidents, TicketDetail, NewTicket,
│                            Runbooks, RunbookDetail, AIConsole, CMDB,
│                            Settings, Profile, Landing, LoginPage)
│
├── nginx/nginx.conf
├── scripts/init.sql
└── docs/
```

---

Built by **Santhira Technologies** · Rajkumar · Tiruppur, Tamil Nadu  
`rk.madhu2026@gmail.com` · `+91 91767 72077`
