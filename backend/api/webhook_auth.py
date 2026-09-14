"""Shared-secret check for unauthenticated webhook callers (Alertmanager, n8n).

wecrew-ops Alertmanager posts in-cluster to
`http://api.alertmind.svc.cluster.local:8000/api/webhook/prometheus/` — that
path must keep working without editing the live Argus/wecrew-ops receiver.

The public hosts (`*.wecrew.in`) are a different trust boundary: they always
require WEBHOOK_SECRET, and nginx/ingress also 403 `/api/webhook/` so the
internet never reaches the view.
"""

import hmac
import logging

from api.hosts import WECREW_PUBLIC_SUFFIX

logger = logging.getLogger(__name__)

WEBHOOK_TOKEN_HEADER = "X-AlertMind-Webhook-Token"
DEFAULT_PUBLIC_SUFFIXES = (WECREW_PUBLIC_SUFFIX,)


def extract_webhook_token(headers):
    """Read the webhook secret from a case-insensitive header map or Bearer."""
    if headers is None:
        return ""
    getter = headers.get if hasattr(headers, "get") else lambda _k, d="": d
    provided = (
        getter(WEBHOOK_TOKEN_HEADER)
        or getter("X-Alertmind-Webhook-Token")
        or ""
    )
    if provided:
        return provided.strip()
    auth = getter("Authorization") or getter("HTTP_AUTHORIZATION") or ""
    parts = auth.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return ""


def is_public_webhook_host(host, public_suffixes=DEFAULT_PUBLIC_SUFFIXES):
    """True for internet-facing AlertMind hosts (Argus/wecrew public DNS)."""
    hostname = (host or "").split(":")[0].lower().strip()
    if not hostname:
        return False
    for suffix in public_suffixes or ():
        suffix = (suffix or "").lower().strip()
        if not suffix:
            continue
        if not suffix.startswith("."):
            if hostname == suffix:
                return True
            suffix = "." + suffix
        if hostname.endswith(suffix):
            return True
    return False


def is_webhook_authorized(headers, secret, debug=False, public_request=False):
    """Authorize a webhook caller.

    * WEBHOOK_SECRET set → token must match (in-cluster and public).
    * Secret unset + public host (`*.wecrew.in`) → deny. This is the
      internet-facing API/SPA ingress; never leave it open.
    * Secret unset + in-cluster Host (Alertmanager → ClusterIP) → allow so
      the wecrew-ops receiver does not have to change on deploy.
    * DEBUG + unset secret → allow (local `make up`).
    """
    secret = (secret or "").strip()
    provided = extract_webhook_token(headers)
    if secret:
        if not provided:
            return False
        return hmac.compare_digest(provided.encode("utf-8"), secret.encode("utf-8"))

    if debug:
        logger.warning(
            "WEBHOOK_SECRET is unset; allowing webhook in DEBUG. "
            "Set WEBHOOK_SECRET before any non-local deploy."
        )
        return True

    if public_request:
        logger.error("WEBHOOK_SECRET is unset; rejecting public webhook (fail closed)")
        return False

    logger.warning(
        "WEBHOOK_SECRET is unset; allowing in-cluster webhook so wecrew-ops "
        "Alertmanager keeps firing. Set WEBHOOK_SECRET (and the Bearer on the "
        "receiver) to lock this path down."
    )
    return True
