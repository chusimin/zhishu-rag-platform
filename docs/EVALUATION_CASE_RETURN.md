# 线上 Case 回流与评测集技术方案

## 核心链路

`线上日志 → Trace 详情 → 保存 Good/Bad Case → 独立评测集 → 补充标准 → 运行评测`

评测集绑定一个应用。Case 只能从同一工作空间、同一应用的日志回流，确保重跑时使用正确应用配置。日志查看、Case 回流和评测运行保持为三个显式动作，均要求 `admin` 或 `manager` 角色。

## 数据设计

复用现有 `evaluation_suites`、`evaluation_cases` 和 `evaluation_runs`：

- `evaluation_suites` 增加说明、创建人和 `is_release_gate`。独立评测集不参与发布门禁；FDE 发布验收集继续单独参与门禁。
- `evaluation_cases` 增加 `case_type`、`readiness`、实际/期望输出、标签和来源字段。
- `source_snapshot` 保存回流时的会话、Trace、应用、版本、模型、渠道、Token、耗时和时间。它是不可变证据，不跟随源日志更新。
- `(suite_id, source_trace_id)` 唯一，防止同一 Trace 在同一评测集重复；不同评测集可复用。

迁移版本：`0007_evaluation_case_return`。

## Case 就绪规则

- Good Case：线上已认可输出作为参考输出，默认可运行；默认验证应用可成功执行。需要自动判断内容时，补充关键词、禁词或引用要求。
- Bad Case：没有期望输出或显式断言时为 `needs_standard`，整个评测集禁止运行。
- 补充标准后重新计算为 `ready`。
- 旧版在线对话日志若只有 `message`，运行时在恰好缺少一个必填文本字段时将原始问题映射到该字段；多字段缺失不猜测。

## API

- `GET /api/v1/evaluation-sets`
- `POST /api/v1/evaluation-sets`
- `GET/PATCH /api/v1/evaluation-sets/{suite_id}`
- `POST /api/v1/evaluation-sets/{suite_id}/cases/from-logs`
- `PATCH /api/v1/evaluation-sets/{suite_id}/cases/{case_id}`
- `POST /api/v1/evaluation-sets/{suite_id}/run`

## 前端

- `/logs`：单条 Trace 保存、同应用批量选择、目标评测集选择或新建。
- `/evaluation-sets`：跨应用评测集列表、Case 就绪状态、标准编辑、来源快照与 Trace 展开、评测运行和最近结果。
- `/evaluation-sets` 仅对管理员和管理人员开放，桌面与移动端均有导航入口。

## 验收

- 后端：权限、空间/应用隔离、去重、跨集复用、就绪状态、快照稳定性和真实运行。
- 前端：类型检查、组件测试和生产构建。
- 浏览器：真实日志分别回流 Good/Bad Case；Bad Case 补标准前不可运行，补齐后成功评测。
