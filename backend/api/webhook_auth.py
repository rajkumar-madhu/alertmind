"""Shared-secret check for unauthenticated webhook callers (Alertmanager, n8n)."""

import hmac
import logging

logger = logging.getLogger(__name__)

WEBHOOK_TOKEN_HEADER = "X-AlertMind-Webhook-Token"


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


def is_webhook_authorized(headers, secret, debug=False):
    """Return True iff the caller presented the configured webhook secret.

    Production (debug=False) fails closed when WEBHOOK_SECRET is unset, so a
    misconfigured deploy cannot silently expose ticket create/resolve.
    DEBUG with an empty secret is allowed so `make up` still works before .env
    is filled in — but a *set* secret is always enforced, including in DEBUG.
    """
    secret = (secret or "").strip()
    provided = extract_webhook_token(headers)
    if not secret:
        if debug:
            logger.warning(
                "WEBHOOK_SECRET is unset; allowing webhook in DEBUG. "
                "Set WEBHOOK_SECRET before any non-local deploy."
            )
            return True
        logger.error("WEBHOOK_SECRET is unset; rejecting webhook (fail closed)")
        return False
    if not provided:
        return False
    return hmac.compare_digest(provided.encode("utf-8"), secret.encode("utf-8"))
