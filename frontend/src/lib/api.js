// ═══════════════════════════════════════════════════════════
//  AlertMind — API Client (src/lib/api.js)
//
//  Adapter layer over the Django/DRF + Keycloak backend.
//  It normalizes Django responses into the shapes the React
//  components already expect (envelopes, nested relations,
//  synchronous-looking AI analysis), so pages need no changes.
//
//  Backend contract reference:
//    - DRF router routes REQUIRE a trailing slash.
//    - Auth is Keycloak (OIDC). Login uses the Resource-Owner
//      Password grant against the realm token endpoint; the API
//      itself only accepts Keycloak-issued Bearer JWTs.
// ═══════════════════════════════════════════════════════════
import axios from "axios";

// Keycloak is reachable same-origin via the nginx `/auth/` proxy.
// In `vite` dev you must proxy `/auth` too (see vite.config.js note).
const KEYCLOAK_URL    = import.meta.env.VITE_KEYCLOAK_URL    || "/auth";
const KEYCLOAK_REALM  = import.meta.env.VITE_KEYCLOAK_REALM  || "alertmind";
const KEYCLOAK_CLIENT = import.meta.env.VITE_KEYCLOAK_CLIENT || "alertmind-frontend";
const API_BASE        = import.meta.env.VITE_API_URL || "";

const TOKEN_KEY = "am_token";
const REFRESH_KEY = "am_refresh";
const tokenUrl = () =>
  `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;
const logoutUrl = () =>
  `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/logout`;

export function persistTokens({ access_token, refresh_token }) {
  if (access_token) localStorage.setItem(TOKEN_KEY, access_token);
  if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

let refreshInFlight = null;

async function refreshAccessToken() {
  const refresh_token = localStorage.getItem(REFRESH_KEY);
  if (!refresh_token) return null;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: KEYCLOAK_CLIENT,
    refresh_token,
  });
  const tokenRes = await axios.post(tokenUrl(), body, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  persistTokens(tokenRes.data);
  return tokenRes.data.access_token;
}

function refreshOnce() {
  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

const api = axios.create({ baseURL: API_BASE, timeout: 60000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res.data,
  async (err) => {
    const original = err.config || {};
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const token = await refreshOnce();
        if (token) {
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        }
      } catch { /* fall through to logout */ }
      clearTokens();
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err.response?.data || err);
  }
);

// ── Normalizers ───────────────────────────────────────────
// Django serializes relations flat (assignee_name / assignee_email);
// components read nested `t.assignee?.name` / `t.creator?.name`.
function normalizeTicket(t) {
  if (!t || typeof t !== "object") return t;
  return {
    ...t,
    assignee: t.assignee_name
      ? { name: t.assignee_name, email: t.assignee_email, team: t.team }
      : null,
    creator: t.creator_name
      ? { name: t.creator_name, email: t.creator_email }
      : null,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Auth (Keycloak ROPC) ──────────────────────────────────
export const authAPI = {
  login: async ({ email, password }) => {
    const body = new URLSearchParams({
      grant_type: "password",
      client_id : KEYCLOAK_CLIENT,
      username  : email,
      password,
      scope     : "openid profile email",
    });

    let tokenRes;
    try {
      tokenRes = await axios.post(tokenUrl(), body, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
    } catch (e) {
      throw { error: e.response?.data?.error_description || "Invalid email or password" };
    }

    persistTokens(tokenRes.data);
    const token = tokenRes.data.access_token;

    let user = null;
    try {
      const me = await axios.get(`${API_BASE}/api/auth/me/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      user = me.data;
    } catch { /* profile sync is best-effort */ }

    return { token, user };
  },
  me: () => api.get("/api/auth/me/"),
  logout: async () => {
    const refresh_token = localStorage.getItem(REFRESH_KEY);
    clearTokens();
    if (!refresh_token) return;
    try {
      await axios.post(
        logoutUrl(),
        new URLSearchParams({
          client_id: KEYCLOAK_CLIENT,
          refresh_token,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
    } catch { /* already cleared locally */ }
  },
};

// ── Tickets ───────────────────────────────────────────────
export const ticketAPI = {
  // Dashboard/Incidents read `data.data`; return an envelope.
  list: async (p) => {
    const res = await api.get("/api/tickets/", { params: p });
    const arr = Array.isArray(res) ? res : res?.data || [];
    const data = arr.map(normalizeTicket);
    return { data, total: data.length, count: data.length };
  },
  // TicketDetail reads `ticket.comments`; Django exposes them separately.
  get: async (id) => {
    const [t, comments] = await Promise.all([
      api.get(`/api/tickets/${id}/`),
      api.get(`/api/tickets/${id}/comments/`).catch(() => []),
    ]);
    return { ...normalizeTicket(t), comments: Array.isArray(comments) ? comments : [] };
  },
  create : (d)     => api.post("/api/tickets/", d).then(normalizeTicket),
  update : (id, d) => api.patch(`/api/tickets/${id}/`, d).then(normalizeTicket),
  delete : (id)    => api.delete(`/api/tickets/${id}/`),
  comment: (id, d) => api.post(`/api/tickets/${id}/add-comment/`, d),
  resolve: (id, d) => api.post(`/api/tickets/${id}/resolve/`, d).then(normalizeTicket),
};

// ── RAG / AI ──────────────────────────────────────────────
export const ragAPI = {
  // hooks call analyze({ ticket_id, ... }) and expect a finished result
  // ({ confidence, root_cause, resolution_steps }). Django runs the
  // analysis asynchronously via Celery, so we trigger then poll the
  // ticket until a *fresh* analysis lands.
  analyze: async (payload) => {
    const id = payload?.ticket_id || payload?.id || payload;

    let prevAt = null;
    try { prevAt = (await api.get(`/api/tickets/${id}/`))?.ai_analyzed_at || null; } catch { /* ignore */ }

    await api.post(`/api/tickets/${id}/analyze/`);

    const deadline = Date.now() + 90000; // give the LLM up to ~90s
    let ticket = null;
    while (Date.now() < deadline) {
      await sleep(3000);
      try { ticket = await api.get(`/api/tickets/${id}/`); } catch { continue; }
      if (ticket?.ai_analyzed && ticket.ai_analyzed_at !== prevAt) break;
    }

    return {
      confidence      : ticket?.ai_confidence ?? 0,
      root_cause      : ticket?.ai_resolution || "Analysis still running — refresh shortly.",
      resolution_steps: ticket?.ai_steps || [],
    };
  },
  search: (d)  => api.post("/api/rag/search/", d),
  chat  : (d)  => api.post("/api/rag/chat/", d, { timeout: 120000 }),
  pir   : (id) => api.get(`/api/tickets/${id}/pir/`),
};

// ── Runbooks (bare array responses) ───────────────────────
export const runbookAPI = {
  list   : (p)     => api.get("/api/runbooks/", { params: p }),
  get    : (id)    => api.get(`/api/runbooks/${id}/`),
  create : (d)     => api.post("/api/runbooks/", d),
  update : (id, d) => api.patch(`/api/runbooks/${id}/`, d),
  delete : (id)    => api.delete(`/api/runbooks/${id}/`),
};

// ── Dashboard (one Django endpoint → several view-model slices) ──
const fetchDashboard = () => api.get("/api/dashboard/");

export const dashboardAPI = {
  stats: async () => {
    const d = await fetchDashboard();
    const daily  = d.daily_stats || [];
    const sumInc = daily.reduce((a, x) => a + (x.incidents   || 0), 0);
    const sumAi  = daily.reduce((a, x) => a + (x.ai_resolved || 0), 0);
    const today  = daily[0] || {};
    return {
      open          : d.status_breakdown?.open   ?? 0,
      p1_active     : d.severity_breakdown?.P1   ?? 0,
      resolved_today: today.resolved             ?? 0,
      ai_rate       : sumInc ? Math.round((sumAi / sumInc) * 100) : 0,
      sla_breached  : d.sla_breached             ?? 0,
      ...d,
    };
  },
  // recharts wants oldest→newest; Django returns newest first.
  trend: async () => {
    const d = await fetchDashboard();
    return [...(d.daily_stats || [])].reverse().map((x) => ({
      day: x.day, incidents: x.incidents, resolved: x.resolved,
    }));
  },
  // Django has no "at risk" bucket; approximate from active vs breached.
  sla: async () => {
    const d = await fetchDashboard();
    const breached = d.sla_breached     ?? 0;
    const active   = d.active_incidents ?? 0;
    return { breached, at_risk: 0, ok: Math.max(0, active - breached) };
  },
};

// ── Ingestion (Django takes JSON text, not multipart) ─────
export const ingestAPI = {
  file: async (file, collection) => {
    const content = await file.text();
    const res = await api.post("/api/ingest/", {
      content,
      filename: file.name,
      collection,
    });
    return { file: res.file || file.name, chunks: 1, ...res };
  },
  stats: () => api.get("/api/rag/stats/"),
};

// ── CMDB (bare array responses) ───────────────────────────
export const cmdbAPI = {
  list  : ()      => api.get("/api/cmdb/"),
  get   : (id)    => api.get(`/api/cmdb/${id}/`),
  create: (d)     => api.post("/api/cmdb/", d),
  update: (id, d) => api.patch(`/api/cmdb/${id}/`, d),
  delete: (id)    => api.delete(`/api/cmdb/${id}/`),
};

export default api;
