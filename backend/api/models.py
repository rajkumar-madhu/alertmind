import uuid
from django.db import models
from django.contrib.postgres.fields import ArrayField

class User(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    # Keycloak `sub`. Unique when set; seed rows start null and are linked on first login.
    token_identifier = models.CharField(max_length=255, unique=True, null=True, blank=True)
    password_hash = models.CharField(max_length=255)
    role = models.CharField(max_length=50, default="engineer")  # admin|engineer|viewer
    team = models.CharField(max_length=255, null=True, blank=True)
    avatar_url = models.CharField(max_length=1024, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "users"

    @property
    def is_authenticated(self):
        return True

    @property
    def is_anonymous(self):
        return False

    @property
    def is_active(self):
        return True

    def __str__(self):
        return f"{self.name} ({self.email})"


class Ticket(models.Model):
    SEVERITY_CHOICES = [
        ("P1", "P1"),
        ("P2", "P2"),
        ("P3", "P3"),
        ("P4", "P4"),
    ]
    STATUS_CHOICES = [
        ("open", "open"),
        ("in-progress", "in-progress"),
        ("resolved", "resolved"),
        ("closed", "closed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField()
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="open")
    category = models.CharField(max_length=100)
    affected_ci = models.CharField(max_length=255, null=True, blank=True)
    source = models.CharField(max_length=50, default="manual")  # manual|prometheus|n8n|api|webhook
    raw_alert = models.JSONField(null=True, blank=True)

    # AI Analysis
    ai_resolution = models.TextField(null=True, blank=True)
    ai_steps = models.JSONField(null=True, blank=True)
    ai_confidence = models.IntegerField(null=True, blank=True)
    ai_analyzed = models.BooleanField(default=False)
    ai_analyzed_at = models.DateTimeField(null=True, blank=True)

    # Resolution
    root_cause = models.TextField(null=True, blank=True)
    resolution = models.TextField(null=True, blank=True)
    prevention = models.TextField(null=True, blank=True)
    resolved_by = models.CharField(max_length=255, null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    ingested = models.BooleanField(default=False)

    # SLA
    sla_due_at = models.DateTimeField(null=True, blank=True)
    sla_breached = models.BooleanField(default=False)

    # Relations
    creator = models.ForeignKey(User, on_delete=models.PROTECT, related_name="tickets_created", db_column="created_by")
    assignee = models.ForeignKey(User, on_delete=models.SET_NULL, related_name="tickets_assigned", db_column="assignee_id", null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tickets"
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.severity}] {self.title} ({self.status})"


class Comment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    content = models.TextField()
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="comments", db_column="ticket_id")
    user = models.ForeignKey(User, on_delete=models.PROTECT, related_name="comments", db_column="user_id")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "comments"
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment by {self.user.name} on {self.ticket.id}"


class Runbook(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    content = models.TextField()
    category = models.CharField(max_length=100)
    tags = ArrayField(models.CharField(max_length=100), default=list, blank=True)
    use_count = models.IntegerField(default=0)
    created_by = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "runbooks"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class CmdbItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=100)  # server|database|network|service|application
    environment = models.CharField(max_length=50, default="production")
    status = models.CharField(max_length=50, default="active")
    ip_address = models.CharField(max_length=100, null=True, blank=True)
    hostname = models.CharField(max_length=255, null=True, blank=True)
    os = models.CharField(max_length=100, null=True, blank=True)
    team = models.CharField(max_length=255, null=True, blank=True)
    metadata = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cmdb_items"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.type})"


class AlertmindDocument(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    content = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    # Note: embedding field is vector(768) and managed via raw SQL / psycopg2
    collection = models.CharField(max_length=100, default="incidents")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "alertmind_documents"
