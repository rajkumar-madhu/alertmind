import logging
import requests
from django.conf import settings
from django.http import JsonResponse
from api.models import Ticket, Comment, Runbook, User as DBUser
from api.authz import classify_request, looks_like_uuid

logger = logging.getLogger(__name__)


class OpaAuthorizationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path
        if not path.startswith("/api/"):
            return self.get_response(request)

        bypass_paths = [
            "/api/health/",
            "/api/webhook/",
        ]
        if any(path.startswith(bp) for bp in bypass_paths):
            return self.get_response(request)

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

        if not user or not getattr(user, "is_authenticated", False):
            return self.get_response(request)

        classified = classify_request(request.method, path)
        action = classified["action"]
        resource_type = classified["resource_type"]
        resource_id = classified["resource_id"]

        owner = None
        assignee = None
        owner_id = None
        assignee_id = None

        if resource_id and looks_like_uuid(resource_id) and action in ["update", "delete"]:
            owner, assignee, owner_id, assignee_id = _load_resource_principals(
                resource_type, resource_id
            )

        opa_payload = {
            "input": {
                "user": {
                    "id": str(getattr(user, "id", "") or ""),
                    "username": user.email,
                    "email": user.email,
                    "roles": [user.role],
                    "team": user.team or "Platform",
                },
                "action": action,
                "resource": resource_type,
                "resource_owner": owner,
                "resource_assignee": assignee,
                "resource_owner_id": owner_id,
                "resource_assignee_id": assignee_id,
            }
        }

        try:
            response = requests.post(settings.OPA_URL, json=opa_payload, timeout=2)
            response.raise_for_status()
            opa_result = response.json()

            result = opa_result.get("result", {})
            allowed = False
            if isinstance(result, bool):
                allowed = result
            elif isinstance(result, dict):
                allowed = result.get("allow", False)

            if not allowed:
                logger.warning(
                    f"OPA Denied request: User {user.email} -> {action} on {resource_type} "
                    f"(owner: {owner}, assignee: {assignee})"
                )
                return JsonResponse(
                    {"detail": "Forbidden: You do not have permission to perform this action (OPA PBAC Policy Violation)"},
                    status=403,
                )

        except Exception as e:
            logger.error(f"Failed to communicate with OPA sidecar: {e}")
            if not settings.DEBUG:
                return JsonResponse({"detail": "Authorization server error"}, status=500)
            logger.warning("OPA Sidecar unavailable, bypassing check in DEBUG mode")

        return self.get_response(request)


def _load_resource_principals(resource_type, resource_id):
    owner = assignee = owner_id = assignee_id = None
    try:
        if resource_type == "ticket":
            ticket = Ticket.objects.filter(id=resource_id).select_related("creator", "assignee").first()
            if ticket:
                owner = ticket.creator.email if ticket.creator else None
                owner_id = str(ticket.creator_id) if ticket.creator_id else None
                if ticket.assignee_id:
                    assignee = ticket.assignee.email if ticket.assignee else None
                    assignee_id = str(ticket.assignee_id)
        elif resource_type == "comment":
            comment = Comment.objects.filter(id=resource_id).select_related("user").first()
            if comment:
                owner = comment.user.email if comment.user else None
                owner_id = str(comment.user_id) if comment.user_id else None
        elif resource_type == "runbook":
            runbook = Runbook.objects.filter(id=resource_id).first()
            if runbook and runbook.created_by:
                owner_id = str(runbook.created_by)
                creator_user = DBUser.objects.filter(id=runbook.created_by).first()
                if creator_user:
                    owner = creator_user.email
    except Exception as db_err:
        logger.error(f"Error fetching resource metadata for OPA: {db_err}")
    return owner, assignee, owner_id, assignee_id
