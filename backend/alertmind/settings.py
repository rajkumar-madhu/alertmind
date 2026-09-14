import os
from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get("JWT_SECRET", "django-insecure-keycloak-custom-secret-key-alertmind")

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.environ.get("NODE_ENV") != "production"

ALLOWED_HOSTS = ["*"]

# Application definition
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "api",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # OPA Authorization Middleware
    "api.middleware.OpaAuthorizationMiddleware",
]

ROOT_URLCONF = "alertmind.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "alertmind.wsgi.application"
ASGI_APPLICATION = "alertmind.asgi.application"

# Database
# Parses DATABASE_URL or defaults to Postgres
import urllib.parse
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://alertmind:alertmind_secret@db:5432/alertmind")
parsed = urllib.parse.urlparse(DATABASE_URL)

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": parsed.path.lstrip("/"),
        "USER": parsed.username,
        "PASSWORD": parsed.password,
        "HOST": parsed.hostname,
        "PORT": parsed.port or 5432,
    }
}

# Password validation
AUTH_PASSWORD_VALIDATORS = []

# Internationalization
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# CORS Settings — the SPA origin, not "*". Prod ConfigMap sets FRONTEND_URL.
_cors_defaults = [
    "http://localhost:5173",
    "http://localhost:5175",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5175",
]
_cors_from_env = [
    origin.strip().rstrip("/")
    for origin in os.environ.get("FRONTEND_URL", "").split(",")
    if origin.strip()
]
CORS_ALLOWED_ORIGINS = list(dict.fromkeys(_cors_defaults + _cors_from_env))
CORS_ALLOW_CREDENTIALS = True

# REST Framework Settings
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "api.auth.KeycloakAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
}

# Celery Configurations
CELERY_BROKER_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("REDIS_URL", "redis://redis:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "UTC"

# Celery Beat — periodic SLA breach scan. Without this schedule the
# `celery_beat` container runs against an empty schedule and
# `check_sla_breaches_task` never fires, so SLA breaches are never flagged.
# Runs every 60s (P1 SLA is 15 min, so per-minute granularity is sufficient).
CELERY_BEAT_SCHEDULE = {
    "check-sla-breaches": {
        "task": "api.tasks.check_sla_breaches_task",
        "schedule": float(os.environ.get("SLA_SCAN_INTERVAL_SECONDS", "60")),
    },
}

# Keycloak Settings
KEYCLOAK_SERVER_URL = os.environ.get("KEYCLOAK_SERVER_URL", "http://keycloak:8080/auth")
KEYCLOAK_REALM = os.environ.get("KEYCLOAK_REALM", "alertmind")
KEYCLOAK_AUDIENCE = os.environ.get("KEYCLOAK_AUDIENCE", "alertmind-frontend")
# Optional. Token `iss` is often a public URL that does not match the in-cluster
# KEYCLOAK_SERVER_URL — only set this when you know the issuer claim.
KEYCLOAK_ISSUER = os.environ.get("KEYCLOAK_ISSUER", "")

# Shared secret for /api/webhook/*. Alertmanager should send
#   Authorization: Bearer <WEBHOOK_SECRET>
# or X-AlertMind-Webhook-Token: <WEBHOOK_SECRET>
# Unset secret: in-cluster Alertmanager (wecrew-ops → ClusterIP) is still
# allowed; public *.wecrew.in hosts are rejected. A *set* secret is always
# enforced.
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")
WEBHOOK_PUBLIC_HOSTS = tuple(
    h.strip()
    for h in os.environ.get("WEBHOOK_PUBLIC_HOSTS", ".wecrew.in").split(",")
    if h.strip()
)

# OPA Sidecar URL
OPA_URL = os.environ.get("OPA_URL", "http://opa:8181/v1/data/alertmind/authz")

# LLM Configuration
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://173.249.2.23:11434")
LLM_MODEL = os.environ.get("LLM_MODEL", "llama3.3:70b-instruct-q4_K_M")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
# Generic OpenAI-compatible provider — takes precedence over GROQ_* when set.
# Used for xAI (Grok): LLM_API_BASE=https://api.x.ai/v1, LLM_API_MODEL=grok-4.5.
# Works for any /chat/completions-compatible endpoint (OpenAI, Together, vLLM, …).
LLM_API_BASE = os.environ.get("LLM_API_BASE", "https://api.x.ai/v1")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
LLM_API_MODEL = os.environ.get("LLM_API_MODEL", "grok-4.5")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "nomic-embed-text")
FLOWISE_API_URL = os.environ.get("FLOWISE_API_URL", "http://flowise:3001/api/v1/prediction")
