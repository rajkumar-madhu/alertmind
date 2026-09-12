-- ═══════════════════════════════════════════════════════════
--  AlertMind ITSM — Database Init Script
--  Run: psql -U postgres -f init.sql
--  Or paste in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Users ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  email         TEXT        UNIQUE NOT NULL,
  token_identifier TEXT,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'engineer',
  team          TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Existing clusters created the table without token_identifier — re-running this
-- file (make db-init) must still add the column.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_identifier TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_token_identifier
  ON users (token_identifier) WHERE token_identifier IS NOT NULL;

-- ── Tickets ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT        NOT NULL,
  description    TEXT        NOT NULL,
  severity       TEXT        NOT NULL CHECK (severity IN ('P1','P2','P3','P4')),
  status         TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open','in-progress','resolved','closed')),
  category       TEXT        NOT NULL,
  affected_ci    TEXT,
  source         TEXT        DEFAULT 'manual',
  raw_alert      JSONB,

  -- AI analysis
  ai_resolution  TEXT,
  ai_steps       JSONB,
  ai_confidence  INT,
  ai_analyzed    BOOLEAN     DEFAULT FALSE,
  ai_analyzed_at TIMESTAMPTZ,

  -- Resolution
  root_cause     TEXT,
  resolution     TEXT,
  prevention     TEXT,
  resolved_by    TEXT,
  resolved_at    TIMESTAMPTZ,
  ingested       BOOLEAN     DEFAULT FALSE,

  -- SLA
  sla_due_at     TIMESTAMPTZ,
  sla_breached   BOOLEAN     DEFAULT FALSE,

  -- Relations
  created_by     UUID        NOT NULL,
  assignee_id    UUID,

  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Comments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content    TEXT        NOT NULL,
  ticket_id  UUID        NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Runbooks ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS runbooks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  content     TEXT        NOT NULL,
  category    TEXT        NOT NULL,
  tags        TEXT[]      DEFAULT '{}',
  use_count   INT         DEFAULT 0,
  created_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── CMDB ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cmdb_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'server',
  environment TEXT        DEFAULT 'production',
  status      TEXT        DEFAULT 'active',
  ip_address  TEXT,
  hostname    TEXT,
  os          TEXT,
  team        TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Vector Store (pgvector) ────────────────────────────────
CREATE TABLE IF NOT EXISTS alertmind_documents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  content     TEXT        NOT NULL,
  metadata    JSONB       DEFAULT '{}',
  embedding   VECTOR(768),
  collection  TEXT        DEFAULT 'incidents',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tickets_status     ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_severity   ON tickets(severity);
CREATE INDEX IF NOT EXISTS idx_tickets_category   ON tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_created    ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_sla        ON tickets(sla_due_at);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee   ON tickets(assignee_id);
CREATE INDEX IF NOT EXISTS idx_comments_ticket    ON comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_runbooks_category  ON runbooks(category);
CREATE INDEX IF NOT EXISTS idx_cmdb_type          ON cmdb_items(type);
CREATE INDEX IF NOT EXISTS idx_docs_metadata      ON alertmind_documents USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_docs_embedding     ON alertmind_documents
  USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);

-- Full-text search on tickets
CREATE INDEX IF NOT EXISTS idx_tickets_search ON tickets
  USING GIN(to_tsvector('english', title || ' ' || description));

-- ── match_documents function (required by LangChain/Flowise) ─
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding VECTOR(768),
  match_count     INT   DEFAULT 5,
  filter          JSONB DEFAULT '{}'
)
RETURNS TABLE (
  id         UUID,
  content    TEXT,
  metadata   JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id, d.content, d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM alertmind_documents d
  WHERE d.metadata @> filter
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END; $$;

-- ── Views ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW ticket_daily_stats AS
SELECT
  DATE(created_at)                                       AS day,
  COUNT(*)                                               AS incidents,
  COUNT(*) FILTER (WHERE status = 'resolved')            AS resolved,
  COUNT(*) FILTER (WHERE ai_analyzed = TRUE)             AS ai_resolved,
  COUNT(*) FILTER (WHERE sla_breached = TRUE)            AS sla_breached,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/60)
    FILTER (WHERE resolved_at IS NOT NULL)               AS avg_resolution_mins
FROM tickets
GROUP BY DATE(created_at)
ORDER BY day DESC;

-- ── Seed default admin user ────────────────────────────────
-- Password: Admin@2026 (bcrypt hash)
INSERT INTO users (name, email, password_hash, role, team)
VALUES ('Admin', 'admin@alertmind.ai',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj0n/X7z5Ake',
  'admin', 'Platform')
ON CONFLICT (email) DO NOTHING;

-- Webhook ticket creator. Not a Keycloak login; do not share this email with a realm user.
INSERT INTO users (name, email, password_hash, role, team)
VALUES ('AlertMind System', 'system@alertmind.ai', '', 'admin', 'Platform')
ON CONFLICT (email) DO NOTHING;

-- ── Seed sample runbooks ───────────────────────────────────
INSERT INTO runbooks (title, content, category, tags) VALUES
('CPU High Usage — Diagnosis & Resolution',
'## Steps to resolve CPU spike\n1. SSH into affected server: ssh root@{hostname}\n2. Identify top processes: top -bn1 | head -20\n3. Check load average: uptime\n4. Kill runaway process: kill -9 {PID}\n5. If Java: check heap with jmap -heap {PID}\n6. Verify: watch -n2 "uptime && ps aux --sort=-%cpu | head -5"\n\n## Prevention\n- Set CPU alerts at 80%\n- Configure OOM killer\n- Review resource limits',
'Infrastructure', ARRAY['cpu','performance','linux']),

('PostgreSQL Connection Pool Exhaustion',
'## Symptoms\n- Error: FATAL remaining connection slots reserved\n- API 503 errors\n\n## Resolution\n1. Check connections: SELECT count(*), state FROM pg_stat_activity GROUP BY state;\n2. Kill idle: SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = ''idle'' AND query_start < NOW() - INTERVAL ''5 minutes'';\n3. Increase max_connections in postgresql.conf\n4. Restart: sudo systemctl restart postgresql\n\n## Prevention\n- Use connection pooling (PgBouncer)\n- Set connection timeouts',
'Database', ARRAY['postgres','connections','database']),

('Kubernetes Pod CrashLoopBackOff',
'## Diagnosis\n1. Check pod: kubectl describe pod {pod-name} -n {namespace}\n2. Check logs: kubectl logs {pod-name} --previous\n3. Check events: kubectl get events --sort-by=.metadata.creationTimestamp\n\n## Resolution\n1. Check resource limits: kubectl get pod {pod-name} -o yaml | grep -A 5 resources\n2. Increase limits if OOMKilled\n3. Fix config errors from logs\n4. Delete and recreate: kubectl delete pod {pod-name}\n\n## Prevention\n- Set resource requests and limits\n- Configure liveness/readiness probes',
'K8s', ARRAY['kubernetes','pods','crash'])
ON CONFLICT DO NOTHING;

SELECT 'AlertMind database initialized successfully ✅' AS status;
SELECT 'Tables: users, tickets, comments, runbooks, cmdb_items, alertmind_documents' AS tables;
SELECT 'Default admin: admin@alertmind.ai / Admin@2026' AS credentials;
