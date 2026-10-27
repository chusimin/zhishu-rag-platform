# 知枢 · FDE AI 应用中台 2.0

面向前线交付工程师（FDE）的 AI 应用交付平台。业务人员或 AI Agent 可以从需求简报出发，完成应用设计、结构化配置、真实预览、二元评测、版本发布和业务端交付。

核心原则：**人与 AI 使用同一套 `fde.app/v1` 协议和控制 API，预览不会隐式发布，业务端只运行已发布版本。**

## 已实现能力

- AI 应用设计室：自然语言生成 Manifest，支持字段级编辑与协议查看。
- 五类标准模板：知识问答、通用内容创作、结构化报告、知识审校、智能客服。
- 动态业务输入：文本、长文本、数字、选择和布尔字段，支持必填、默认值、选项和数值范围。
- 应用运行时：可选知识库、RAG 引用、上下文预算、历史记忆、Markdown/文本/JSON 输出、无依据拒答与人工转接。
- 交付闭环：草稿、真实预览、评测集、二元 Pass/Fail、不可变版本、发布、下线与回滚。
- 独立业务端：应用目录、动态表单、结果复制、引用查看和用户反馈。
- Agent 控制面：能力发现、专用 API Token、工作区隔离和审计事件。
- 身份与权限：PBKDF2 密码哈希、随机会话 Token、工作区成员与角色；生产环境禁用 Demo 角色。
- 知识流水线：PDF、DOCX、Markdown、图片、XLSX/XLSM、CSV，OCR、分块、Embedding、Rerank、失败重试和对象清理。
- 可观测性：会话、消息、Token、耗时、Trace、筛选、分页和模拟来源标记。

## 技术架构

- 前端：React 18、TypeScript、Vite、React Router、Vitest。
- API：FastAPI、Pydantic、SQLAlchemy Async、Alembic。
- RAG：LangChain、PostgreSQL 16 + pgvector、可选 Rerank。
- 异步任务：Celery、Redis。
- 文件存储：S3 协议；本地 Docker 使用 RustFS。
- 模型服务：OpenAI-compatible 网关，支持 OpenRouter、AIHubMix、DeepSeek、通义及明确的测试替身。

保持“模块化单体 API + 独立 Worker”，不为当前规模拆微服务。

## 快速启动

### 1. 安装依赖

```bash
cp .env.example .env
pnpm install
cd backend && uv sync
```

### 2. 启动基础设施与后端

```bash
docker-compose up -d --build
```

开发环境启动时会执行兼容迁移并创建默认空间和管理员。正式环境不要依赖自动建表，请执行：

```bash
cd backend
APP_DATABASE_URL='postgresql+asyncpg://USER:PASSWORD@HOST:5432/rag_hub' uv run alembic upgrade head
```

默认地址：

- API：`http://127.0.0.1:8001`
- OpenAPI：`http://127.0.0.1:8001/docs`
- PostgreSQL：`127.0.0.1:56432`
- Redis：`127.0.0.1:57379`
- S3 API：`http://127.0.0.1:59000`

### 3. 启动前端

```bash
pnpm dev
```

打开 `http://127.0.0.1:4173`。

开发环境初始账号：

- 邮箱：`admin@fde.local`
- 密码：`fde-dev-admin`

密码由 `APP_BOOTSTRAP_ADMIN_PASSWORD` 控制。生产环境必须修改，并建议接入企业 OIDC 后关闭初始账号。

## FDE 核心交付路径

1. 在“AI 设计室”输入业务需求，或选择标准模板。
2. AI 生成 `fde.app/v1` Manifest；检查输入字段、提示词、模型、知识和输出契约。
3. 保存草稿，使用真实业务输入运行预览。
4. 创建评测集，使用期望关键词、禁止关键词和引用要求做二元验收。
5. 创建不可变版本并发布；有评测集时，最近评测必须全部通过。
6. 在独立业务端使用应用，收集反馈；后续修改草稿不影响线上版本，可回滚历史版本。

## Manifest 示例

```json
{
  "schema_version": "fde.app/v1",
  "name": "特色菜文案助手",
  "description": "根据真实菜品信息生成渠道文案",
  "template_key": "content",
  "system_prompt": "根据事实生成文案，不虚构功效。",
  "llm_model_id": "MODEL_ID",
  "knowledge_base_ids": [],
  "input_fields": [
    {"key": "dish_name", "label": "菜品名称", "type": "text", "required": true, "options": []},
    {"key": "channel", "label": "渠道", "type": "select", "required": true, "options": ["小红书", "公众号"], "default": "小红书"}
  ],
  "output": {"format": "markdown"},
  "tools": [],
  "guardrails": {
    "blocked_topics": ["虚假功效"],
    "require_citations": false,
    "refuse_without_evidence": false,
    "human_handoff": false,
    "max_output_chars": 15000
  },
  "memory": {"enabled": false, "max_turns": 10},
  "delivery": {"channel": "both", "show_citations": false, "allow_copy": true, "allow_export": true}
}
```

## Agent API

先由管理员在“Agent 接入”页面创建 Token，再读取能力目录：

```bash
curl -H "Authorization: Bearer $FDE_TOKEN" \
  http://127.0.0.1:8001/api/v1/fde/capabilities
```

生成应用定义：

```bash
curl -X POST http://127.0.0.1:8001/api/v1/fde/design \
  -H "Authorization: Bearer $FDE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"brief":"为餐饮业务设计特色菜文案应用","template_key":"content"}'
```

主要端点：

| 操作 | API |
|---|---|
| 能力发现 | `GET /api/v1/fde/capabilities` |
| 模板列表 | `GET /api/v1/fde/templates` |
| AI 设计 | `POST /api/v1/fde/design` |
| Manifest 校验 | `POST /api/v1/fde/validate` |
| 创建草稿 | `POST /api/v1/fde/apps` |
| 更新草稿 | `PUT /api/v1/fde/apps/{id}/manifest` |
| 草稿预览 | `POST /api/v1/fde/apps/{id}/preview` |
| 保存评测集 | `PUT /api/v1/fde/apps/{id}/evaluation-suite` |
| 运行评测 | `POST /api/v1/fde/apps/{id}/evaluate` |
| 固化版本 | `POST /api/v1/fde/apps/{id}/versions` |
| 发布 / 回滚 / 下线 | `POST /api/v1/fde/apps/{id}/publish|rollback|unpublish` |
| 业务运行 | `POST /api/v1/fde/apps/{id}/run` |
| 用户反馈 | `POST /api/v1/fde/messages/{message_id}/feedback` |

Agent 的工作区由 Token 决定。不要在前端或代码仓库中硬编码 Token。

## 模板边界

| 模板 | 知识库 | 专属能力 |
|---|---|---|
| 知识问答 | 必需 | 检索、引用、无依据拒答 |
| 通用内容创作 | 可选 | 结构化素材、渠道、语气、字数，无知识库也可运行 |
| 结构化报告 | 可选 | 主题、受众、结构和引用 |
| 知识审校 | 必需 | 依据检查、引用和风险说明 |
| 智能客服 | 必需 | 服务知识、客户上下文、人工转接事件 |

## 验证

```bash
cd backend
uv run pytest -q
APP_RUN_INTEGRATION=1 uv run pytest tests/test_integration_services.py -q

pnpm test
pnpm typecheck
pnpm build
```

前端验收建议依次检查：AI 设计 → 保存草稿 → 真实预览 → 评测 PASS → 发布 → 业务端生成 → 反馈，并覆盖桌面和移动端。

## 当前明确边界

- FDE 动态表单运行当前为非流式响应；旧知识问答保留 SSE 流式对话。
- 通用外部 HTTP 工具执行尚未开放，能力目录会明确返回 `external_http_tools=false`，不会伪装成 CRM/工单系统已接通。
- 智能客服提供知识回答和人工转接事件，不等同于完整客服工单、SLA 和渠道系统。
- 测试替身只用于自动化测试与本地链路验证，响应始终标记 `simulated=true`，生产禁止创建。

## 生产检查清单

- 设置强随机 `APP_ENCRYPTION_KEY`、`APP_BOOTSTRAP_ADMIN_PASSWORD` 和存储凭据。
- 设置 `APP_ENV=production`、`APP_AUTO_CREATE_DB=false`，先运行 Alembic 迁移。
- 使用真实登录或专用 Agent Token；Demo Header 在生产环境无效。
- 配置 HTTPS、反向代理、CORS、限流、备份恢复、日志脱敏与数据保留策略。
- 使用 PostgreSQL + Celery + S3 和真实模型完成发布前验收，不以 SQLite/mock 结果证明模型质量。
