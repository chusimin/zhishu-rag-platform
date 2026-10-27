from __future__ import annotations

import json
from time import monotonic
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import KnowledgeBase, ModelConfig, ModelType
from ..providers import build_gateway
from ..services.retrieval import RetrievedChunk, retrieve_knowledge_base
from .manifest import Manifest
from .validation import validate_inputs

MAX_CONTEXT_CHARS = 12000
MAX_HISTORY_MESSAGE_CHARS = 4000


def _content_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            str(item.get("text", ""))
            for item in content
            if isinstance(item, dict) and item.get("type") == "text"
        )
    return str(content) if content is not None else ""


def _citation(item: RetrievedChunk) -> dict[str, Any]:
    return {
        "chunk_id": item.chunk_id,
        "knowledge_base_id": item.knowledge_base_id,
        "file_id": item.file_id,
        "filename": item.filename,
        "title": item.title,
        "page_number": item.page_number,
        "content": item.content,
        "vector_score": round(item.vector_score, 6),
        "rerank_score": round(item.rerank_score, 6) if item.rerank_score is not None else None,
        "score": round(item.final_score, 6),
        "metadata": item.metadata,
    }


def _history(messages: list[Any], max_turns: int) -> list[BaseMessage]:
    result: list[BaseMessage] = []
    for item in messages[-(max_turns * 2) :]:
        role = item.get("role") if isinstance(item, dict) else getattr(item, "role", None)
        content = item.get("content") if isinstance(item, dict) else getattr(item, "content", "")
        text = str(content or "")[:MAX_HISTORY_MESSAGE_CHARS]
        if role == "user":
            result.append(HumanMessage(content=text))
        elif role == "assistant":
            result.append(AIMessage(content=text))
    return result


def _retrieval_config(manifest: Manifest) -> dict[str, Any]:
    config: dict[str, Any] = {}
    for tool in manifest.tools:
        if tool.name == "knowledge_retrieval" and tool.enabled:
            config.update(tool.config)
    top_k = max(1, min(int(config.get("top_k", 8)), 50))
    rerank_top_n = max(1, min(int(config.get("rerank_top_n", 3)), top_k, 20))
    return {
        "top_k": top_k,
        "rerank_top_n": rerank_top_n,
        "score_threshold": max(-1.0, min(float(config.get("score_threshold", 0.35)), 1.0)),
        "max_context_chars": max(100, min(int(config.get("max_context_chars", MAX_CONTEXT_CHARS)), 50000)),
    }


def _context(retrieved: list[RetrievedChunk], limit: int) -> tuple[str, list[RetrievedChunk]]:
    parts: list[str] = []
    used: list[RetrievedChunk] = []
    remaining = limit
    for index, item in enumerate(retrieved, start=1):
        heading = f"[资料 {index}] {item.filename}"
        if item.page_number:
            heading += f" 第 {item.page_number} 页"
        available = remaining - len(heading) - 2
        if available <= 0:
            break
        content = item.content[:available]
        if not content:
            break
        parts.append(f"{heading}\n{content}")
        used.append(item)
        remaining -= len(heading) + len(content) + 2
    return "\n\n".join(parts), used


def _mock_output(manifest: Manifest, message: str, values: dict[str, Any], context: str) -> str:
    if manifest.output.format == "json":
        schema = manifest.output.json_schema or {}
        properties = schema.get("properties", {}) if isinstance(schema, dict) else {}
        if isinstance(properties, dict) and properties:
            output: dict[str, Any] = {}
            for key, spec in properties.items():
                kind = spec.get("type") if isinstance(spec, dict) else None
                if kind in {"object", "array"}:
                    output[key] = {} if kind == "object" else []
                elif kind in {"number", "integer"}:
                    output[key] = 0
                elif kind == "boolean":
                    output[key] = False
                else:
                    output[key] = message or manifest.name
            return json.dumps(output, ensure_ascii=False)
        return json.dumps({"answer": message or manifest.name}, ensure_ascii=False)
    lines = [f"# {manifest.name}"]
    if message:
        lines.extend(["", message])
    for field in manifest.input_fields:
        value = values.get(field.key, field.default)
        if value is not None and value != "":
            lines.extend(["", f"**{field.label}**：{value}"])
    if context:
        lines.extend(["", "依据知识库资料生成以下内容：", "", context])
    lines.extend(["", "此内容由测试替身确定性生成，不代表真实模型输出。"])
    return "\n".join(lines)


def _extract_json(content: str) -> Any:
    text = content.strip()
    if text.startswith("```"):
        lines = text.splitlines()[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        starts = [index for index in (text.find("{"), text.find("[")) if index >= 0]
        ends = [index for index in (text.rfind("}"), text.rfind("]")) if index >= 0]
        if not starts or not ends:
            raise ValueError("LLM output is not valid JSON")
        try:
            return json.loads(text[min(starts) : max(ends) + 1])
        except json.JSONDecodeError as exc:
            raise ValueError("LLM output is not valid JSON") from exc


def _check_json_schema(value: Any, schema: dict[str, Any], path: str = "output") -> None:
    expected = schema.get("type")
    valid = True
    if expected == "object":
        valid = isinstance(value, dict)
    elif expected == "array":
        valid = isinstance(value, list)
    elif expected == "string":
        valid = isinstance(value, str)
    elif expected == "integer":
        valid = isinstance(value, int) and not isinstance(value, bool)
    elif expected == "number":
        valid = isinstance(value, int | float) and not isinstance(value, bool)
    elif expected == "boolean":
        valid = isinstance(value, bool)
    if not valid:
        raise ValueError(f"{path} does not match JSON schema type {expected}")
    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                raise ValueError(f"{path}.{key} is required by the JSON schema")
        properties = schema.get("properties", {})
        if isinstance(properties, dict):
            for key, child_schema in properties.items():
                if key in value and isinstance(child_schema, dict):
                    _check_json_schema(value[key], child_schema, f"{path}.{key}")
    if isinstance(value, list) and isinstance(schema.get("items"), dict):
        for index, item in enumerate(value):
            _check_json_schema(item, schema["items"], f"{path}.{index}")


async def execute_manifest(
    session: AsyncSession,
    manifest: Manifest | dict[str, Any],
    *,
    message: str = "",
    input_values: dict[str, Any] | None = None,
    history: list[Any] | None = None,
    workspace_id: str,
) -> dict[str, Any]:
    started = monotonic()
    manifest = manifest if isinstance(manifest, Manifest) else Manifest.model_validate(manifest)
    values = dict(input_values or {})
    input_result = validate_inputs(manifest, values)
    if not input_result.valid:
        raise ValueError(f"Invalid app inputs: {[issue.model_dump() for issue in input_result.issues]}")
    effective_values = {
        field.key: values.get(field.key, field.default)
        for field in manifest.input_fields
    }
    query = message.strip() or "\n".join(
        str(value) for value in effective_values.values() if value is not None and value != ""
    )
    if not query:
        raise ValueError("message or input values are required")
    if not manifest.llm_model_id:
        raise ValueError("Manifest has no LLM model configured")
    model = await session.get(ModelConfig, manifest.llm_model_id)
    if (
        model is None
        or model.workspace_id != workspace_id
        or model.model_type != ModelType.LLM
        or not model.is_enabled
    ):
        raise ValueError("Configured LLM model is missing, disabled, or outside the workspace")

    retrieval_config = _retrieval_config(manifest)
    retrieved: list[RetrievedChunk] = []
    retrieval_simulated = False
    if manifest.knowledge_base_ids:
        knowledge_bases = list(
            await session.scalars(
                select(KnowledgeBase).where(
                    KnowledgeBase.id.in_(manifest.knowledge_base_ids),
                    KnowledgeBase.workspace_id == workspace_id,
                )
            )
        )
        by_id = {item.id: item for item in knowledge_bases}
        if set(by_id) != set(manifest.knowledge_base_ids):
            raise ValueError("A configured knowledge base is unavailable in this workspace")
        runs = []
        for knowledge_base_id in manifest.knowledge_base_ids:
            run = await retrieve_knowledge_base(
                session,
                by_id[knowledge_base_id],
                query,
                top_k=retrieval_config["top_k"],
                rerank_top_n=retrieval_config["rerank_top_n"],
                score_threshold=retrieval_config["score_threshold"],
            )
            runs.append(run)
            retrieval_simulated = retrieval_simulated or run.simulated
        fusion_scores: dict[str, float] = {}
        chunks_by_id: dict[str, RetrievedChunk] = {}
        for run in runs:
            for rank, item in enumerate(run.results, start=1):
                fusion_scores[item.chunk_id] = fusion_scores.get(item.chunk_id, 0.0) + 1.0 / (10 + rank)
                chunks_by_id[item.chunk_id] = item
        retrieved = sorted(chunks_by_id.values(), key=lambda item: fusion_scores[item.chunk_id], reverse=True)
    context, cited_chunks = _context(retrieved, retrieval_config["max_context_chars"])
    citations = [_citation(item) for item in cited_chunks]

    evidence_required = manifest.guardrails.refuse_without_evidence or manifest.guardrails.require_citations
    if manifest.knowledge_base_ids and evidence_required and not citations:
        handoff = manifest.guardrails.human_handoff
        content = "当前请求需要人工处理，已发起人工转接。" if handoff else "未检索到足够依据，无法可靠回答。"
        return {
            "content": content,
            "citations": [],
            "tokens": {"input": None, "output": None, "total": None},
            "duration_ms": int((monotonic() - started) * 1000),
            "simulated": retrieval_simulated,
            "output_json": None,
            "handoff": handoff,
        }

    gateway = build_gateway(model)
    simulated = gateway.is_simulated or retrieval_simulated
    if gateway.is_simulated:
        answer = _mock_output(manifest, message.strip(), effective_values, context)
        usage = {"input_tokens": 12, "output_tokens": 16, "total_tokens": 28}
    else:
        input_text = "\n".join(
            f"{field.label} ({field.key}): {effective_values.get(field.key)}"
            for field in manifest.input_fields
            if effective_values.get(field.key) is not None
        )
        output_instruction = ""
        if manifest.output.format == "json":
            output_instruction = (
                "\n只输出有效 JSON，不要 Markdown 代码块。JSON Schema：\n"
                + json.dumps(manifest.output.json_schema or {"type": "object"}, ensure_ascii=False)
            )
        elif manifest.output.format == "text":
            output_instruction = "\n只输出纯文本，不要使用 Markdown 标记。"
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "{system_prompt}\n\n动态输入字段：\n{input_text}\n\n知识库上下文：\n{context}\n"
                    "上下文为空时不要声称存在知识依据。引用资料时使用 [资料 1] 编号。"
                    + output_instruction,
                ),
                MessagesPlaceholder("history"),
                ("human", "{message}"),
            ]
        )
        response = await (prompt | gateway.chat_model()).ainvoke(
            {
                "system_prompt": manifest.system_prompt,
                "input_text": input_text or "无",
                "context": context or "无知识库上下文",
                "history": _history(history or [], manifest.memory.max_turns) if manifest.memory.enabled else [],
                "message": query,
            }
        )
        answer = _content_text(getattr(response, "content", response)).strip()
        if not answer:
            raise ValueError("LLM returned an empty answer")
        usage = getattr(response, "usage_metadata", None) or {}

    blocked = next(
        (topic for topic in manifest.guardrails.blocked_topics if topic.lower() in answer.lower()),
        None,
    )
    handoff = bool(blocked and manifest.guardrails.human_handoff)
    if blocked:
        answer = "当前请求需要人工处理，已发起人工转接。" if handoff else "生成内容触及已配置的禁止主题，已停止输出。"
        output_json = None
    else:
        answer = answer[: manifest.guardrails.max_output_chars]
        output_json = None
        if manifest.output.format == "json":
            output_json = _extract_json(answer)
            if manifest.output.json_schema:
                _check_json_schema(output_json, manifest.output.json_schema)
    tokens = {
        "input": usage.get("input_tokens"),
        "output": usage.get("output_tokens"),
        "total": usage.get("total_tokens"),
    }
    if tokens["total"] is None and tokens["input"] is not None and tokens["output"] is not None:
        tokens["total"] = tokens["input"] + tokens["output"]
    return {
        "content": answer,
        "citations": citations,
        "tokens": tokens,
        "duration_ms": int((monotonic() - started) * 1000),
        "simulated": simulated,
        "output_json": output_json,
        "handoff": handoff,
    }


run_manifest = execute_manifest
