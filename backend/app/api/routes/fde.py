from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ...db import get_session
from ...fde import Manifest, list_templates, manifest_from_qa_app, validate_for_publish, validate_manifest
from ...fde.designer import DesignError, design_manifest
from ...fde.runtime import execute_manifest
from ...models import (
    AppVersion,
    AuditEvent,
    Conversation,
    EvaluationCase,
    EvaluationRun,
    EvaluationSuite,
    Feedback,
    KnowledgeBase,
    Message,
    ModelConfig,
    ModelType,
    QAApp,
    QueryLog,
    RunStatus,
    utc_now,
)
from ...security import AuthContext, get_auth_context, require_roles

router = APIRouter()


class DesignRequest(BaseModel):
    brief: str = Field(min_length=4, max_length=12000)
    template_key: str = "content"
    llm_model_id: str | None = None
    base_manifest: dict[str, Any] | None = None


class ManifestRequest(BaseModel):
    manifest: dict[str, Any]


class AppCreateRequest(ManifestRequest):
    start_from_template: str | None = None


class VersionRequest(BaseModel):
    version_id: str | None = None


class RunRequest(BaseModel):
    message: str = Field(default="", max_length=12000)
    input_values: dict[str, Any] = Field(default_factory=dict)
    conversation_id: str | None = None


class EvaluationCaseRequest(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    message: str = Field(default="", max_length=12000)
    input_values: dict[str, Any] = Field(default_factory=dict)
    expected_keywords: list[str] = Field(default_factory=list, max_length=20)
    forbidden_keywords: list[str] = Field(default_factory=list, max_length=20)
    require_citations: bool = False


class EvaluationSuiteRequest(BaseModel):
    name: str = Field(default="默认发布验收", min_length=1, max_length=180)
    cases: list[EvaluationCaseRequest] = Field(min_length=1, max_length=100)


class FeedbackRequest(BaseModel):
    rating: Literal[-1, 1]
    comment: str = Field(default="", max_length=4000)


def _draft(app: QAApp) -> Manifest:
    return Manifest.model_validate(app.draft_manifest) if app.draft_manifest else manifest_from_qa_app(app)


async def _app(session: AsyncSession, app_id: str, workspace_id: str) -> QAApp:
    result = await session.scalars(
        select(QAApp)
        .where(QAApp.id == app_id, QAApp.workspace_id == workspace_id)
        .options(selectinload(QAApp.knowledge_bases), selectinload(QAApp.versions))
    )
    app = result.one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="应用不存在或不在当前业务空间")
    return app


async def _resource_ids(session: AsyncSession, workspace_id: str) -> tuple[set[str], set[str]]:
    models = set(await session.scalars(select(ModelConfig.id).where(ModelConfig.workspace_id == workspace_id, ModelConfig.model_type == ModelType.LLM, ModelConfig.is_enabled.is_(True))))
    knowledge = set(await session.scalars(select(KnowledgeBase.id).where(KnowledgeBase.workspace_id == workspace_id)))
    return models, knowledge


async def _audit(session: AsyncSession, context: AuthContext, action: str, app_id: str, detail: dict[str, Any] | None = None) -> None:
    session.add(AuditEvent(workspace_id=context.workspace_id, actor_id=context.user_id, action=action, resource_type="application", resource_id=app_id, detail=detail or {}))


def _version_payload(version: AppVersion) -> dict[str, Any]:
    return {"id": version.id, "version": version.version, "manifest": version.manifest, "created_at": version.created_at}


def _app_payload(app: QAApp) -> dict[str, Any]:
    manifest = _draft(app)
    versions = sorted(app.versions, key=lambda item: item.version, reverse=True)
    return {
        "id": app.id,
        "name": app.name,
        "description": app.description,
        "scenario_type": app.scenario_type,
        "status": app.status,
        "is_enabled": app.is_enabled,
        "manifest": manifest.model_dump(mode="json"),
        "draft_manifest": manifest.model_dump(mode="json"),
        "published_version_id": app.published_version_id,
        "published_version": next((_version_payload(item) for item in versions if item.id == app.published_version_id), None),
        "versions": [_version_payload(item) for item in versions],
        "portal_path": f"/portal/apps/{app.id}",
        "created_at": app.created_at,
        "updated_at": app.updated_at,
    }


async def _save_manifest(session: AsyncSession, app: QAApp, manifest: Manifest) -> None:
    app.name = manifest.name
    app.description = manifest.description
    app.scenario_type = manifest.template_key
    app.system_prompt = manifest.system_prompt
    app.llm_model_id = manifest.llm_model_id
    app.draft_manifest = manifest.model_dump(mode="json")
    retrieval = next((item.config for item in manifest.tools if item.name == "knowledge_retrieval"), {})
    app.top_k = int(retrieval.get("top_k", app.top_k or 8))
    app.rerank_top_n = int(retrieval.get("rerank_top_n", app.rerank_top_n or 3))
    app.score_threshold = float(retrieval.get("score_threshold", app.score_threshold if app.score_threshold is not None else 0.35))
    if manifest.knowledge_base_ids:
        knowledge = list(await session.scalars(select(KnowledgeBase).where(KnowledgeBase.id.in_(manifest.knowledge_base_ids), KnowledgeBase.workspace_id == app.workspace_id)))
        if len(knowledge) != len(manifest.knowledge_base_ids):
            raise HTTPException(status_code=422, detail="包含不存在或跨空间的知识库")
        by_id = {item.id: item for item in knowledge}
        app.knowledge_bases = [by_id[item] for item in manifest.knowledge_base_ids]
    else:
        app.knowledge_bases = []


@router.get("/capabilities")
async def capabilities(_context: AuthContext = Depends(get_auth_context)) -> dict[str, Any]:
    return {
        "protocol": "fde.app/v1",
        "workflow": ["discover", "design", "validate", "draft", "preview", "evaluate", "version", "publish", "run", "rollback"],
        "templates": [{"key": item.key, "name": item.name, "knowledge_bases": item.knowledge_bases.model_dump()} for item in list_templates()],
        "endpoints": {
            "design": "POST /api/v1/fde/design",
            "validate": "POST /api/v1/fde/validate",
            "create": "POST /api/v1/fde/apps",
            "preview": "POST /api/v1/fde/apps/{app_id}/preview",
            "evaluate": "POST /api/v1/fde/apps/{app_id}/evaluate",
            "publish": "POST /api/v1/fde/apps/{app_id}/publish",
            "run": "POST /api/v1/fde/apps/{app_id}/run",
        },
        "limits": {"external_http_tools": False, "streaming_fde_run": False, "evaluation_score": "binary"},
    }


@router.get("/templates")
async def templates(_context: AuthContext = Depends(get_auth_context)) -> list[dict[str, Any]]:
    return [item.model_dump(mode="json") for item in list_templates()]


@router.post("/validate")
async def validate(payload: ManifestRequest, context: AuthContext = Depends(get_auth_context), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    models, knowledge = await _resource_ids(session, context.workspace_id)
    result = validate_manifest(payload.manifest, models, knowledge)
    return result.model_dump()


@router.post("/design")
async def design(payload: DesignRequest, context: AuthContext = Depends(require_roles("admin", "manager")), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    model_id = payload.llm_model_id
    if not model_id:
        model_id = await session.scalar(select(ModelConfig.id).where(ModelConfig.workspace_id == context.workspace_id, ModelConfig.model_type == ModelType.LLM, ModelConfig.is_enabled.is_(True), ModelConfig.provider != "mock").limit(1))
    try:
        manifest, simulated = await design_manifest(session, brief=payload.brief, workspace_id=context.workspace_id, template_key=payload.template_key, llm_model_id=model_id, base_manifest=payload.base_manifest)
    except DesignError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    models, knowledge = await _resource_ids(session, context.workspace_id)
    result = validate_manifest(manifest, models, knowledge)
    return {"manifest": manifest.model_dump(mode="json"), "simulated": simulated, "issues": result.issues, "publish_ready": result.publish_ready}


@router.post("/apps", status_code=201)
async def create_app(payload: AppCreateRequest, context: AuthContext = Depends(require_roles("admin", "manager")), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    manifest = Manifest.model_validate(payload.manifest)
    app = QAApp(workspace_id=context.workspace_id, status="draft", is_enabled=False)
    await _save_manifest(session, app, manifest)
    session.add(app)
    await session.flush()
    await _audit(session, context, "application.created", app.id, {"template": manifest.template_key})
    await session.commit()
    return _app_payload(await _app(session, app.id, context.workspace_id))


@router.get("/apps/{app_id}")
async def get_app(app_id: str, context: AuthContext = Depends(get_auth_context), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    return _app_payload(await _app(session, app_id, context.workspace_id))


@router.put("/apps/{app_id}/manifest")
async def update_manifest(app_id: str, payload: ManifestRequest, context: AuthContext = Depends(require_roles("admin", "manager")), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    app = await _app(session, app_id, context.workspace_id)
    manifest = Manifest.model_validate(payload.manifest)
    await _save_manifest(session, app, manifest)
    app.status = "draft"
    await _audit(session, context, "application.draft_updated", app.id)
    await session.commit()
    return _app_payload(await _app(session, app.id, context.workspace_id))


@router.post("/apps/{app_id}/validate")
async def validate_app(app_id: str, context: AuthContext = Depends(get_auth_context), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    app = await _app(session, app_id, context.workspace_id)
    models, knowledge = await _resource_ids(session, context.workspace_id)
    return validate_manifest(_draft(app), models, knowledge).model_dump()


@router.post("/apps/{app_id}/versions", status_code=201)
async def create_version(app_id: str, context: AuthContext = Depends(require_roles("admin", "manager")), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    app = await _app(session, app_id, context.workspace_id)
    models, knowledge = await _resource_ids(session, context.workspace_id)
    validation = validate_for_publish(_draft(app), models, knowledge)
    if not validation.valid:
        raise HTTPException(status_code=422, detail={"message": "草稿校验未通过", "issues": [item.model_dump() for item in validation.issues]})
    number = (await session.scalar(select(func.max(AppVersion.version)).where(AppVersion.app_id == app.id))) or 0
    version = AppVersion(app_id=app.id, version=number + 1, manifest=_draft(app).model_dump(mode="json"), created_by=context.user_id)
    session.add(version)
    app.status = "ready"
    await _audit(session, context, "application.version_created", app.id, {"version": version.version})
    await session.commit()
    await session.refresh(version)
    return _version_payload(version)


async def _publish(app: QAApp, version_id: str | None, context: AuthContext, session: AsyncSession) -> dict[str, Any]:
    version = await session.scalar(select(AppVersion).where(AppVersion.app_id == app.id, AppVersion.id == version_id)) if version_id else await session.scalar(select(AppVersion).where(AppVersion.app_id == app.id).order_by(AppVersion.version.desc()).limit(1))
    if not version:
        raise HTTPException(status_code=422, detail="请先创建应用版本")
    models, knowledge = await _resource_ids(session, context.workspace_id)
    validation = validate_for_publish(version.manifest, models, knowledge)
    if not validation.valid:
        raise HTTPException(status_code=422, detail={"message": "发布校验未通过", "issues": [item.model_dump() for item in validation.issues]})
    suite_ids = list(await session.scalars(select(EvaluationSuite.id).where(EvaluationSuite.app_id == app.id)))
    if suite_ids:
        latest = await session.scalar(select(EvaluationRun).where(EvaluationRun.suite_id.in_(suite_ids)).order_by(EvaluationRun.created_at.desc()).limit(1))
        case_count = await session.scalar(select(func.count()).select_from(EvaluationCase).where(EvaluationCase.suite_id.in_(suite_ids)))
        if not latest or latest.failed_count or latest.passed_count < (case_count or 0):
            raise HTTPException(status_code=409, detail="发布质量门禁未通过：请先运行全部评测并确保通过")
    app.published_version_id = version.id
    app.is_enabled = True
    app.status = "published"
    await _audit(session, context, "application.published", app.id, {"version_id": version.id})
    await session.commit()
    return _app_payload(await _app(session, app.id, context.workspace_id))


@router.post("/apps/{app_id}/publish")
async def publish(app_id: str, payload: VersionRequest | None = None, context: AuthContext = Depends(require_roles("admin", "manager")), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    return await _publish(await _app(session, app_id, context.workspace_id), payload.version_id if payload else None, context, session)


@router.post("/apps/{app_id}/rollback")
async def rollback(app_id: str, payload: VersionRequest, context: AuthContext = Depends(require_roles("admin", "manager")), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    if not payload.version_id:
        raise HTTPException(status_code=422, detail="回滚必须指定 version_id")
    result = await _publish(await _app(session, app_id, context.workspace_id), payload.version_id, context, session)
    await _audit(session, context, "application.rolled_back", app_id, {"version_id": payload.version_id})
    await session.commit()
    return result


@router.post("/apps/{app_id}/unpublish")
async def unpublish(app_id: str, context: AuthContext = Depends(require_roles("admin", "manager")), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    app = await _app(session, app_id, context.workspace_id)
    app.is_enabled = False
    app.status = "offline"
    await _audit(session, context, "application.unpublished", app.id)
    await session.commit()
    return _app_payload(app)


async def _execute(app: QAApp, manifest: Manifest, version_id: str | None, payload: RunRequest, context: AuthContext, session: AsyncSession) -> dict[str, Any]:
    history: list[Message] = []
    conversation: Conversation | None = None
    if payload.conversation_id:
        conversation = await session.get(Conversation, payload.conversation_id)
        if not conversation or conversation.workspace_id != context.workspace_id or conversation.app_id != app.id:
            raise HTTPException(status_code=404, detail="会话不存在")
        if context.user_id and conversation.user_id and conversation.user_id != context.user_id:
            raise HTTPException(status_code=404, detail="会话不存在")
        history = list(await session.scalars(select(Message).where(Message.conversation_id == conversation.id).order_by(Message.created_at)))
    query = payload.message.strip() or next(iter(payload.input_values.values()), app.name)
    try:
        result = await execute_manifest(session, manifest, message=payload.message, input_values=payload.input_values, history=history, workspace_id=context.workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not conversation:
        conversation = Conversation(app_id=app.id, workspace_id=context.workspace_id, user_id=context.user_id, title=str(query)[:60], demo_role=context.role)
        session.add(conversation)
        await session.flush()
    conversation.updated_at = utc_now()
    user_message = Message(conversation_id=conversation.id, role="user", content=str(query), input_values=payload.input_values, app_version_id=version_id)
    assistant_message = Message(conversation_id=conversation.id, role="assistant", content=result["content"], citations=result["citations"], input_tokens=result["tokens"]["input"], output_tokens=result["tokens"]["output"], duration_ms=result["duration_ms"], simulated=result["simulated"], output_json=result["output_json"], app_version_id=version_id)
    log = QueryLog(workspace_id=context.workspace_id, app_id=app.id, conversation_id=conversation.id, demo_role=context.role, query=str(query), status=RunStatus.SUCCESS, input_tokens=result["tokens"]["input"], output_tokens=result["tokens"]["output"], total_tokens=result["tokens"]["total"], duration_ms=result["duration_ms"], finished_at=datetime.now(UTC))
    session.add_all([user_message, assistant_message, log])
    await session.flush()
    await session.commit()
    return {**result, "conversation_id": conversation.id, "message_id": assistant_message.id, "app_version_id": version_id, "portal_path": f"/portal/apps/{app.id}"}


@router.post("/apps/{app_id}/preview")
async def preview(app_id: str, payload: RunRequest, context: AuthContext = Depends(require_roles("admin", "manager")), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    app = await _app(session, app_id, context.workspace_id)
    return await _execute(app, _draft(app), None, payload, context, session)


@router.post("/apps/{app_id}/run")
async def run(app_id: str, payload: RunRequest, context: AuthContext = Depends(get_auth_context), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    app = await _app(session, app_id, context.workspace_id)
    if not app.is_enabled:
        raise HTTPException(status_code=404, detail="应用尚未发布")
    if not app.published_version_id:
        return await _execute(app, _draft(app), None, payload, context, session)
    version = await session.get(AppVersion, app.published_version_id)
    if not version or version.app_id != app.id:
        raise HTTPException(status_code=409, detail="发布版本不可用")
    return await _execute(app, Manifest.model_validate(version.manifest), version.id, payload, context, session)


@router.put("/apps/{app_id}/evaluation-suite")
async def save_suite(app_id: str, payload: EvaluationSuiteRequest, context: AuthContext = Depends(require_roles("admin", "manager")), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    app = await _app(session, app_id, context.workspace_id)
    suites = list(await session.scalars(select(EvaluationSuite).where(EvaluationSuite.app_id == app.id)))
    for suite in suites:
        await session.delete(suite)
    suite = EvaluationSuite(app_id=app.id, name=payload.name)
    session.add(suite)
    await session.flush()
    for item in payload.cases:
        session.add(EvaluationCase(suite_id=suite.id, **item.model_dump()))
    await session.commit()
    return {"id": suite.id, "name": suite.name, "case_count": len(payload.cases)}


@router.get("/apps/{app_id}/evaluation-suite")
async def get_suite(app_id: str, context: AuthContext = Depends(get_auth_context), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    app = await _app(session, app_id, context.workspace_id)
    suite = await session.scalar(select(EvaluationSuite).where(EvaluationSuite.app_id == app.id).options(selectinload(EvaluationSuite.cases)).order_by(EvaluationSuite.updated_at.desc()).limit(1))
    if not suite:
        return {"suite": None, "latest_run": None}
    latest = await session.scalar(select(EvaluationRun).where(EvaluationRun.suite_id == suite.id).order_by(EvaluationRun.created_at.desc()).limit(1))
    return {"suite": {"id": suite.id, "name": suite.name, "cases": [{"id": item.id, "name": item.name, "message": item.message, "input_values": item.input_values, "expected_keywords": item.expected_keywords, "forbidden_keywords": item.forbidden_keywords, "require_citations": item.require_citations} for item in suite.cases]}, "latest_run": latest.results if latest else None, "latest_summary": {"passed": latest.passed_count, "failed": latest.failed_count, "simulated": latest.simulated} if latest else None}


@router.post("/apps/{app_id}/evaluate")
async def evaluate(app_id: str, context: AuthContext = Depends(require_roles("admin", "manager")), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    app = await _app(session, app_id, context.workspace_id)
    suite = await session.scalar(select(EvaluationSuite).where(EvaluationSuite.app_id == app.id).options(selectinload(EvaluationSuite.cases)).order_by(EvaluationSuite.updated_at.desc()).limit(1))
    if not suite or not suite.cases:
        raise HTTPException(status_code=422, detail="请先创建评测集")
    manifest = _draft(app)
    run = EvaluationRun(suite_id=suite.id, status=RunStatus.RUNNING)
    results: list[dict[str, Any]] = []
    for case in suite.cases:
        reasons: list[str] = []
        try:
            result = await execute_manifest(session, manifest, message=case.message, input_values=case.input_values, workspace_id=context.workspace_id)
            content = result["content"].lower()
            missing = [item for item in case.expected_keywords if item.lower() not in content]
            forbidden = [item for item in case.forbidden_keywords if item.lower() in content]
            if missing:
                reasons.append(f"缺少期望关键词：{'、'.join(missing)}")
            if forbidden:
                reasons.append(f"包含禁止关键词：{'、'.join(forbidden)}")
            if case.require_citations and not result["citations"]:
                reasons.append("没有引用来源")
            results.append({"case_id": case.id, "name": case.name, "passed": not reasons, "reasons": reasons, "output": result["content"], "simulated": result["simulated"]})
            run.simulated = run.simulated or result["simulated"]
        except Exception as exc:
            results.append({"case_id": case.id, "name": case.name, "passed": False, "reasons": [str(exc)], "output": ""})
    run.passed_count = sum(1 for item in results if item["passed"])
    run.failed_count = len(results) - run.passed_count
    run.status = RunStatus.SUCCESS if not run.failed_count else RunStatus.FAILED
    run.results = results
    session.add(run)
    await _audit(session, context, "application.evaluated", app.id, {"passed": run.passed_count, "failed": run.failed_count})
    await session.commit()
    return {"id": run.id, "status": run.status, "passed_count": run.passed_count, "failed_count": run.failed_count, "results": results, "simulated": run.simulated}


@router.post("/messages/{message_id}/feedback", status_code=201)
async def feedback(message_id: str, payload: FeedbackRequest, context: AuthContext = Depends(get_auth_context), session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    message = await session.get(Message, message_id)
    conversation = await session.get(Conversation, message.conversation_id) if message else None
    if not message or not conversation or conversation.workspace_id != context.workspace_id or message.role != "assistant":
        raise HTTPException(status_code=404, detail="回答不存在")
    session.add(Feedback(message_id=message.id, user_id=context.user_id, rating=payload.rating, comment=payload.comment))
    await session.commit()
    return {"ok": True, "rating": payload.rating}
