# 评测模块升级设计：自动化评测模型、提示词、Skill、Agent

> 原型入口：左侧导航「评测」→ 顶部四个页签。原型数据均为虚构演示数据。

## 1. 目标

现在的评测能回答「这一版能不能发布」。升级后还要回答四类选择题：

| 评测对象 | 业务问题 | 原型示例 |
|---|---|---|
| 模型 | 换模型值不值？贵多少、好多少、哪里变差？ | 客服模型选型：DeepSeek-V3.2 / Qwen3-Max / DeepSeek-R1 |
| 提示词 | 改了提示词有没有改坏？ | 退款话术提示词 B 版（整体 +8.4%，但安全与合规回归） |
| Skill | 新接口能不能替换旧接口？工具本身正常吗？ | 订单查询 v1 → v2；Skill 单测 |
| Agent | Agent 是不是按规矩做事？ | 步数上限与知识使用方式（复合任务步数不够） |

## 2. 核心设计：四种对象 = 一种「对比实验」

模型、提示词、Skill、Agent 最终都是应用配置（Manifest）里的字段：

| 对象 | 对应配置 |
|---|---|
| 模型 | `llm_model_id`、`model.temperature`、`model.max_tokens` |
| 提示词 | `system_prompt` |
| Skill | `tools[]`（工具引用、版本、替换为 Mock） |
| Agent | `agent.max_steps`、`agent.knowledge_mode`、工具组合、转人工策略 |

因此只做一个通用能力：

> **对比实验 = 评测集 × 配置变体（基线 + 1–4 个改动）× 评测器 × 重复次数**

- **基线**：默认取应用线上版本；变体只记录「相对基线改了什么」（配置补丁），报告里直接展示改动。
- **同一批 Case**：所有变体跑同一个评测集，保证可比。
- **四种对象只是新建实验时的入口和变体编辑器不同**，运行、存储、报告、门禁完全复用。

## 3. 评测器：怎样算通过

| 类型 | 判定依据 | 成本 / 确定性 | 后端现状 |
|---|---|---|---|
| 规则判定 | 必须包含、禁止出现、要求引用、与期望输出一致 | 免费、确定 | 已有 |
| LLM 评委 | 评分细则（多项加权，1–5 分），给出理由 | 每次一次模型调用，有偏差 | 需新开发 |
| 轨迹判定 | 工具是否调用、参数、步数、确认、转人工等断言 | 免费、确定 | 部分（Trace 已记录步骤） |

LLM 评委的可信度保障：

1. **评委模型与被测模型分开**，避免「自己给自己打高分」。
2. **人工改判**：报告逐条对比里可以纠正评委，自动进入校准样本。
3. **一致率**：评委与人工判定的一致率低于 85% 时标黄，只作参考分，不建议用于门禁。
4. **校准矩阵**重点关注「评委放过、人工认为不合格」的情况，这对门禁风险最大。

## 4. 两个必须先解决的风险

- **随机波动**：每条 Case 每个变体可重复运行 1–5 次。通过率按「多数次通过」计，报告给出 ± 波动，并单独列出「不稳定」的 Case。差距在波动范围内时，结论应写「无显著差异」。
- **副作用工具**：评测 Agent 时，「创建工单」这类工具默认**模拟执行**，不发真实请求，返回 Skill 单测中预设的结果，同时记录调用参数供轨迹判定检查。关闭模拟需要显式确认，仅建议在测试环境使用。

## 5. 实验报告要回答的问题

| 区块 | 内容 |
|---|---|
| 结论 | 推荐 / 不建议 / 有回归，一句话写清原因（成本、波动、回归维度） |
| 变体对比 | 通过率 ± 波动、评委均分、平均步数（Agent）、P50 延迟、每百次费用、每次通过成本，均标出相对基线的变化 |
| 按评测维度 | 每个维度（规则或标签）各变体的通过率，变差的格子标红 |
| 需要关注 | 回归（基线过、变体不过）、改进、不稳定三类计数，点击筛选 |
| 逐条对比 | 同一条 Case 在各变体下的输出、规则结果、评委分与理由、执行轨迹并排展示 |
| 操作 | 采用推荐变体到草稿、设为门禁基线、重新运行 |

## 6. 发布门禁升级

现状：门禁评测集必须全部通过，且结果基于当前配置。

升级为两种模式，按评测集选择：

- **全部通过**（现有）：适合小而精的核心用例集。
- **相对基线无回归**（新增）：基线（通常是线上版本）通过的 Case，新版本不能失败；整体通过率不低于基线减去波动。更符合真实情况，因为很多评测集不可能 100% 通过。

回滚不受门禁限制（已实现）。

## 7. 后端对象与接口（建议）

复用现有：评测集 / Case、`execute_manifest`（给配置即可运行）、Manifest 指纹、分步运行、Trace span、工具测试接口。

新增数据：

```
Experiment        id, app_id, suite_id, target(model|prompt|skill|agent), repeats, grader_ids, mock_side_effects, status, created_by
ExperimentVariant id, experiment_id, name, is_baseline, manifest_patch(JSON), manifest_hash
ExperimentResult  experiment_id, variant_id, case_id, attempt, output, passed, rule_notes, judge_score, judge_reason, trajectory(JSON), trace_id, latency_ms, tokens, cost
Grader            id, kind(rule|llm_judge|trajectory), name, judge_model_id, rubric(JSON), pass_score, assertions(JSON)
GraderLabel       grader_id, result_id, human_passed, note      ← 人工改判，用于一致率
SkillCase         tool_id, name, arguments(JSON), assertions(JSON), mock_response(JSON)
```

新增接口：

| 操作 | API |
|---|---|
| 创建 / 列表 / 详情 | `POST/GET /experiments`、`GET /experiments/{id}` |
| 分步运行（沿用评测集的 start + step 模式） | `POST /experiments/{id}/runs`、`POST /experiments/{id}/runs/{run_id}/step` |
| 报告汇总 | `GET /experiments/{id}/report` |
| 采用变体到草稿 | `POST /experiments/{id}/variants/{variant_id}/apply` |
| 评测器 CRUD / 人工改判 | `/graders`、`POST /experiment-results/{id}/label` |
| Skill 单测 | `/tools/{id}/cases`、`POST /tools/{id}/cases/run` |

运行时改动：

- `execute_manifest` 增加 `tool_mode="mock"`：副作用工具返回 `SkillCase.mock_response` 或通用模拟结果，不发请求，并在 span 中标记 `simulated`。
- 轨迹判定直接读取 span（检索、模型、工具、确认、转人工），无需额外埋点。

## 8. 分期

| 阶段 | 范围 | 价值 |
|---|---|---|
| 一期 | 对比实验（模型 / 提示词变体）、重复运行、变体对比 + 按维度 + 回归明细 + 逐条对比、采用变体到草稿 | 最快回答「换模型、改提示词值不值」 |
| 二期 | LLM 评委（评分细则、人工改判、一致率）、轨迹判定、副作用工具模拟执行、Agent / Skill 变体 | 让 Agent 与「回答质量」可评测 |
| 三期 | Skill 单测、「相对基线无回归」门禁、定时回归（模型或知识库变更后自动重跑） | 持续守住线上质量 |

## 9. 原型评审路径

1. 评测 → 对比实验：四个入口卡片与实验列表（含一个运行中的实验）。
2. 打开「客服模型选型」：结论、变体对比、按维度、需要关注；点「投诉」那一行看三个模型并排对比与评委理由。
3. 打开「退款话术提示词 B 版」：整体提升但安全维度回归，筛选「回归」。
4. 打开「Agent 策略」：点「投诉还要赔偿」看执行轨迹对比（步数用尽未查订单）。
5. 新建实验：选 Agent → 配置变体 → 评测器与运行（重复次数、模拟执行、预计费用）→ 开始实验，等待完成。
6. 评测器：打开「客服回答质量」看评分细则、一致率与校准矩阵；对比「研究报告质量」一致率偏低的提示。
7. Skill 单测：打开「创建售后工单」看模拟执行与失败用例。
