"""Public and local hostnames for CORS, CSRF, Django Host, and Keycloak.

wecrew production:
  https://alertmind.wecrew.in      SPA via in-cluster nginx
  https://alertmind.api.wecrew.in  API ingress (browser origin for VITE_API_URL)
In-cluster names (api.alertmind.svc.cluster.local) stay private — they are not
browser origins and must not be treated as internet-facing webhook hosts.
"""

WECREW_SPA_HOST = "alertmind.wecrew.in"
WECREW_API_HOST = "alertmind.api.wecrew.in"
WECREW_SPA_ORIGIN = "https://alertmind.wecrew.in"
WECREW_API_ORIGIN = "https://alertmind.api.wecrew.in"
WECREW_PUBLIC_SUFFIX = ".wecrew.in"

LOCAL_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://localhost:5175",
    "http://localhost:8090",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5175",
    "http://127.0.0.1:8090",
)

WECREW_CORS_ORIGINS = (
    WECREW_SPA_ORIGIN,
    WECREW_API_ORIGIN,
)

DEFAULT_CORS_ORIGINS = LOCAL_CORS_ORIGINS + WECREW_CORS_ORIGINS

DEFAULT_ALLOWED_HOSTS = (
    "localhost",
    "127.0.0.1",
    "api",
    "web",
    "nginx",
    WECREW_SPA_HOST,
    WECREW_API_HOST,
    WECREW_PUBLIC_SUFFIX,
    "api.alertmind.svc",
    "api.alertmind.svc.cluster.local",
)


def parse_csv(value, defaults=()):
    """Split a comma-separated env value; fall back to defaults when empty."""
    items = [part.strip().rstrip("/") for part in (value or "").split(",") if part.strip()]
    if items:
        return tuple(dict.fromkeys(items))
    return tuple(defaults)
