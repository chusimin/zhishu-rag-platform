from __future__ import annotations

import io
import json

from httpx import AsyncClient
from PIL import Image


ADMIN_HEADERS = {"X-Demo-Role": "admin"}
MANAGER_HEADERS = {"X-Demo-Role": "manager"}


async def _create_mock_embedding(client: AsyncClient) -> str:
    response = await client.post(
        "/api/v1/models",
        headers=ADMIN_HEADERS,
        json={
            "display_name": "测试 Embedding",
            "provider": "mock",
            "model_type": "embedding",
            "model_name": "deterministic-test-vector",
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


async def _create_mock_ocr(client: AsyncClient) -> str:
    response = await client.post(
        "/api/v1/models",
        headers=ADMIN_HEADERS,
        json={
            "display_name": "测试 OCR",
            "provider": "mock",
            "model_type": "ocr",
            "model_name": "deterministic-test-ocr",
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


async def _create_mock_metadata_llm(client: AsyncClient) -> str:
    response_text = json.dumps(
        {
            "document_time": "2026-10-01",
            "version": "V1.4",
            "subjects": ["华北销售团队", "客户报价制度"],
            "owner": "销售运营部",
            "keywords": ["客户报价", "折扣审批", "销售运营"],
            "likely_questions": ["折扣超过多少需要审批？", "报价制度由哪个部门负责？"],
        },
        ensure_ascii=False,
    )
    response = await client.post(
        "/api/v1/models",
        headers=ADMIN_HEADERS,
        json={
            "display_name": "测试元数据 LLM",
            "provider": "mock",
            "model_type": "llm",
            "model_name": "metadata-test-double",
            "config": {"response_text": response_text},
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


async def test_markdown_import_builds_editable_vectorized_chunks(client: AsyncClient) -> None:
    embedding_model_id = await _create_mock_embedding(client)
    created = await client.post(
        "/api/v1/knowledge-bases",
        headers=MANAGER_HEADERS,
        json={
            "name": "企业制度库",
            "description": "测试导入链路",
            "embedding_model_id": embedding_model_id,
            "chunk_size": 100,
            "chunk_overlap": 20,
        },
    )
    assert created.status_code == 201, created.text
    knowledge_base_id = created.json()["id"]

    content = "# 差旅制度\n\n员工出差前需要提交审批。\n\n## 报销\n\n发票应在三十天内提交。"
    uploaded = await client.post(
        f"/api/v1/knowledge-bases/{knowledge_base_id}/files",
        headers=MANAGER_HEADERS,
        files={"upload": ("travel.md", content.encode(), "text/markdown")},
    )
    assert uploaded.status_code == 202, uploaded.text
    body = uploaded.json()
    assert body["file"]["status"] == "completed"
    assert body["file"]["chunk_count"] >= 1
    assert body["job"]["status"] == "completed"
    assert body["job"]["progress"] == 100
    assert all(stage["status"] == "success" for stage in body["job"]["stage_details"])

    jobs = await client.get(
        f"/api/v1/knowledge-bases/{knowledge_base_id}/import-jobs",
        headers=MANAGER_HEADERS,
    )
    assert jobs.status_code == 200
    assert [job["id"] for job in jobs.json()] == [body["job"]["id"]]

    chunks = await client.get(
        f"/api/v1/knowledge-bases/{knowledge_base_id}/chunks",
        headers=MANAGER_HEADERS,
    )
    assert chunks.status_code == 200, chunks.text
    chunk = chunks.json()[0]
    assert chunk["indexed"] is True
    assert "差旅制度" in chunk["content"]

    edited = await client.patch(
        f"/api/v1/knowledge-bases/{knowledge_base_id}/chunks/{chunk['id']}",
        headers=MANAGER_HEADERS,
        json={"content": "人工修订后的制度内容"},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["content"] == "人工修订后的制度内容"
    assert edited.json()["char_count"] == len("人工修订后的制度内容")
    assert edited.json()["indexed"] is False

    duplicate = await client.post(
        f"/api/v1/knowledge-bases/{knowledge_base_id}/files",
        headers=MANAGER_HEADERS,
        files={"upload": ("renamed.md", content.encode(), "text/markdown")},
    )
    assert duplicate.status_code == 409

    detail = await client.get(
        f"/api/v1/knowledge-bases/{knowledge_base_id}",
        headers=MANAGER_HEADERS,
    )
    assert detail.status_code == 200
    assert detail.json()["file_count"] == 1
    assert detail.json()["chunk_count"] == len(chunks.json()) - 1

    replacement_embedding_id = await _create_mock_embedding(client)
    changed_model = await client.patch(
        f"/api/v1/knowledge-bases/{knowledge_base_id}",
        headers=MANAGER_HEADERS,
        json={"embedding_model_id": replacement_embedding_id},
    )
    assert changed_model.status_code == 200
    assert changed_model.json()["chunk_count"] == 0
    invalidated = await client.get(
        f"/api/v1/knowledge-bases/{knowledge_base_id}/chunks",
        headers=MANAGER_HEADERS,
    )
    assert all(chunk["indexed"] is False for chunk in invalidated.json())


async def test_image_import_uses_knowledge_base_ocr_model(client: AsyncClient) -> None:
    embedding_model_id = await _create_mock_embedding(client)
    ocr_model_id = await _create_mock_ocr(client)
    created = await client.post(
        "/api/v1/knowledge-bases",
        headers=MANAGER_HEADERS,
        json={
            "name": "图片资料库",
            "embedding_model_id": embedding_model_id,
            "ocr_model_id": ocr_model_id,
            "chunk_size": 100,
            "chunk_overlap": 20,
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["ocr_model_id"] == ocr_model_id

    payload = io.BytesIO()
    Image.new("RGB", (80, 40), color="white").save(payload, format="PNG")
    uploaded = await client.post(
        f"/api/v1/knowledge-bases/{created.json()['id']}/files",
        headers=MANAGER_HEADERS,
        files={"upload": ("scan.png", payload.getvalue(), "image/png")},
    )
    assert uploaded.status_code == 202, uploaded.text
    assert uploaded.json()["job"]["status"] == "completed"

    chunks = await client.get(
        f"/api/v1/knowledge-bases/{created.json()['id']}/chunks",
        headers=MANAGER_HEADERS,
    )
    assert chunks.status_code == 200
    assert "OCR 测试替身" in chunks.json()[0]["content"]


async def test_metadata_llm_is_persisted_indexed_and_manually_editable(client: AsyncClient) -> None:
    embedding_model_id = await _create_mock_embedding(client)
    metadata_llm_model_id = await _create_mock_metadata_llm(client)
    created = await client.post(
        "/api/v1/knowledge-bases",
        headers=MANAGER_HEADERS,
        json={
            "name": "销售制度库",
            "embedding_model_id": embedding_model_id,
            "metadata_llm_model_id": metadata_llm_model_id,
            "chunk_size": 100,
            "chunk_overlap": 20,
        },
    )
    assert created.status_code == 201, created.text
    knowledge_base_id = created.json()["id"]

    uploaded = await client.post(
        f"/api/v1/knowledge-bases/{knowledge_base_id}/files",
        headers=MANAGER_HEADERS,
        files={"upload": ("报价制度.md", "# 报价制度\n折扣超过八折需要审批。".encode(), "text/markdown")},
    )
    assert uploaded.status_code == 202, uploaded.text
    body = uploaded.json()
    assert body["job"]["status"] == "completed"
    assert "metadata_extraction" in [stage["name"] for stage in body["job"]["stage_details"]]
    metadata = body["file"]["document_metadata"]
    assert metadata["version"] == "V1.4"
    assert metadata["owner"] == "销售运营部"
    assert metadata["extraction_method"] == "llm"
    assert metadata["model_id"] == metadata_llm_model_id

    chunks = await client.get(
        f"/api/v1/knowledge-bases/{knowledge_base_id}/chunks",
        headers=MANAGER_HEADERS,
    )
    assert chunks.status_code == 200
    assert chunks.json()[0]["metadata_json"]["document_metadata"]["keywords"] == [
        "客户报价",
        "折扣审批",
        "销售运营",
    ]
    assert chunks.json()[0]["indexed"] is True

    updated = await client.patch(
        f"/api/v1/knowledge-bases/{knowledge_base_id}/files/{body['file']['id']}/metadata",
        headers=MANAGER_HEADERS,
        json={
            "owner": "大客户业务部",
            "keywords": ["重点客户", "报价审批"],
            "likely_questions": ["重点客户报价由谁审批？"],
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["document_metadata"]["owner"] == "大客户业务部"
    assert updated.json()["document_metadata"]["extraction_method"] == "manual"

    invalidated = await client.get(
        f"/api/v1/knowledge-bases/{knowledge_base_id}/chunks",
        headers=MANAGER_HEADERS,
    )
    assert invalidated.json()[0]["indexed"] is False
    assert invalidated.json()[0]["metadata_json"]["document_metadata"]["keywords"] == [
        "重点客户",
        "报价审批",
    ]

    rebuilt = await client.post(
        f"/api/v1/knowledge-bases/{knowledge_base_id}/rebuild",
        headers=MANAGER_HEADERS,
    )
    assert rebuilt.status_code == 202, rebuilt.text
    assert rebuilt.json()[0]["status"] == "completed"
    refreshed_files = await client.get(
        f"/api/v1/knowledge-bases/{knowledge_base_id}/files",
        headers=MANAGER_HEADERS,
    )
    assert refreshed_files.json()[0]["document_metadata"]["owner"] == "大客户业务部"
    refreshed_chunks = await client.get(
        f"/api/v1/knowledge-bases/{knowledge_base_id}/chunks",
        headers=MANAGER_HEADERS,
    )
    assert refreshed_chunks.json()[0]["indexed"] is True
    assert refreshed_chunks.json()[0]["metadata_json"]["document_metadata"]["owner"] == "大客户业务部"
