"""Pure request classification for OPA (no Django imports).

HTTP verbs are a poor stand-in for DRF `@action`s: POST /tickets/<id>/resolve/
must be an *update* (ownership) not a *create* (any engineer). Keep this module
free of Django so the mapping can be unit-tested without a database.
"""

from uuid import UUID

RESOURCE_MAPPING = {
    "tickets": "ticket",
    "comments": "comment",
    "runbooks": "runbook",
    "cmdb": "cmdb",
    "users": "user",
    "rag": "rag",
    "ingest": "document",
}

METHOD_ACTIONS = {
    "GET": "read",
    "HEAD": "read",
    "OPTIONS": "read",
    "POST": "create",
    "PUT": "update",
    "PATCH": "update",
    "DELETE": "delete",
}

# Nested ticket routes whose POST is a write against an existing ticket.
TICKET_UPDATE_ACTIONS = frozenset({"resolve", "analyze"})
TICKET_COMMENT_ACTIONS = frozenset({"add-comment"})
# RAG search/chat/stats POST a body but do not mutate state.
RAG_READ_ACTIONS = frozenset({"search", "chat", "stats"})


def looks_like_uuid(value):
    if not value:
        return False
    try:
        UUID(str(value))
        return True
    except (ValueError, TypeError, AttributeError):
        return False


def classify_request(method, path):
    """Return {action, resource_type, resource_id, nested} for an /api/ path."""
    action = METHOD_ACTIONS.get((method or "GET").upper(), "read")
    parts = [p for p in (path or "").split("/") if p]
    resource = parts[1] if len(parts) >= 2 else None
    resource_id = parts[2] if len(parts) >= 3 else None
    nested = parts[3] if len(parts) >= 4 else None
    resource_type = RESOURCE_MAPPING.get(resource, "unknown")

    if resource_type == "rag":
        action = "read"
        # /api/rag/search/ — "search" is an action name, not a resource id
        if resource_id in RAG_READ_ACTIONS:
            nested = resource_id
            resource_id = None

    if resource_type == "ticket" and nested in TICKET_UPDATE_ACTIONS:
        action = "update"

    if resource_type == "ticket" and nested in TICKET_COMMENT_ACTIONS:
        resource_type = "comment"
        action = "create"
        # Keep the ticket UUID so callers can still load the parent if needed.
        # Object-level comment ownership does not apply to create.

    if resource_id and not looks_like_uuid(resource_id):
        # Don't treat action names (/api/rag/search/) as resource ids.
        if resource_id in TICKET_UPDATE_ACTIONS | TICKET_COMMENT_ACTIONS | RAG_READ_ACTIONS:
            nested = nested or resource_id
            resource_id = None

    return {
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "nested": nested,
    }
