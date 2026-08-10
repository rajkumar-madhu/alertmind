// Deep links into the wecrew-ops observability stack (sovereign.ops.wecrew.in).
//
// AlertMind stores `affected_ci` as the CMDB item name. For anything synced from the
// cluster by scripts/sync-cluster-cmdb.sh that is "<namespace>/<workload>" (e.g.
// "alertmind/api"); ingress-derived items are bare hostnames ("harbor.wecrew.in").
// Both shapes are handled below.
//
// Read-only: these only build URLs, they never call wecrew-ops.

// Override at build time with VITE_OPS_URL if the ops stack moves.
export const OPS_BASE = import.meta.env.VITE_OPS_URL || "https://ops.wecrew.in";

/** Split "namespace/workload" into its parts; returns null for non-namespaced CIs. */
export function parseCi(ci) {
  if (!ci || typeof ci !== "string") return null;
  const m = ci.match(/^([a-z0-9][a-z0-9-]*)\/(.+)$/i);
  return m ? { namespace: m[1], workload: m[2] } : null;
}

/**
 * Grafana link for a CI. Namespaced CIs land on a dashboard search scoped to the
 * workload; everything else falls back to a plain search on the CI string. We search
 * rather than deep-link a dashboard UID because dashboard UIDs are not stable across
 * wecrew-ops redeploys — a search always resolves, a stale UID 404s.
 */
export function grafanaUrl(ci) {
  const parsed = parseCi(ci);
  const query = parsed ? parsed.workload : ci;
  if (!query) return `${OPS_BASE}/grafana/`;
  return `${OPS_BASE}/grafana/dashboards?query=${encodeURIComponent(query)}`;
}

/** The wecrew-ops console itself — service view for the CI's namespace. */
export function opsConsoleUrl(ci) {
  const parsed = parseCi(ci);
  return parsed ? `${OPS_BASE}/?namespace=${encodeURIComponent(parsed.namespace)}` : OPS_BASE;
}

/** True when a CI is worth rendering observability links for. */
export function hasObservability(ci) {
  return Boolean(ci && ci !== "—" && ci.trim());
}
