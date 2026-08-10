from django.urls import path, include
from rest_framework.routers import DefaultRouter
from api.views import (
    health_check,
    get_user_profile,
    WebhookViewSet,
    CmdbItemViewSet,
    RunbookViewSet,
    TicketViewSet,
    RagViewSet,
    IngestView,
    DashboardView,
)

router = DefaultRouter()
router.register(r"cmdb", CmdbItemViewSet, basename="cmdb")
router.register(r"runbooks", RunbookViewSet, basename="runbooks")
router.register(r"tickets", TicketViewSet, basename="tickets")
router.register(r"webhook", WebhookViewSet, basename="webhook")
router.register(r"rag", RagViewSet, basename="rag")

urlpatterns = [
    path("health/", health_check, name="health_check"),
    path("auth/me/", get_user_profile, name="user_profile"),
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("ingest/", IngestView.as_view(), name="ingest"),
    path("", include(router.urls)),
]
