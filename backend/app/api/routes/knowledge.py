from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import get_settings
from ...db import get_session
from ...models import DocumentChunk, ImportJob, JobStatus, KnowledgeBase, KnowledgeFile, ModelConfig, ModelType
from ...schemas import (
    ChunkResponse,
    ChunkUpdate,
    DocumentMetadataUpdate,
    FileUploadResponse,
    ImportJobResponse,
    KnowledgeBaseCreate,
    KnowledgeBaseResponse,
    KnowledgeBaseUpdate,
    KnowledgeFileResponse,
)
from ...security import require_roles
from ...services.ingestion import process_import_job
from ...services.metadata_extraction import normalize_document_metadata
from ...services.parsers import SUPPORTED_EXTENSIONS
from ...services.storage import ObjectStorage, get_storage
from ...tasks import process_import_job_task
from ...tenancy import current_workspace_id

router = APIRouter(dependencies=[Depends(require_roles("admin", "manager"))])


async def dispatch_import_job(
    session: AsyncSession,
    job: ImportJob,
    file: KnowledgeFile,
    *,
    storage: ObjectStorage | None = None,
) -> ImportJob:
    settings = get_settings()
    if settings.task_mode != "celery":
        return await process_import_job(job.id, session, storage=storage, retry_transient=False)
    try:
        process_import_job_task.delay(job.id)
    except Exception as exc:
        message = f"Celery dispatch failed ({type(exc).__name__}); the file can be retried"
        file.status = JobStatus.FAILED
        file.error_message = message
        job.status = JobStatus.FAILED
        job.current_stage = "dispatch_failed"
        job.stage_details = [
            *(job.stage_details or []),
            {"name": "dispatch_failed", "status": "error", "detail": message},
        ]
        job.error_message = message
        job.finished_at = datetime.now(UTC)
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Task queue is unavailable; the file was marked failed and can be retried",
            headers={"Retry-After": "5"},
        ) from exc
    return job


async def get_kb_or_404(session: AsyncSession, knowledge_base_id: str) -> KnowledgeBase:
    knowledge_base = await session.get(KnowledgeBase, knowledge_base_id)
    if knowledge_base is None or knowledge_base.workspace_id != current_workspace_id():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge base not found")
    return knowledge_base


async def validate_model(
    session: AsyncSession,
    model_id: str | None,
    expected_type: ModelType,
) -> None:
    if model_id is None:
        return
    model = await session.get(ModelConfig, model_id)
    if model is None or model.workspace_id != current_workspace_id() or model.model_type != expected_type:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{expected_type} model configuration not found",
        )


async def serialize_kb(session: AsyncSession, knowledge_base: KnowledgeBase) -> KnowledgeBaseResponse:
    file_count = await session.scalar(
        select(func.count()).select_from(KnowledgeFile).where(KnowledgeFile.knowledge_base_id == knowledge_base.id)
    )
    chunk_count = await session.scalar(
        select(func.count()).select_from(DocumentChunk).where(
            DocumentChunk.knowledge_base_id == knowledge_base.id,
            DocumentChunk.embedding.is_not(None),
        )
    )
    return KnowledgeBaseResponse.model_validate(knowledge_base).model_copy(
        update={"file_count": file_count or 0, "chunk_count": chunk_count or 0}
    )


def serialize_chunk(chunk: DocumentChunk) -> ChunkResponse:
    # `indexed` is computed state and is not persisted on the ORM entity.
    # Supplying a value during validation avoids a missing-field error.
    return ChunkResponse.model_validate(
        {
            "id": chunk.id,
            "knowledge_base_id": chunk.knowledge_base_id,
            "file_id": chunk.file_id,
            "ordinal": chunk.ordinal,
            "title": chunk.title,
            "content": chunk.content,
            "page_number": chunk.page_number,
            "char_count": chunk.char_count,
            "metadata_json": chunk.metadata_json,
            "indexed": chunk.embedding is not None,
            "created_at": chunk.created_at,
            "updated_at": chunk.updated_at,
        }
    )


@router.get("", response_model=list[KnowledgeBaseResponse])
async def list_knowledge_bases(session: AsyncSession = Depends(get_session)) -> list[KnowledgeBaseResponse]:
    result = await session.scalars(select(KnowledgeBase).where(KnowledgeBase.workspace_id == current_workspace_id()).order_by(KnowledgeBase.updated_at.desc()))
    return [await serialize_kb(session, item) for item in result]


@router.post("", response_model=KnowledgeBaseResponse, status_code=status.HTTP_201_CREATED)
async def create_knowledge_base(
    payload: KnowledgeBaseCreate,
    session: AsyncSession = Depends(get_session),
) -> KnowledgeBaseResponse:
    await validate_model(session, payload.embedding_model_id, ModelType.EMBEDDING)
    await validate_model(session, payload.rerank_model_id, ModelType.RERANK)
    await validate_model(session, payload.ocr_model_id, ModelType.OCR)
    await validate_model(session, payload.semantic_llm_model_id, ModelType.LLM)
    await validate_model(session, payload.metadata_llm_model_id, ModelType.LLM)
    knowledge_base = KnowledgeBase(**payload.model_dump())
    session.add(knowledge_base)
    await session.commit()
    await session.refresh(knowledge_base)
    return await serialize_kb(session, knowledge_base)


@router.get("/{knowledge_base_id}", response_model=KnowledgeBaseResponse)
async def get_knowledge_base(
    knowledge_base_id: str,
    session: AsyncSession = Depends(get_session),
) -> KnowledgeBaseResponse:
    return await serialize_kb(session, await get_kb_or_404(session, knowledge_base_id))


@router.patch("/{knowledge_base_id}", response_model=KnowledgeBaseResponse)
async def update_knowledge_base(
    knowledge_base_id: str,
    payload: KnowledgeBaseUpdate,
    session: AsyncSession = Depends(get_session),
) -> KnowledgeBaseResponse:
    knowledge_base = await get_kb_or_404(session, knowledge_base_id)
    values = payload.model_dump(exclude_unset=True)
    non_nullable = {
        "name",
        "description",
        "chunk_size",
        "chunk_overlap",
        "chunk_method",
        "parent_chunk_size",
        "child_chunk_size",
    }
    null_fields = sorted(key for key in non_nullable if key in values and values[key] is None)
    if null_fields:
        raise HTTPException(status_code=422, detail=f"Fields cannot be null: {', '.join(null_fields)}")
    await validate_model(session, values.get("embedding_model_id"), ModelType.EMBEDDING)
    await validate_model(session, values.get("rerank_model_id"), ModelType.RERANK)
    await validate_model(session, values.get("ocr_model_id"), ModelType.OCR)
    await validate_model(session, values.get("semantic_llm_model_id"), ModelType.LLM)
    await validate_model(session, values.get("metadata_llm_model_id"), ModelType.LLM)
    next_chunk_size = values.get("chunk_size", knowledge_base.chunk_size)
    next_overlap = values.get("chunk_overlap", knowledge_base.chunk_overlap)
    if next_overlap >= next_chunk_size:
        raise HTTPException(status_code=422, detail="chunk_overlap must be smaller than chunk_size")
    next_parent_size = values.get("parent_chunk_size", knowledge_base.parent_chunk_size)
    next_child_size = values.get("child_chunk_size", knowledge_base.child_chunk_size)
    if next_child_size >= next_parent_size:
        raise HTTPException(status_code=422, detail="child_chunk_size must be smaller than parent_chunk_size")
    next_method = values.get("chunk_method", knowledge_base.chunk_method)
    next_semantic_model = values.get("semantic_llm_model_id", knowledge_base.semantic_llm_model_id)
    if next_method == "semantic" and not next_semantic_model:
        raise HTTPException(status_code=422, detail="semantic_llm_model_id is required for semantic chunking")
    index_config_changed = (
        "embedding_model_id" in values
        and values["embedding_model_id"] != knowledge_base.embedding_model_id
    ) or any(
        key in values and values[key] != getattr(knowledge_base, key)
        for key in (
            "chunk_method",
            "chunk_size",
            "chunk_overlap",
            "parent_chunk_size",
            "child_chunk_size",
            "semantic_llm_model_id",
            "metadata_llm_model_id",
        )
    )
    for key, value in values.items():
        setattr(knowledge_base, key, value)
    if index_config_changed:
        knowledge_base.embedding_dimension = None
        await session.execute(
            update(DocumentChunk)
            .where(DocumentChunk.knowledge_base_id == knowledge_base.id)
            .values(embedding=None)
        )
    await session.commit()
    await session.refresh(knowledge_base)
    return await serialize_kb(session, knowledge_base)


@router.delete("/{knowledge_base_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_knowledge_base(
    knowledge_base_id: str,
    session: AsyncSession = Depends(get_session),
) -> Response:
    knowledge_base = await get_kb_or_404(session, knowledge_base_id)
    files = list(
        await session.scalars(select(KnowledgeFile).where(KnowledgeFile.knowledge_base_id == knowledge_base_id))
    )
    storage = get_storage()
    try:
        for file in files:
            await storage.delete(file.storage_key)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage cleanup failed; knowledge base was not deleted",
            headers={"Retry-After": "5"},
        ) from exc
    await session.delete(knowledge_base)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{knowledge_base_id}/files", response_model=list[KnowledgeFileResponse])
async def list_files(
    knowledge_base_id: str,
    session: AsyncSession = Depends(get_session),
) -> list[KnowledgeFile]:
    await get_kb_or_404(session, knowledge_base_id)
    result = await session.scalars(
        select(KnowledgeFile)
        .where(KnowledgeFile.knowledge_base_id == knowledge_base_id)
        .order_by(KnowledgeFile.created_at.desc())
    )
    return list(result)


@router.patch("/{knowledge_base_id}/files/{file_id}/metadata", response_model=KnowledgeFileResponse)
async def update_file_metadata(
    knowledge_base_id: str,
    file_id: str,
    payload: DocumentMetadataUpdate,
    session: AsyncSession = Depends(get_session),
) -> KnowledgeFile:
    file = await session.get(KnowledgeFile, file_id)
    if file is None or file.knowledge_base_id != knowledge_base_id:
        raise HTTPException(status_code=404, detail="File not found")
    existing = dict(file.document_metadata or {})
    editable = payload.model_dump(exclude_unset=True)
    merged = {**existing, **editable}
    file.document_metadata = normalize_document_metadata(
        merged,
        extraction_method="manual",
        model_id=existing.get("model_id"),
    )
    chunks = list(
        await session.scalars(select(DocumentChunk).where(DocumentChunk.file_id == file.id))
    )
    for chunk in chunks:
        chunk.metadata_json = {
            **(chunk.metadata_json or {}),
            "document_metadata": file.document_metadata,
        }
        chunk.embedding = None
    await session.commit()
    await session.refresh(file)
    return file


@router.post("/{knowledge_base_id}/files", response_model=FileUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_file(
    knowledge_base_id: str,
    upload: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> FileUploadResponse:
    await get_kb_or_404(session, knowledge_base_id)
    settings = get_settings()
    safe_name = Path(upload.filename or "upload").name
    extension = Path(safe_name).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported file extension: {extension or 'none'}")
    data = await upload.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="File exceeds configured upload size limit")
    if not data:
        raise HTTPException(status_code=422, detail="Uploaded file is empty")
    checksum = hashlib.sha256(data).hexdigest()
    duplicate = await session.scalar(
        select(KnowledgeFile).where(
            KnowledgeFile.knowledge_base_id == knowledge_base_id,
            KnowledgeFile.checksum_sha256 == checksum,
        )
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="The same file content already exists in this knowledge base")

    file_id = str(uuid4())
    storage_key = f"knowledge-bases/{knowledge_base_id}/{file_id}/{safe_name}"
    storage = get_storage(settings)
    await storage.put_bytes(storage_key, data, upload.content_type or "application/octet-stream")
    file = KnowledgeFile(
        id=file_id,
        knowledge_base_id=knowledge_base_id,
        filename=safe_name,
        content_type=upload.content_type or "application/octet-stream",
        extension=extension,
        size_bytes=len(data),
        storage_key=storage_key,
        checksum_sha256=checksum,
        status=JobStatus.QUEUED,
    )
    job = ImportJob(file=file, status=JobStatus.QUEUED, progress=0, current_stage="queued")
    session.add_all([file, job])
    await session.commit()
    await session.refresh(file)
    await session.refresh(job)

    job = await dispatch_import_job(session, job, file, storage=storage)
    await session.refresh(file)
    return FileUploadResponse(file=KnowledgeFileResponse.model_validate(file), job=ImportJobResponse.model_validate(job))


@router.get("/import-jobs/{job_id}", response_model=ImportJobResponse)
async def get_import_job(job_id: str, session: AsyncSession = Depends(get_session)) -> ImportJob:
    job = await session.scalar(
        select(ImportJob)
        .join(KnowledgeFile, ImportJob.file_id == KnowledgeFile.id)
        .join(KnowledgeBase, KnowledgeFile.knowledge_base_id == KnowledgeBase.id)
        .where(ImportJob.id == job_id, KnowledgeBase.workspace_id == current_workspace_id())
    )
    if job is None:
        raise HTTPException(status_code=404, detail="Import job not found")
    return job


@router.get("/{knowledge_base_id}/import-jobs", response_model=list[ImportJobResponse])
async def list_import_jobs(
    knowledge_base_id: str,
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
) -> list[ImportJob]:
    await get_kb_or_404(session, knowledge_base_id)
    safe_limit = max(1, min(limit, 200))
    query = (
        select(ImportJob)
        .join(KnowledgeFile, ImportJob.file_id == KnowledgeFile.id)
        .where(KnowledgeFile.knowledge_base_id == knowledge_base_id)
        .order_by(ImportJob.created_at.desc())
        .limit(safe_limit)
    )
    return list(await session.scalars(query))


@router.get("/{knowledge_base_id}/chunks", response_model=list[ChunkResponse])
async def list_chunks(
    knowledge_base_id: str,
    file_id: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> list[ChunkResponse]:
    await get_kb_or_404(session, knowledge_base_id)
    query = select(DocumentChunk).where(DocumentChunk.knowledge_base_id == knowledge_base_id)
    if file_id:
        query = query.where(DocumentChunk.file_id == file_id)
    result = await session.scalars(query.order_by(DocumentChunk.file_id, DocumentChunk.ordinal))
    return [serialize_chunk(chunk) for chunk in result]


@router.patch("/{knowledge_base_id}/chunks/{chunk_id}", response_model=ChunkResponse)
async def update_chunk(
    knowledge_base_id: str,
    chunk_id: str,
    payload: ChunkUpdate,
    session: AsyncSession = Depends(get_session),
) -> ChunkResponse:
    chunk = await session.get(DocumentChunk, chunk_id)
    if chunk is None or chunk.knowledge_base_id != knowledge_base_id:
        raise HTTPException(status_code=404, detail="Chunk not found")
    values = payload.model_dump(exclude_unset=True)
    null_fields = sorted(key for key in ("title", "content") if key in values and values[key] is None)
    if null_fields:
        raise HTTPException(status_code=422, detail=f"Fields cannot be null: {', '.join(null_fields)}")
    for key, value in values.items():
        setattr(chunk, key, value)
    if "content" in values:
        chunk.char_count = len(chunk.content)
        chunk.embedding = None
    await session.commit()
    await session.refresh(chunk)
    return serialize_chunk(chunk)


@router.delete("/{knowledge_base_id}/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    knowledge_base_id: str,
    file_id: str,
    session: AsyncSession = Depends(get_session),
) -> Response:
    file = await session.get(KnowledgeFile, file_id)
    if file is None or file.knowledge_base_id != knowledge_base_id:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        await get_storage().delete(file.storage_key)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Object storage cleanup failed; file was not deleted",
            headers={"Retry-After": "5"},
        ) from exc
    await session.delete(file)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{knowledge_base_id}/files/{file_id}/retry", response_model=ImportJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def retry_file(
    knowledge_base_id: str,
    file_id: str,
    session: AsyncSession = Depends(get_session),
) -> ImportJobResponse:
    file = await session.get(KnowledgeFile, file_id)
    if file is None or file.knowledge_base_id != knowledge_base_id:
        raise HTTPException(status_code=404, detail="File not found")
    active_job = await session.scalar(
        select(ImportJob).where(
            ImportJob.file_id == file.id,
            ImportJob.status.not_in((JobStatus.COMPLETED, JobStatus.FAILED)),
        )
    )
    if active_job is not None:
        raise HTTPException(status_code=409, detail="File already has an active import job")
    job = ImportJob(file_id=file.id, status=JobStatus.QUEUED, progress=0, current_stage="queued")
    session.add(job)
    await session.commit()
    await session.refresh(job)
    job = await dispatch_import_job(session, job, file)
    return ImportJobResponse.model_validate(job)


@router.post("/{knowledge_base_id}/rebuild", response_model=list[ImportJobResponse], status_code=status.HTTP_202_ACCEPTED)
async def rebuild_knowledge_base(
    knowledge_base_id: str,
    session: AsyncSession = Depends(get_session),
) -> list[ImportJobResponse]:
    await get_kb_or_404(session, knowledge_base_id)
    files = list(
        await session.scalars(select(KnowledgeFile).where(KnowledgeFile.knowledge_base_id == knowledge_base_id))
    )
    jobs: list[ImportJob] = []
    for file in files:
        job = ImportJob(file_id=file.id, status=JobStatus.QUEUED, progress=0, current_stage="queued")
        session.add(job)
        jobs.append(job)
    await session.commit()
    files_by_id = {file.id: file for file in files}
    dispatch_failed = False
    for job in jobs:
        await session.refresh(job)
        try:
            await dispatch_import_job(session, job, files_by_id[job.file_id])
        except HTTPException as exc:
            if exc.status_code != status.HTTP_503_SERVICE_UNAVAILABLE:
                raise
            dispatch_failed = True
    if dispatch_failed:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="One or more jobs could not be queued; failed files can be retried individually",
            headers={"Retry-After": "5"},
        )
    return [ImportJobResponse.model_validate(job) for job in jobs]

