import os
import json
import logging
import re
import requests
from datetime import datetime, timedelta
from django.conf import settings
from django.utils import timezone
from django.db import connection
from django.db.models import Q
from django.http import JsonResponse
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import User, Ticket, Comment, Runbook, CmdbItem, AlertmindDocument
from api.serializers import UserSerializer, TicketSerializer, CommentSerializer, RunbookSerializer, CmdbItemSerializer
from api.tasks import analyze_ticket_task, query_vector_store, generate_embedding
from api.llm import generate, chat
from api.webhook_auth import is_webhook_authorized

logger = logging.getLogger(__name__)

# Helper to insert into Vector DB
def insert_vector_document(content, metadata, collection="incidents"):
    embedding = generate_embedding(content)
    if not embedding:
        return False
    
    embedding_str = "[" + ",".join(map(str, embedding)) + "]"
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO alertmind_documents (content, metadata, embedding, collection, created_at) VALUES (%s, %s::jsonb, %s::vector, %s, NOW())",
                [content, json.dumps(metadata), embedding_str, collection]
            )
        return True
    except Exception as e:
        logger.error(f"Failed to insert vector document: {e}")
        return False


# Pod name -> owning workload. Ordered most-specific first: a Deployment pod
# ("grafana-74cddc568-w57x2") carries both a ReplicaSet hash and a pod hash, so it
# must be tried before the single-suffix DaemonSet pattern would strip only one.
_POD_WORKLOAD_PATTERNS = (
    re.compile(r"^(?P<name>.+)-[a-f0-9]{6,10}-[a-z0-9]{5}$"),  # Deployment -> ReplicaSet pod
    re.compile(r"^(?P<name>.+)-\d+$"),                          # StatefulSet pod (ordinal)
    re.compile(r"^(?P<name>.+)-[a-z0-9]{5}$"),                  # DaemonSet / bare ReplicaSet pod
)


def workload_from_pod(pod):
    """Strip the generated suffix off a pod name to recover its workload name."""
    for pattern in _POD_WORKLOAD_PATTERNS:
        match = pattern.match(pod)
        if match:
            return match.group("name")
    return pod


def derive_affected_ci(labels):
    """Best-effort CMDB item name for an Alertmanager alert's labels.

    `affected_ci` is matched against `cmdb_items.name`, which sync-cluster-cmdb.sh
    writes as "<namespace>/<workload>" for workloads and a bare host for ingresses.
    `labels.instance` does NOT fit that shape: for anything scraped from
    kube-state-metrics it is the *exporter's* address
    ("kube-state-metrics.wecrew-ops.svc.cluster.local:8080"), identical across every
    pod alert in the cluster, so it matches no CMDB item and makes the TicketDetail
    observability deep links point at the exporter instead of the failing workload.

    Preference order runs most-specific to least; `instance` stays as the last-resort
    fallback so alerts carrying no topology labels behave as they did before.
    """
    namespace = (labels.get("namespace") or "").strip()

    def namespaced(name):
        return f"{namespace}/{name}" if namespace else name

    # 1. An explicit workload label, when the rule bothers to set one.
    for key in ("deployment", "statefulset", "daemonset", "workload"):
        value = (labels.get(key) or "").strip()
        if value:
            return namespaced(value)

    # 2. Otherwise recover the workload from the pod name.
    pod = (labels.get("pod") or "").strip()
    if pod:
        return namespaced(workload_from_pod(pod))

    # 3. Service-scoped alerts.
    service = (labels.get("service") or "").strip()
    if service:
        return namespaced(service)

    # 4. Ingress-derived CMDB items are bare hostnames.
    for key in ("ingress", "host"):
        value = (labels.get(key) or "").strip()
        if value:
            return value

    # 5. Node-level alerts (HighNodeCPU, KubeNodeNotReady) name the node itself.
    node = (labels.get("node") or "").strip()
    if node:
        return node

    return (labels.get("instance") or "").strip()


# ── Health Check ──────────────────────────────────────────
@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def health_check(request):
    return Response({"status": "healthy", "service": "alertmind-api"}, status=200)


# ── User Profile ──────────────────────────────────────────
@api_view(["GET"])
def get_user_profile(request):
    serializer = UserSerializer(request.user)
    return Response(serializer.data)


# ── Webhook Endpoints ─────────────────────────────────────
SYSTEM_USER_EMAIL = "system@alertmind.ai"


class WebhookSecretPermission(permissions.BasePermission):
    """Shared secret (header or Bearer) — not a Keycloak JWT."""

    message = "Invalid or missing webhook token"

    def has_permission(self, request, view):
        return is_webhook_authorized(
            request.headers,
            getattr(settings, "WEBHOOK_SECRET", ""),
            debug=settings.DEBUG,
        )


def get_system_user():
    """Ticket creator for inbound alerts. Never insert admin@ from this path."""
    user = User.objects.filter(email=SYSTEM_USER_EMAIL).first()
    if user:
        return user
    user = User.objects.filter(role="admin").first()
    if user:
        return user
    return None


class WebhookViewSet(viewsets.ViewSet):
    authentication_classes = []
    permission_classes = [WebhookSecretPermission]

    @action(detail=False, methods=["post"], url_path="alert")
    def alert_webhook(self, request):
        data = request.data
        title = data.get("title", "External Alert")
        description = data.get("description", "No description provided.")
        severity = data.get("severity", "P3")
        category = data.get("category", "General")
        affected_ci = data.get("affected_ci", "")
        source = data.get("source", "webhook")

        if severity not in ["P1", "P2", "P3", "P4"]:
            severity = "P3"

        sla_mins = {"P1": 15, "P2": 120, "P3": 480, "P4": 1440}.get(severity, 480)
        sla_due_at = timezone.now() + timedelta(minutes=sla_mins)

        system_user = get_system_user()
        if not system_user:
            return Response(
                {"error": "Webhook system user is not provisioned"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        ticket = Ticket.objects.create(
            title=title,
            description=description,
            severity=severity,
            category=category,
            affected_ci=affected_ci,
            source=source,
            status="open",
            creator=system_user,
            sla_due_at=sla_due_at
        )

        analyze_ticket_task.delay(ticket.id)

        return Response({"ticket_id": str(ticket.id), "severity": severity, "status": "created"}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], url_path="prometheus")
    def prometheus_webhook(self, request):
        alerts = request.data.get("alerts", [])
        created_ids = []

        system_user = get_system_user()
        if not system_user:
            return Response(
                {"error": "Webhook system user is not provisioned"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        for alert in alerts:
            if alert.get("status") != "firing":
                continue

            labels = alert.get("labels", {})
            annotations = alert.get("annotations", {})
            
            sev_label = labels.get("severity", "warning").lower()
            severity = {"critical": "P1", "warning": "P2", "info": "P3"}.get(sev_label, "P3")
            sla_mins = {"P1": 15, "P2": 120, "P3": 480, "P4": 1440}.get(severity, 480)
            sla_due_at = timezone.now() + timedelta(minutes=sla_mins)

            ticket = Ticket.objects.create(
                title=annotations.get("summary") or labels.get("alertname", "Prometheus Alert"),
                description=annotations.get("description") or json.dumps(labels),
                severity=severity,
                category="Infrastructure",
                affected_ci=derive_affected_ci(labels),
                source="prometheus",
                status="open",
                creator=system_user,
                sla_due_at=sla_due_at,
                raw_alert=alert
            )
            
            analyze_ticket_task.delay(ticket.id)
            created_ids.append(str(ticket.id))

        return Response({"created": len(created_ids), "ids": created_ids}, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="resolved")
    def resolved_webhook(self, request):
        data = request.data
        ticket_id = data.get("ticket_id")
        resolution = data.get("resolution")
        root_cause = data.get("root_cause")
        prevention = data.get("prevention")

        try:
            ticket = Ticket.objects.get(id=ticket_id)
        except Ticket.DoesNotExist:
            return Response({"error": "Ticket not found"}, status=status.HTTP_404_NOT_FOUND)

        system_user = get_system_user()
        resolved_by_name = system_user.name if system_user else "System"

        ticket.status = "resolved"
        ticket.resolution = resolution
        ticket.root_cause = root_cause
        ticket.prevention = prevention
        ticket.resolved_at = timezone.now()
        ticket.resolved_by = resolved_by_name
        ticket.save()

        # Ingest resolved ticket details into Vector DB
        content = f"Ticket ID: {ticket.id}\nTitle: {ticket.title}\nCategory: {ticket.category}\nSeverity: {ticket.severity}\nDescription: {ticket.description}\nRoot Cause: {ticket.root_cause}\nResolution: {ticket.resolution}\nPrevention: {ticket.prevention}"
        meta = {
            "ticket_id": str(ticket.id),
            "collection": "incidents",
            "severity": ticket.severity,
            "category": ticket.category.lower(),
            "resolved": True,
            "source_file": f"ticket_{ticket.id}"
        }
        ingested = insert_vector_document(content, meta, "incidents")
        if ingested:
            ticket.ingested = True
            ticket.save()

        return Response({"ticket_id": str(ticket.id), "status": "resolved", "ingested": ingested}, status=status.HTTP_200_OK)


# ── CMDB ViewSet ──────────────────────────────────────────
class CmdbItemViewSet(viewsets.ModelViewSet):
    queryset = CmdbItem.objects.all()
    serializer_class = CmdbItemSerializer


# ── Runbooks ViewSet ──────────────────────────────────────
class RunbookViewSet(viewsets.ModelViewSet):
    queryset = Runbook.objects.all()
    serializer_class = RunbookSerializer

    def perform_create(self, serializer):
        # Save current user as creator
        serializer.save(created_by=self.request.user.id)
        
        # Trigger vector ingestion for runbook content
        runbook = serializer.instance
        content = f"Runbook: {runbook.title}\nCategory: {runbook.category}\nTags: {','.join(runbook.tags)}\nContent: {runbook.content}"
        meta = {
            "runbook_id": str(runbook.id),
            "collection": "runbooks",
            "category": runbook.category.lower(),
            "source_file": f"runbook_{runbook.id}"
        }
        insert_vector_document(content, meta, "runbooks")


# ── Tickets ViewSet ───────────────────────────────────────
class TicketViewSet(viewsets.ModelViewSet):
    queryset = Ticket.objects.all()
    serializer_class = TicketSerializer

    def get_queryset(self):
        qs = Ticket.objects.all()

        # Detail routes (retrieve/update/delete) must not be narrowed by
        # list filters, and a sliced queryset can't be filtered by pk —
        # only apply filtering/limit on the list action.
        if self.action != "list":
            return qs

        params = self.request.query_params
        status_f = params.get("status")
        severity = params.get("severity")
        category = params.get("category")
        search = params.get("search")

        if status_f:
            qs = qs.filter(status=status_f)
        if severity:
            qs = qs.filter(severity=severity)
        if category:
            qs = qs.filter(category__iexact=category)
        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(description__icontains=search)
                | Q(category__icontains=search)
                | Q(affected_ci__icontains=search)
            )

        limit = params.get("limit")
        if limit:
            try:
                qs = qs[: max(0, int(limit))]
            except (TypeError, ValueError):
                pass

        return qs

    def perform_create(self, serializer):
        severity = self.request.data.get("severity", "P3")
        sla_mins = {"P1": 15, "P2": 120, "P3": 480, "P4": 1440}.get(severity, 480)
        sla_due_at = timezone.now() + timedelta(minutes=sla_mins)
        
        # Save ticket
        ticket = serializer.save(
            creator=self.request.user,
            sla_due_at=sla_due_at,
            status="open"
        )
        
        # Trigger Celery background analysis
        analyze_ticket_task.delay(ticket.id)

    @action(detail=True, methods=["post"], url_path="analyze")
    def analyze_ticket(self, request, pk=None):
        ticket = self.get_object()
        # Trigger Celery background analysis immediately
        analyze_ticket_task.delay(ticket.id)
        return Response({"status": "Analysis triggered", "ticket_id": ticket.id})

    @action(detail=True, methods=["post"], url_path="resolve")
    def resolve_ticket(self, request, pk=None):
        ticket = self.get_object()
        data = request.data
        
        ticket.status = "resolved"
        ticket.root_cause = data.get("root_cause", "Not provided")
        ticket.resolution = data.get("resolution", "Not provided")
        ticket.prevention = data.get("prevention", "Not provided")
        ticket.resolved_at = timezone.now()
        ticket.resolved_by = request.user.name
        ticket.save()

        # Ingest to vector database
        content = f"Ticket ID: {ticket.id}\nTitle: {ticket.title}\nCategory: {ticket.category}\nSeverity: {ticket.severity}\nDescription: {ticket.description}\nRoot Cause: {ticket.root_cause}\nResolution: {ticket.resolution}\nPrevention: {ticket.prevention}"
        meta = {
            "ticket_id": str(ticket.id),
            "collection": "incidents",
            "severity": ticket.severity,
            "category": ticket.category.lower(),
            "resolved": True,
            "source_file": f"ticket_{ticket.id}"
        }
        ingested = insert_vector_document(content, meta, "incidents")
        if ingested:
            ticket.ingested = True
            ticket.save()

        return Response(TicketSerializer(ticket).data)

    @action(detail=True, methods=["get"], url_path="comments")
    def get_comments(self, request, pk=None):
        ticket = self.get_object()
        comments = Comment.objects.filter(ticket=ticket)
        serializer = CommentSerializer(comments, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="add-comment")
    def add_comment(self, request, pk=None):
        ticket = self.get_object()
        content = request.data.get("content")
        if not content:
            return Response({"error": "Content required"}, status=status.HTTP_400_BAD_REQUEST)
            
        comment = Comment.objects.create(
            ticket=ticket,
            user=request.user,
            content=content
        )
        return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="pir")
    def generate_pir(self, request, pk=None):
        ticket = self.get_object()
        similar_docs = query_vector_store(f"{ticket.title} {ticket.description}", collection="incidents", limit=3)
        similar_context = "\n\n".join([d["content"] for d in similar_docs])

        # Query LLM for PIR
        prompt = f"""Generate a professional Post-Incident Report (PIR) for AlertMind in markdown format.

Incident Data:
Ticket ID: {ticket.id}
Title: {ticket.title}
Severity: {ticket.severity}
Category: {ticket.category}
Affected CI: {ticket.affected_ci or 'N/A'}
Description: {ticket.description}
Root Cause: {ticket.root_cause or 'Not documented'}
Resolution: {ticket.resolution or 'Not documented'}
Prevention: {ticket.prevention or 'Not documented'}

Similar Incidents Context:
{similar_context}

Format:
## Post-Incident Report — {ticket.id}

**Incident Summary**: [1-2 sentences]
**Severity**: {ticket.severity}
**Duration**: [time to resolve]
**Impact**: [affected systems/services]

### Timeline
- [Chronological sequence of discovery, analysis, and fix]

### Root Cause Analysis
- [Detail of the underlying failure]

### Resolution Steps
- [What was done to restore service]

### Prevention Measures
- [Steps to prevent recurrence]

### Action Items
1. [Action item 1 with owner/due date]
2. [Action item 2]
"""
        try:
            pir_text = generate(prompt, timeout=30) or "Failed to generate report."
            return Response({"pir": pir_text, "ticket_id": str(ticket.id)})
        except Exception as e:
            logger.error(f"Failed to generate PIR via LLM: {e}")
            return Response({"error": "LLM service unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


# ── RAG Operations ────────────────────────────────────────
class RagViewSet(viewsets.ViewSet):
    
    @action(detail=False, methods=["post"], url_path="search")
    def search_vector_db(self, request):
        query = request.data.get("query")
        collection = request.data.get("collection", "all")
        limit = request.data.get("limit", 5)

        if not query:
            return Response({"error": "Query is required"}, status=status.HTTP_400_BAD_REQUEST)

        results = query_vector_store(query, collection=collection, limit=limit)
        return Response({"results": results})

    @action(detail=False, methods=["post"], url_path="chat")
    def chat_ai(self, request):
        message = request.data.get("message")
        session_id = request.data.get("session_id", "default")

        if not message:
            return Response({"error": "Message is required"}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Search vector store for context
        results = query_vector_store(message, collection="all", limit=3)
        context = "\n\n---\n\n".join([d["content"] for d in results])

        # 2. Call the configured LLM provider.
        messages = [
                {
                    "role": "system",
                    "content": f"You are AlertMind AI, an expert ITSM assistant.\nAnswer concisely using technical terms. Cite relevant past incidents or runbooks if present.\nContext:\n{context}"
                },
                {
                    "role": "user",
                    "content": message
                }
        ]

        try:
            content = chat(messages, timeout=90) or "No response from AI"
            sources = [{"id": d["id"], "collection": d["metadata"].get("collection")} for d in results]
            return Response({"response": content, "sources": sources, "session_id": session_id})
        except requests.Timeout:
            logger.error("AI chat timed out while waiting for Ollama")
            return Response(
                {"error": "AI response timed out. The model may still be warming up."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as e:
            logger.error(f"Failed to communicate with AI chat LLM: {e}")
            return Response({"error": "AI LLM service unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    @action(detail=False, methods=["get"], url_path="stats")
    def ingestion_stats(self, request):
        try:
            # Aggregate documents by collection
            with connection.cursor() as cursor:
                cursor.execute("SELECT collection, COUNT(*) FROM alertmind_documents GROUP BY collection")
                rows = cursor.fetchall()
            
            collections = {row[0]: row[1] for row in rows}
            total = sum(collections.values())
            return Response({"total": total, "collections": collections})
        except Exception as e:
            logger.error(f"Failed to get vector stats: {e}")
            return Response({"total": 0, "collections": {}})


# ── Ingestion (File Ingestion) ────────────────────────────
class IngestView(APIView):
    def post(self, request):
        collection = request.data.get("collection", "all")
        content = request.data.get("content")
        filename = request.data.get("filename", "raw_text_upload")

        if not content:
            return Response({"error": "Content is required"}, status=status.HTTP_400_BAD_REQUEST)

        meta = {
            "source_file": filename,
            "collection": collection,
            "ingested_at": timezone.now().isoformat()
        }

        success = insert_vector_document(content, meta, collection)
        if success:
            return Response({"file": filename, "collection": collection, "status": "ingested"})
        else:
            return Response({"error": "Ingestion failed"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ── Dashboard View ────────────────────────────────────────
class DashboardView(APIView):
    def get(self, request):
        try:
            tickets = Ticket.objects.all()
            
            # Active vs Resolved
            total_incidents = tickets.count()
            active_incidents = tickets.filter(status__in=["open", "in-progress"]).count()
            resolved_incidents = tickets.filter(status="resolved").count()
            sla_breached = tickets.filter(sla_breached=True).count()

            # Severity Breakdown
            severity_breakdown = {
                "P1": tickets.filter(severity="P1").count(),
                "P2": tickets.filter(severity="P2").count(),
                "P3": tickets.filter(severity="P3").count(),
                "P4": tickets.filter(severity="P4").count(),
            }

            # Status Breakdown
            status_breakdown = {
                "open": tickets.filter(status="open").count(),
                "in-progress": tickets.filter(status="in-progress").count(),
                "resolved": tickets.filter(status="resolved").count(),
                "closed": tickets.filter(status="closed").count(),
            }

            # Average resolution time
            avg_res_mins = 0.0
            resolved_with_time = tickets.filter(status="resolved", resolved_at__isnull=False)
            if resolved_with_time.exists():
                total_mins = 0
                for ticket in resolved_with_time:
                    delta = ticket.resolved_at - ticket.created_at
                    total_mins += delta.total_seconds() / 60
                avg_res_mins = round(total_mins / resolved_with_time.count(), 1)

            # Daily Stats from Database View `ticket_daily_stats`
            daily_stats = []
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SELECT day, incidents, resolved, ai_resolved, sla_breached, avg_resolution_mins FROM ticket_daily_stats LIMIT 10")
                    rows = cursor.fetchall()
                for r in rows:
                    daily_stats.append({
                        "day": r[0].strftime("%Y-%m-%d") if isinstance(r[0], datetime) or hasattr(r[0], "strftime") else str(r[0]),
                        "incidents": int(r[1]),
                        "resolved": int(r[2]),
                        "ai_resolved": int(r[3]),
                        "sla_breached": int(r[4]),
                        "avg_resolution_mins": float(r[5]) if r[5] is not None else 0.0
                    })
            except Exception as view_err:
                logger.error(f"Failed to query ticket_daily_stats view: {view_err}")
                # Fallback to manual date aggregation
                for i in range(7):
                    day = timezone.now().date() - timedelta(days=i)
                    day_str = day.strftime("%Y-%m-%d")
                    day_tickets = tickets.filter(created_at__date=day)
                    daily_stats.append({
                        "day": day_str,
                        "incidents": day_tickets.count(),
                        "resolved": day_tickets.filter(status="resolved").count(),
                        "ai_resolved": day_tickets.filter(ai_analyzed=True).count(),
                        "sla_breached": day_tickets.filter(sla_breached=True).count(),
                        "avg_resolution_mins": 0.0
                    })

            return Response({
                "total_incidents": total_incidents,
                "active_incidents": active_incidents,
                "resolved_incidents": resolved_incidents,
                "sla_breached": sla_breached,
                "avg_resolution_mins": avg_res_mins,
                "severity_breakdown": severity_breakdown,
                "status_breakdown": status_breakdown,
                "daily_stats": daily_stats
            })

        except Exception as e:
            logger.error(f"Dashboard query failed: {e}")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
