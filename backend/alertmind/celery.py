import os
from celery import Celery

# Set default Django settings module
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "alertmind.settings")

app = Celery("alertmind")

# Load config from django settings with namespace 'CELERY'
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks in all registered django apps
app.autodiscover_tasks()
