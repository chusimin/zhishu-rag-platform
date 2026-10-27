from __future__ import annotations

import asyncio

from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.ext.asyncio import async_sessionmaker

from .db import build_engine
from .services.ingestion import TransientImportError, process_import_job
from .worker import celery_app


@celery_app.task(
    name="app.process_import_job",
    autoretry_for=(TransientImportError, ConnectionError, OperationalError, InterfaceError),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=3,
)
def process_import_job_task(job_id: str) -> str:
    async def run() -> str:
        # Celery prefork tasks each create their own asyncio loop. Reusing the
        # API process' global async engine across loops can attach asyncpg
        # connections to the wrong loop, so workers use a task-local engine.
        engine = build_engine()
        session_factory = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
        try:
            async with session_factory() as session:
                job = await process_import_job(job_id, session)
                return job.status
        finally:
            await engine.dispose()

    return asyncio.run(run())

