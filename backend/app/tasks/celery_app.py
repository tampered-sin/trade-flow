from celery import Celery
from ..config import settings

broker = settings.celery_broker_url or settings.redis_url
backend = settings.celery_result_backend or settings.redis_url
celery = Celery("app", broker=broker, backend=backend)

celery.conf.beat_schedule = {
    "refresh-tokens": {
        "task": "app.tasks.refresh_tokens.refresh_tokens_task",
        "schedule": 300.0,
    },
}