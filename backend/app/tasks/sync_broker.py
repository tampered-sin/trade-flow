from .celery_app import celery

@celery.task
def sync_broker_task(connection_id: str):
    return {"connection_id": connection_id, "status": "ok"}