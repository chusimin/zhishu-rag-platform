from __future__ import annotations

from httpx import AsyncClient

from app.models import DEFAULT_WORKSPACE_ID, Membership, User, Workspace
from app.security import hash_password

ADMIN = {"X-Demo-Role": "admin"}
USER = {"X-Demo-Role": "user"}


async def create_mock_llm(client: AsyncClient) -> str:
    response = await client.post(
        "/api/v1/models",
        headers=ADMIN,
        json={"display_name": "FDE mock LLM", "provider": "mock", "model_type": "llm", "model_name": "test"},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def design_content(client: AsyncClient, model_id: str) -> dict:
    response = await client.post(
        "/api/v1/fde/design",
        headers=ADMIN,
        json={"brief": "为餐饮业务设计特色菜文案生成应用，支持渠道和语气", "template_key": "content", "llm_model_id": model_id},
    )
    assert response.status_code == 200, response.text
    assert response.json()["simulated"] is True
    manifest = response.json()["manifest"]
    manifest["name"] = "特色菜文案助手"
    return manifest


def content_inputs() -> dict:
    return {
        "dish_name": "云南汽锅鸡",
        "ingredients_taste": "土鸡、菌菇，汤鲜味浓",
        "selling_points": "不加一滴水，蒸汽凝结成汤",
        "channel": "小红书",
        "tone": "亲切",
        "word_count": 300,
        "audience": "周末聚餐人群",
    }


async def test_fde_content_delivery_workflow(client: AsyncClient) -> None:
    model_id = await create_mock_llm(client)
    manifest = await design_content(client, model_id)
    created = await client.post("/api/v1/fde/apps", headers=ADMIN, json={"manifest": manifest})
    assert created.status_code == 201, created.text
    app_id = created.json()["id"]
    assert created.json()["status"] == "draft"

    preview = await client.post(f"/api/v1/fde/apps/{app_id}/preview", headers=ADMIN, json={"input_values": content_inputs()})
    assert preview.status_code == 200, preview.text
    assert "云南汽锅鸡" in preview.json()["content"]
    assert preview.json()["simulated"] is True

    unpublished = await client.post(f"/api/v1/fde/apps/{app_id}/run", headers=USER, json={"input_values": content_inputs()})
    assert unpublished.status_code == 404

    version = await client.post(f"/api/v1/fde/apps/{app_id}/versions", headers=ADMIN)
    assert version.status_code == 201, version.text
    assert version.json()["version"] == 1
    published = await client.post(f"/api/v1/fde/apps/{app_id}/publish", headers=ADMIN, json={})
    assert published.status_code == 200, published.text
    assert published.json()["published_version"]["version"] == 1

    run = await client.post(f"/api/v1/fde/apps/{app_id}/run", headers=USER, json={"input_values": content_inputs()})
    assert run.status_code == 200, run.text
    assert run.json()["app_version_id"] == version.json()["id"]
    feedback = await client.post(f"/api/v1/fde/messages/{run.json()['message_id']}/feedback", headers=USER, json={"rating": 1, "comment": "可用"})
    assert feedback.status_code == 201, feedback.text


async def test_fde_evaluation_gate_and_workspace_isolation(client: AsyncClient) -> None:
    model_id = await create_mock_llm(client)
    manifest = await design_content(client, model_id)
    created = await client.post("/api/v1/fde/apps", headers=ADMIN, json={"manifest": manifest})
    app_id = created.json()["id"]
    suite = {
        "name": "内容交付验收",
        "cases": [{
            "name": "包含菜品与测试标识",
            "input_values": content_inputs(),
            "expected_keywords": ["云南汽锅鸡", "测试替身"],
            "forbidden_keywords": ["绝对第一"],
        }],
    }
    saved = await client.put(f"/api/v1/fde/apps/{app_id}/evaluation-suite", headers=ADMIN, json=suite)
    assert saved.status_code == 200, saved.text
    evaluated = await client.post(f"/api/v1/fde/apps/{app_id}/evaluate", headers=ADMIN)
    assert evaluated.status_code == 200, evaluated.text
    assert evaluated.json()["passed_count"] == 1
    assert evaluated.json()["failed_count"] == 0
    await client.post(f"/api/v1/fde/apps/{app_id}/versions", headers=ADMIN)
    published = await client.post(f"/api/v1/fde/apps/{app_id}/publish", headers=ADMIN, json={})
    assert published.status_code == 200, published.text

    other = {"X-Demo-Role": "admin", "X-Workspace-ID": "00000000-0000-0000-0000-000000000099"}
    isolated = await client.get(f"/api/v1/fde/apps/{app_id}", headers=other)
    assert isolated.status_code == 404


async def test_fde_qa_requires_knowledge_and_capabilities(client: AsyncClient) -> None:
    model_id = await create_mock_llm(client)
    capabilities = await client.get("/api/v1/fde/capabilities", headers=USER)
    assert capabilities.status_code == 200
    assert len(capabilities.json()["templates"]) == 5
    designed = await client.post("/api/v1/fde/design", headers=ADMIN, json={"brief": "员工制度问答", "template_key": "qa", "llm_model_id": model_id})
    created = await client.post("/api/v1/fde/apps", headers=ADMIN, json={"manifest": designed.json()["manifest"]})
    app_id = created.json()["id"]
    invalid = await client.post(f"/api/v1/fde/apps/{app_id}/versions", headers=ADMIN)
    assert invalid.status_code == 422


async def test_real_login_and_api_client(client: AsyncClient, db_session) -> None:
    workspace = Workspace(id=DEFAULT_WORKSPACE_ID, name="默认", slug="default")
    user = User(email="owner@example.com", display_name="Owner", password_hash=hash_password("correct-horse"))
    db_session.add_all([workspace, user])
    await db_session.flush()
    db_session.add(Membership(workspace_id=workspace.id, user_id=user.id, role="admin"))
    await db_session.commit()
    logged = await client.post("/api/v1/auth/login", json={"email": "owner@example.com", "password": "correct-horse"})
    assert logged.status_code == 200, logged.text
    token = logged.json()["token"]
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["role"] == "admin"
    api_client = await client.post("/api/v1/auth/api-clients", headers={"Authorization": f"Bearer {token}"}, json={"name": "FDE Agent"})
    assert api_client.status_code == 201, api_client.text
    agent_token = api_client.json()["token"]
    capabilities = await client.get("/api/v1/fde/capabilities", headers={"Authorization": f"Bearer {agent_token}"})
    assert capabilities.status_code == 200


async def test_production_rejects_demo_role(client: AsyncClient, monkeypatch) -> None:
    from app.config import get_settings

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("APP_AUTO_CREATE_DB", "false")
    monkeypatch.setenv("APP_ENCRYPTION_KEY", "production-test-key")
    monkeypatch.setenv("APP_BOOTSTRAP_ADMIN_PASSWORD", "production-test-password")
    monkeypatch.setenv("APP_S3_SECRET_KEY", "production-storage-secret")
    get_settings.cache_clear()
    response = await client.get("/api/v1/fde/capabilities", headers=ADMIN)
    assert response.status_code == 401


async def test_legacy_models_are_workspace_scoped(client: AsyncClient) -> None:
    model_id = await create_mock_llm(client)
    other = {"X-Demo-Role": "admin", "X-Workspace-ID": "00000000-0000-0000-0000-000000000099"}
    hidden = await client.get(f"/api/v1/models/{model_id}", headers=other)
    listed = await client.get("/api/v1/models", headers=other)
    assert hidden.status_code == 404
    assert listed.json() == []
