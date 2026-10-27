from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.documents import Document
from langchain_core.messages import HumanMessage
from langchain_text_splitters import RecursiveCharacterTextSplitter

from ..models import ChunkMethod
from ..providers.base import ModelGateway
from .parsers import ParsedDocument


SEPARATORS = ["\n## ", "\n### ", "\n\n", "\n", "。", "；", ";", " "]


def _derive_title(content: str, fallback: str) -> str:
    for line in content.splitlines():
        candidate = re.sub(r"^[#\-*\d.\s]+", "", line).strip()
        if 2 <= len(candidate) <= 80 and not candidate.startswith("|"):
            return candidate
    return fallback


def _splitter(chunk_size: int, chunk_overlap: int) -> RecursiveCharacterTextSplitter:
    return RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        separators=SEPARATORS,
    )


def _base_metadata(parsed: ParsedDocument, unit_index: int, unit: Any) -> dict[str, Any]:
    return {
        **unit.metadata,
        "title": unit.title,
        "page_number": unit.page_number,
        "unit_index": unit_index,
        "used_ocr": parsed.used_ocr,
    }


def _recursive_chunks(parsed: ParsedDocument, chunk_size: int, chunk_overlap: int) -> list[Document]:
    splitter = _splitter(chunk_size, chunk_overlap)
    chunks: list[Document] = []
    for unit_index, unit in enumerate(parsed.units):
        base = _base_metadata(parsed, unit_index, unit)
        for split_index, content in enumerate(splitter.split_text(unit.content)):
            normalized = content.strip()
            if not normalized:
                continue
            chunks.append(
                Document(
                    page_content=normalized,
                    metadata={
                        **base,
                        "chunk_method": ChunkMethod.RECURSIVE,
                        "split_index": split_index,
                        "title": _derive_title(normalized, unit.title or f"分块 {len(chunks) + 1}"),
                    },
                )
            )
    return chunks


def _parent_child_chunks(
    parsed: ParsedDocument,
    *,
    parent_chunk_size: int,
    child_chunk_size: int,
    chunk_overlap: int,
) -> list[Document]:
    parent_splitter = _splitter(parent_chunk_size, min(chunk_overlap, parent_chunk_size - 1))
    child_overlap = min(max(20, chunk_overlap // 2), child_chunk_size - 1)
    child_splitter = _splitter(child_chunk_size, child_overlap)
    chunks: list[Document] = []
    for unit_index, unit in enumerate(parsed.units):
        base = _base_metadata(parsed, unit_index, unit)
        for parent_index, parent in enumerate(parent_splitter.split_text(unit.content)):
            parent = parent.strip()
            if not parent:
                continue
            parent_id = f"u{unit_index}-p{parent_index}"
            parent_title = _derive_title(parent, unit.title or f"父块 {parent_index + 1}")
            for child_index, child in enumerate(child_splitter.split_text(parent)):
                child = child.strip()
                if not child:
                    continue
                chunks.append(
                    Document(
                        page_content=child,
                        metadata={
                            **base,
                            "chunk_method": ChunkMethod.PARENT_CHILD,
                            "parent_id": parent_id,
                            "parent_index": parent_index,
                            "child_index": child_index,
                            "parent_content": parent,
                            "parent_title": parent_title,
                            "title": _derive_title(child, parent_title),
                        },
                    )
                )
    return chunks


def _message_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            str(item.get("text", "")) if isinstance(item, dict) else str(item)
            for item in content
        )
    return str(content or "")


def _parse_semantic_chunks(raw: str, source: str) -> list[str]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    try:
        body = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError("语义切分模型未返回有效 JSON") from exc
    values = body.get("chunks") if isinstance(body, dict) else body
    if not isinstance(values, list) or not values:
        raise ValueError("语义切分模型未返回任何分块")
    chunks = [str(value).strip() for value in values if str(value).strip()]
    cursor = 0
    for chunk in chunks:
        position = source.find(chunk, cursor)
        if position < 0:
            raise ValueError("语义切分结果改写了原文，已拒绝写入索引")
        cursor = position + len(chunk)
    normalized_source = re.sub(r"\s+", "", source)
    normalized_chunks = re.sub(r"\s+", "", "".join(chunks))
    if normalized_chunks != normalized_source:
        raise ValueError("语义切分结果遗漏了原文内容，已拒绝写入索引")
    return chunks


async def _semantic_chunks(
    parsed: ParsedDocument,
    *,
    gateway: ModelGateway,
    safe_input_size: int,
) -> list[Document]:
    pre_splitter = _splitter(safe_input_size, 0)
    chunks: list[Document] = []
    for unit_index, unit in enumerate(parsed.units):
        base = _base_metadata(parsed, unit_index, unit)
        for window_index, source in enumerate(pre_splitter.split_text(unit.content)):
            source = source.strip()
            if not source:
                continue
            prompt = (
                "你是企业文档语义切分器。按主题完整性把原文切成若干段。"
                "必须逐字保留原文，不得总结、改写、增删或调整顺序。"
                "仅返回 JSON：{\"chunks\":[\"原文段1\",\"原文段2\"]}。\n\n原文：\n"
                f"{source}"
            )
            try:
                response = await gateway.chat_model(temperature=0, max_tokens=4096).ainvoke(
                    [HumanMessage(content=prompt)]
                )
            except Exception as exc:
                raise ValueError(f"语义切分模型调用失败：{type(exc).__name__}") from exc
            for semantic_index, content in enumerate(
                _parse_semantic_chunks(_message_text(response.content), source)
            ):
                chunks.append(
                    Document(
                        page_content=content,
                        metadata={
                            **base,
                            "chunk_method": ChunkMethod.SEMANTIC,
                            "semantic_window_index": window_index,
                            "semantic_index": semantic_index,
                            "title": _derive_title(content, unit.title or f"语义分块 {len(chunks) + 1}"),
                        },
                    )
                )
    return chunks


async def split_document(
    parsed: ParsedDocument,
    *,
    chunk_method: str = ChunkMethod.RECURSIVE,
    chunk_size: int,
    chunk_overlap: int,
    parent_chunk_size: int = 1600,
    child_chunk_size: int = 400,
    semantic_gateway: ModelGateway | None = None,
) -> list[Document]:
    if chunk_method == ChunkMethod.PARENT_CHILD:
        return _parent_child_chunks(
            parsed,
            parent_chunk_size=parent_chunk_size,
            child_chunk_size=child_chunk_size,
            chunk_overlap=chunk_overlap,
        )
    if chunk_method == ChunkMethod.SEMANTIC:
        if semantic_gateway is None:
            raise ValueError("语义切分需要配置可用的 LLM 模型")
        return await _semantic_chunks(
            parsed,
            gateway=semantic_gateway,
            safe_input_size=max(2000, min(parent_chunk_size, 8000)),
        )
    return _recursive_chunks(parsed, chunk_size, chunk_overlap)
