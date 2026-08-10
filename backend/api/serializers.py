from rest_framework import serializers
from api.models import User, Ticket, Comment, Runbook, CmdbItem

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "name", "email", "role", "team", "avatar_url", "created_at"]
        read_only_fields = ["id", "created_at"]


class CommentSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.name", read_only=True)
    user_avatar = serializers.CharField(source="user.avatar_url", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = Comment
        fields = ["id", "content", "ticket_id", "user_id", "user_name", "user_avatar", "user_email", "created_at"]
        read_only_fields = ["id", "created_at"]


class TicketSerializer(serializers.ModelSerializer):
    creator_name = serializers.CharField(source="creator.name", read_only=True)
    creator_email = serializers.CharField(source="creator.email", read_only=True)
    assignee_name = serializers.CharField(source="assignee.name", read_only=True, default=None)
    assignee_email = serializers.CharField(source="assignee.email", read_only=True, default=None)
    comment_count = serializers.SerializerMethodField()
    # The model FKs are `creator`/`assignee` (db_column created_by/assignee_id);
    # expose the raw id values as read-only so they aren't treated as model fields.
    created_by = serializers.UUIDField(source="creator_id", read_only=True)
    assignee_id = serializers.UUIDField(read_only=True, allow_null=True)

    class Meta:
        model = Ticket
        fields = [
            "id",
            "title",
            "description",
            "severity",
            "status",
            "category",
            "affected_ci",
            "source",
            "raw_alert",
            "ai_resolution",
            "ai_steps",
            "ai_confidence",
            "ai_analyzed",
            "ai_analyzed_at",
            "root_cause",
            "resolution",
            "prevention",
            "resolved_by",
            "resolved_at",
            "ingested",
            "sla_due_at",
            "sla_breached",
            "created_by",
            "creator_name",
            "creator_email",
            "assignee_id",
            "assignee_name",
            "assignee_email",
            "comment_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "ai_resolution",
            "ai_steps",
            "ai_confidence",
            "ai_analyzed",
            "ai_analyzed_at",
            "sla_due_at",
            "sla_breached",
            "created_at",
            "updated_at",
        ]

    def get_comment_count(self, obj):
        return obj.comments.count()


class RunbookSerializer(serializers.ModelSerializer):
    class Meta:
        model = Runbook
        fields = ["id", "title", "content", "category", "tags", "use_count", "created_by", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class CmdbItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CmdbItem
        fields = ["id", "name", "type", "environment", "status", "ip_address", "hostname", "os", "team", "metadata", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
