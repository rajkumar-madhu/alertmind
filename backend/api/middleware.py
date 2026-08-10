import json
import logging
import requests
from django.conf import settings
from django.http import JsonResponse
from api.models import Ticket, Comment, Runbook, CmdbItem

logger = logging.getLogger(__name__)

class OpaAuthorizationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Only check authorization for /api/ routes, excluding public routes
        path = request.path
        if not path.startswith("/api/"):
            return self.get_response(request)

        # Public endpoints that bypass OPA authorization
        bypass_paths = [
            "/api/health/",
            "/api/webhook/", # webhook uses its own verification or security
        ]
        if any(path.startswith(bp) for bp in bypass_paths):
            return self.get_response(request)

        # Get response first to let Django authenticate the request via rest_framework middleware
        # Since authentication happens inside DRF views, we must evaluate auth ourselves or
        # let request pass if user is not authenticated (DRF will return 401).
        # We can extract the user by running the authenticators manually.
        from api.auth import KeycloakAuthentication
        try:
            auth_res = KeycloakAuthentication().authenticate(request)
            if auth_res:
                user, token = auth_res
                request.user = user
            else:
                user = request.user
        except Exception as e:
            logger.warning(f"Authentication failed in middleware: {e}")
            return JsonResponse({"detail": "Authentication failed in authorization check"}, status=401)

        if not user or not user.is_authenticated:
            # Let DRF handle anonymous access permissions
            return self.get_response(request)

        # Map HTTP method to action
        method_actions = {
            "GET": "read",
            "HEAD": "read",
            "OPTIONS": "read",
            "POST": "create",
            "PUT": "update",
            "PATCH": "update",
            "DELETE": "delete",
        }
        action = method_actions.get(request.method, "read")

        # Determine resource and ID from path
        # Paths are typically: /api/tickets/, /api/tickets/<uuid>/, etc.
        parts = [p for p in path.split("/") if p]
        resource = None
        resource_id = None
        
        if len(parts) >= 2:
            resource = parts[1] # e.g. "tickets", "runbooks", "cmdb", "comments"
            if len(parts) >= 3:
                resource_id = parts[2]

        # Singularize resource for Rego mapping
        resource_mapping = {
            "tickets": "ticket",
            "comments": "comment",
            "runbooks": "runbook",
            "cmdb": "cmdb",
            "users": "user",
            "rag": "rag",
            "ingest": "document",
        }
        resource_type = resource_mapping.get(resource, "unknown")

        # RAG endpoints (search/chat/stats) are read-only queries against the
        # knowledge base — they use POST to carry a request body, not to mutate
        # state. Treat them as "read" so any authenticated user (engineer or
        # viewer) can use the AI console, not just admins.
        if resource_type == "rag":
            action = "read"

        # Fetch owner and assignee if it's an update/delete on a specific resource
        owner = None
        assignee = None

        if resource_id and action in ["update", "delete"]:
            try:
                if resource_type == "ticket":
                    ticket = Ticket.objects.filter(id=resource_id).first()
                    if ticket:
                        owner = ticket.creator.email
                        assignee = ticket.assignee.email if ticket.assignee else None
                elif resource_type == "comment":
                    comment = Comment.objects.filter(id=resource_id).first()
                    if comment:
                        owner = comment.user.email
                elif resource_type == "runbook":
                    # Runbook creators might be stored as UUID or null
                    runbook = Runbook.objects.filter(id=resource_id).first()
                    if runbook and runbook.created_by:
                        from api.models import User as DBUser
                        creator_user = DBUser.objects.filter(id=runbook.created_by).first()
                        if creator_user:
                            owner = creator_user.email
            except Exception as db_err:
                logger.error(f"Error fetching resource metadata for OPA: {db_err}")

        # Construct input payload for OPA
        opa_payload = {
            "input": {
                "user": {
                    "username": user.email,
                    "email": user.email,
                    "roles": [user.role],
                    "team": user.team or "Platform"
                },
                "action": action,
                "resource": resource_type,
                "resource_owner": owner,
                "resource_assignee": assignee
            }
        }

        # Query OPA Sidecar
        try:
            response = requests.post(settings.OPA_URL, json=opa_payload, timeout=2)
            response.raise_for_status()
            opa_result = response.json()
            
            # OPA response format is usually: {"result": {"allow": true}} or {"result": true}
            result = opa_result.get("result", {})
            allowed = False
            if isinstance(result, bool):
                allowed = result
            elif isinstance(result, dict):
                allowed = result.get("allow", False)
                
            if not allowed:
                logger.warning(f"OPA Denied request: User {user.email} -> {action} on {resource_type} (owner: {owner}, assignee: {assignee})")
                return JsonResponse(
                    {"detail": "Forbidden: You do not have permission to perform this action (OPA PBAC Policy Violation)"},
                    status=403
                )
                
        except Exception as e:
            # If OPA is offline, fail closed in production, but in debug let it pass with warnings
            logger.error(f"Failed to communicate with OPA sidecar: {e}")
            if not settings.DEBUG:
                return JsonResponse({"detail": "Authorization server error"}, status=500)
            else:
                logger.warning("OPA Sidecar unavailable, bypassing check in DEBUG mode")

        return self.get_response(request)
