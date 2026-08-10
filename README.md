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
| Infra     | Docker Compose · Contabo 32GB VPS             |

---

## Quick Start (Contabo 173.249.2.23)

```bash
# 1. Upload and extract
scp alertmind-fullstack.zip root@173.249.2.23:~/
ssh root@173.249.2.23
unzip alertmind-fullstack.zip && cd alertmind

# 2. Configure environment
cp .env.example .env
nano .env        # Set JWT_SECRET, passwords

# 3. Pull Ollama models (~30 min)
make pull

# 4. Start all services
make up

# 5. Init database
make db-init
```

**Access:**
- 🌐 Frontend  → `http://173.249.2.23`
- 🔌 API       → `http://173.249.2.23/api/health`
- 🤖 Flowise   → `http://173.249.2.23:3001`
- ⚙️  n8n       → `http://173.249.2.23:5678`

**Default login:** `admin@alertmind.ai` / `Admin@2026`  
⚠️ Change password immediately after first login!

---

## Service Ports

| Service    | Port  | Purpose                     |
|------------|-------|-----------------------------|
| Frontend   | 80    | React SPA (via Nginx)       |
| API        | 4000  | Express REST API            |
| PostgreSQL | 5432  | Database + pgvector         |
| Redis      | 6379  | Cache / sessions            |
| Flowise    | 3001  | No-code RAG builder         |
| n8n        | 5678  | Automation / webhooks       |
| Ollama     | 11434 | Local LLM server (external) |

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
| `/api/auth/login`         | POST   | No   | Login                    |
| `/api/auth/register`      | POST   | No   | Register user            |
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
| `/api/webhook/prometheus` | POST   | No   | Prometheus alerts        |
| `/api/webhook/alert`      | POST   | No   | Generic alert webhook    |
| `/api/cmdb`               | GET    | Yes  | CMDB items               |

---

## Prometheus Webhook

```yaml
# alertmanager.yml
receivers:
  - name: alertmind
    webhook_configs:
      - url: http://173.249.2.23/api/webhook/prometheus
        send_resolved: false

route:
  receiver: alertmind
  group_wait: 10s
```

---

## n8n Automation

1. Open n8n → `http://173.249.2.23:5678`
2. Import: `docs/n8n-alertmind-workflow.json`
3. Workflow: Prometheus alert → AlertMind ticket → Slack notify

---

## Security Hardening

```bash
# Change default passwords
nano .env   # JWT_SECRET, POSTGRES_PASSWORD, FLOWISE_PASS, N8N_PASS

# Firewall
ufw allow 22,80,443
ufw deny 4000,5432,6379,3001,5678,11434  # internal only
ufw enable

# SSH key auth
ssh-keygen && ssh-copy-id root@173.249.2.23
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

# fail2ban
apt install fail2ban && systemctl enable fail2ban
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
