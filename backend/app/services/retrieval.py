from __future__ import annotations

import math
from dataclasses import dataclass
from time import monotonic
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import cast, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import DocumentChunk, KnowledgeBase, ModelConfig
from ..providers import build_gateway


@dataclass(slots=True)
class RetrievedChunk:
    chunk_id: str
    knowledge_base_id: str
    file_id: str
    filename: str
    title: str
    content: str
    page_number: int | None
    vector_score: float
    rerank_score: float | None
    final_score: float
    metadata: dict[str, Any]


@dataclass(slots=True)
class RetrievalRun:
    results: list[RetrievedChunk]
    recalled_count: int
    embedding_duration_ms: int
    vector_duration_ms: int
    rerank_duration_ms: int | None
    total_duration_ms: int
    rerank_applied: bool
    simulated: bool


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return -1.0
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return -1.0
    return dot / (left_norm * right_norm)


def _to_result(chunk: DocumentChunk, vector_score: float) -> RetrievedChunk:
    parent_content = chunk.metadata_json.get("parent_content")
    content = parent_content if isinstance(parent_content, str) and parent_content.strip() else chunk.content
    parent_title = chunk.metadata_json.get("parent_title")
    return RetrievedChunk(
        chunk_id=chunk.id,
        knowledge_base_id=chunk.knowledge_base_id,
        file_id=chunk.file_id,
        filename=chunk.file.filename,
        title=str(parent_title) if parent_title else chunk.title,
        content=content,
        page_number=chunk.page_number,
        vector_score=vector_score,
        rerank_score=None,
        final_score=vector_score,
        metadata=chunk.metadata_json,
    )


async def _vector_search(
    session: AsyncSession,
    knowledge_base_id: str,
    query_vector: list[float],
    top_k: int,
) -> list[RetrievedChunk]:
    if session.bind and session.bind.dialect.name == "postgresql":
        distance = cast(DocumentChunk.embedding, Vector()).cosine_distance(query_vector)
        query = (
            select(DocumentChunk, (1.0 - distance).label("vector_score"))
            .where(
                DocumentChunk.knowledge_base_id == knowledge_base_id,
                DocumentChunk.embedding.is_not(None),
            )
            .options(selectinload(DocumentChunk.file))
            .order_by(distance)
            .limit(top_k)
        )
        rows = (await session.execute(query)).all()
        return [_to_result(chunk, float(score)) for chunk, score in rows]

    query = (
        select(DocumentChunk)
        .where(
            DocumentChunk.knowledge_base_id == knowledge_base_id,
            DocumentChunk.embedding.is_not(None),
        )
        .options(selectinload(DocumentChunk.file))
    )
    chunks = list(await session.scalars(query))
    scored = [
        _to_result(chunk, _cosine_similarity(query_vector, chunk.embedding or []))
        for chunk in chunks
    ]
    return sorted(scored, key=lambda item: item.vector_score, reverse=True)[:top_k]


async def retrieve_knowledge_base(
    session: AsyncSession,
    knowledge_base: KnowledgeBase,
    query: str,
    *,
    top_k: int,
    rerank_top_n: int,
    score_threshold: float,
) -> RetrievalRun:
    started = monotonic()
    if not knowledge_base.embedding_model_id:
        raise ValueError("Knowledge base has no embedding model configured")
    embedding_model = await session.get(ModelConfig, knowledge_base.embedding_model_id)
    if embedding_model is None or not embedding_model.is_enabled:
        raise ValueError("Configured embedding model is missing or disabled")

    embedding_gateway = build_gateway(embedding_model)
    embedding_started = monotonic()
    query_vector = await embedding_gateway.embed_query(query)
    if knowledge_base.embedding_dimension is not None and len(query_vector) != knowledge_base.embedding_dimension:
        raise ValueError("Embedding model dimension does not match the knowledge base index; rebuild with a compatible model")
    embedding_duration_ms = int((monotonic() - embedding_started) * 1000)

    vector_started = monotonic()
    candidates = await _vector_search(session, knowledge_base.id, query_vector, top_k)
    # Parent-child retrieval embeds small child chunks but returns the parent
    # context. Multiple matching children of one parent should not crowd out
    # results from other parents.
    deduplicated: dict[str, RetrievedChunk] = {}
    for candidate in candidates:
        parent_id = candidate.metadata.get("parent_id")
        key = f"{candidate.file_id}:{parent_id}" if parent_id else candidate.chunk_id
        current = deduplicated.get(key)
        if current is None or candidate.vector_score > current.vector_score:
            deduplicated[key] = candidate
    candidates = list(deduplicated.values())
    candidates.sort(key=lambda item: item.vector_score, reverse=True)
    vector_duration_ms = int((monotonic() - vector_started) * 1000)
    recalled_count = len(candidates)
    rerank_duration_ms: int | None = None
    rerank_applied = False
    simulated = embedding_gateway.is_simulated

    if candidates and knowledge_base.rerank_model_id:
        rerank_model = await session.get(ModelConfig, knowledge_base.rerank_model_id)
        if rerank_model is None or not rerank_model.is_enabled:
            raise ValueError("Configured rerank model is missing or disabled")
        rerank_gateway = build_gateway(rerank_model)
        rerank_started = monotonic()
        ranked = await rerank_gateway.rerank(
            query,
            [candidate.content for candidate in candidates],
            min(rerank_top_n, len(candidates)),
        )
        rerank_duration_ms = int((monotonic() - rerank_started) * 1000)
        reranked: list[RetrievedChunk] = []
        for item in ranked:
            if item.index < 0 or item.index >= len(candidates):
                continue
            candidate = candidates[item.index]
            candidate.rerank_score = item.score
            candidate.final_score = item.score
            reranked.append(candidate)
        candidates = reranked
        rerank_applied = True
        simulated = simulated or rerank_gateway.is_simulated

    results = [candidate for candidate in candidates if candidate.final_score >= score_threshold]
    return RetrievalRun(
        results=results,
        recalled_count=recalled_count,
        embedding_duration_ms=embedding_duration_ms,
        vector_duration_ms=vector_duration_ms,
        rerank_duration_ms=rerank_duration_ms,
        total_duration_ms=int((monotonic() - started) * 1000),
        rerank_applied=rerank_applied,
        simulated=simulated,
    )
