export type RunStatus = 'success' | 'running' | 'partial' | 'failed' | 'timeout';
export type SpanKind = 'model' | 'knowledge' | 'tool' | 'skill' | 'harness';

export interface TraceSpan {
  id: string;
  kind: SpanKind;
  name: string;
  status: RunStatus;
  duration: string;
  startedAt: string;
  tokens?: { input: number; output: number };
  cost?: number;
  detail: string;
  request?: string;
  response?: string;
}

export interface AgentTrace {
  id: string;
  conversationId: string;
  app: string;
  version: string;
  user: string;
  channel: string;
  model: string;
  status: RunStatus;
  input: string;
  output: string;
  startedAt: string;
  durationMs: number;
  tokens: { input: number; output: number; cached: number };
  cost: number;
  toolState: 'success' | 'failed' | 'unused';
  skillState: 'success' | 'failed' | 'unused';
  context: {
    used: number;
    limit: number;
    systemPrompt: string;
    historyTurns: number;
    retrievedChunks: number;
    toolResults: number;
    truncated: boolean;
  };
  anomalies: string[];
  spans: TraceSpan[];
}

export interface BuildStage {
  name: string;
  status: RunStatus | 'waiting';
  duration: string;
  detail: string;
}

export interface BuildJob {
  id: string;
  knowledge: string;
  file: string;
  trigger: string;
  status: RunStatus;
  stage: string;
  startedAt: string;
  duration: string;
  chunks: number;
  sourceSize: string;
  error?: string;
  recommendation?: string;
  stages: BuildStage[];
}

export interface ConversationLog {
  id: string;
  app: string;
  user: string;
  channel: string;
  status: 'resolved' | 'handoff' | 'unresolved';
  turns: number;
  lastQuestion: string;
  traces: string[];
  tokens: number;
  cost: number;
  feedback: 'good' | 'bad' | 'none';
  updatedAt: string;
}

export const AGENT_TRACES: AgentTrace[] = [
  {
    id: 'tr_8f2a1c90', conversationId: 'cv_10382', app: '智能客服助手', version: 'v12', user: '张先生', channel: '企业微信', model: 'DeepSeek-V3.2', status: 'success',
    input: '帮我查一下订单 SO20261024017 到哪了',
    output: '订单 SO20261024017 已于今天 08:35 到达杭州转运中心，预计明天下午送达。物流单号为 SF1439821076。',
    startedAt: '10-28 10:36:12', durationMs: 2384, tokens: { input: 1548, output: 312, cached: 640 }, cost: 0.0186, toolState: 'success', skillState: 'unused',
    context: { used: 3820, limit: 128000, systemPrompt: '客服 Agent v12（已脱敏）', historyTurns: 2, retrievedChunks: 0, toolResults: 1, truncated: false }, anomalies: [],
    spans: [
      { id: 'sp_01', kind: 'harness', name: '请求接入与权限校验', status: 'success', duration: '32 ms', startedAt: '10:36:12.004', detail: '租户、应用版本与渠道权限校验通过。' },
      { id: 'sp_02', kind: 'model', name: '意图规划', status: 'success', duration: '686 ms', startedAt: '10:36:12.038', tokens: { input: 906, output: 118 }, cost: 0.0081, detail: '识别为订单查询，生成工具参数。', response: '{"tool":"订单查询","order_no":"SO20261024017"}' },
      { id: 'sp_03', kind: 'tool', name: '订单查询', status: 'success', duration: '421 ms', startedAt: '10:36:12.726', detail: 'ERP HTTP 工具返回 200。', request: '{"order_no":"SO20261024017"}', response: '{"status":"运输中","city":"杭州转运中心","eta":"10-29 下午"}' },
      { id: 'sp_04', kind: 'model', name: '生成最终回复', status: 'success', duration: '1.21 s', startedAt: '10:36:13.149', tokens: { input: 642, output: 194 }, cost: 0.0105, detail: '根据工具结果生成回复，未使用知识库。' },
      { id: 'sp_05', kind: 'harness', name: '输出校验', status: 'success', duration: '35 ms', startedAt: '10:36:14.361', detail: '敏感字段与禁止承诺检查通过。' },
    ],
  },
  {
    id: 'tr_9bc40271', conversationId: 'cv_10391', app: '智能客服助手', version: 'v12', user: '访客 9c1e', channel: '官网嵌入', model: 'DeepSeek-V3.2', status: 'partial',
    input: '你们和 X 品牌比哪个更便宜？能直接给我底价吗？',
    output: '不同配置与服务范围会影响报价。我无法直接提供未公开底价，已为你转接销售顾问进一步确认。',
    startedAt: '10-28 10:22:47', durationMs: 4860, tokens: { input: 1960, output: 450, cached: 0 }, cost: 0.0279, toolState: 'success', skillState: 'failed',
    context: { used: 8120, limit: 128000, systemPrompt: '客服 Agent v12（已脱敏）', historyTurns: 3, retrievedChunks: 2, toolResults: 1, truncated: false },
    anomalies: ['Skill「竞品报价边界」加载超时，已降级使用主提示词规则', '主流程成功，但策略 Skill 未执行'],
    spans: [
      { id: 'sp_11', kind: 'model', name: '意图规划', status: 'success', duration: '912 ms', startedAt: '10:22:47.006', tokens: { input: 1014, output: 204 }, cost: 0.0102, detail: '识别为竞品比较与敏感报价请求。' },
      { id: 'sp_12', kind: 'skill', name: '竞品报价边界', status: 'timeout', duration: '2.00 s', startedAt: '10:22:47.920', detail: 'Skill 运行超过 2 秒限制，Harness 触发降级。', request: 'skill://sales/competitor-pricing@2.1', response: 'TimeoutError: skill execution exceeded 2000 ms' },
      { id: 'sp_13', kind: 'knowledge', name: '销售政策检索', status: 'success', duration: '508 ms', startedAt: '10:22:49.922', detail: '混合检索 6 条，重排后使用 2 条。' },
      { id: 'sp_14', kind: 'tool', name: '转人工', status: 'success', duration: '318 ms', startedAt: '10:22:50.432', detail: '创建销售跟进请求，编号 HD-10482。' },
      { id: 'sp_15', kind: 'model', name: '生成最终回复', status: 'success', duration: '1.10 s', startedAt: '10:22:50.752', tokens: { input: 946, output: 246 }, cost: 0.0177, detail: '使用主提示词中的兜底策略生成回复。' },
    ],
  },
  {
    id: 'tr_04d7be35', conversationId: 'cv_10402', app: '行业研究报告撰写', version: 'v5', user: '战略部 · 李想', channel: '工作台', model: 'Qwen3-Max', status: 'failed',
    input: '生成 2026 年储能行业竞争格局报告，重点分析国内头部厂商。',
    output: '运行失败，未生成最终报告。已保留大纲与检索结果，可从失败节点重试。',
    startedAt: '10-28 09:58:03', durationMs: 68541, tokens: { input: 42120, output: 6090, cached: 10240 }, cost: 1.284, toolState: 'failed', skillState: 'success',
    context: { used: 126420, limit: 128000, systemPrompt: '研究报告工作流 v5（已脱敏）', historyTurns: 6, retrievedChunks: 24, toolResults: 8, truncated: true },
    anomalies: ['上下文占用 98.8%，已截断最早 2 轮对话', '联网搜索第 3 次调用返回 429', '重试 2 次后终止运行'],
    spans: [
      { id: 'sp_21', kind: 'skill', name: '研究框架生成', status: 'success', duration: '4.82 s', startedAt: '09:58:03.010', tokens: { input: 2240, output: 1032 }, cost: 0.081, detail: '生成竞争格局分析框架。' },
      { id: 'sp_22', kind: 'knowledge', name: '研究库检索', status: 'success', duration: '2.14 s', startedAt: '09:58:07.832', detail: '召回 60 条，重排后使用 24 条。' },
      { id: 'sp_23', kind: 'tool', name: '联网搜索', status: 'failed', duration: '31.9 s', startedAt: '09:58:09.974', detail: '第 3 批搜索触发提供商限流。', request: '国内储能系统集成商 2026 市占率', response: 'HTTP 429 rate_limit_exceeded; retries=2' },
      { id: 'sp_24', kind: 'harness', name: '上下文压缩', status: 'partial', duration: '6.42 s', startedAt: '09:58:41.876', tokens: { input: 19820, output: 2180 }, cost: 0.211, detail: '上下文超过 95% 阈值，压缩后仍保留 126,420 tokens。' },
      { id: 'sp_25', kind: 'model', name: '分章撰写', status: 'failed', duration: '20.2 s', startedAt: '09:58:48.298', tokens: { input: 20060, output: 2878 }, cost: 0.992, detail: '依赖搜索结果不完整，工作流在质量门禁处终止。' },
    ],
  },
  {
    id: 'tr_7a011f20', conversationId: 'cv_10407', app: '合同风险审校', version: 'v3', user: '法务部 · 王律', channel: '工作台', model: 'DeepSeek-R1', status: 'running',
    input: '审校《年度框架采购合同-华东》，重点看价格调整、违约责任和管辖法院。',
    output: '正在执行条款比对，已完成 18 / 26 个条款。',
    startedAt: '10-28 10:44:18', durationMs: 9270, tokens: { input: 12840, output: 1390, cached: 4620 }, cost: 0.316, toolState: 'unused', skillState: 'success',
    context: { used: 48200, limit: 128000, systemPrompt: '合同审校 Agent v3（已脱敏）', historyTurns: 1, retrievedChunks: 18, toolResults: 0, truncated: false }, anomalies: [],
    spans: [
      { id: 'sp_31', kind: 'skill', name: '合同结构识别', status: 'success', duration: '2.48 s', startedAt: '10:44:18.008', detail: '识别为框架采购合同，共 26 个条款。' },
      { id: 'sp_32', kind: 'knowledge', name: '法务条款库检索', status: 'success', duration: '1.92 s', startedAt: '10:44:20.490', detail: '按条款并行检索 18 组依据。' },
      { id: 'sp_33', kind: 'model', name: '逐条风险判断', status: 'running', duration: '4.87 s', startedAt: '10:44:22.412', tokens: { input: 12840, output: 1390 }, cost: 0.316, detail: '正在处理违约责任条款。' },
    ],
  },
  {
    id: 'tr_b7c2038a', conversationId: 'cv_10411', app: '制度问答助手', version: 'v8', user: '研发部 · 黄磊', channel: '工作台', model: 'DeepSeek-V3.2', status: 'success',
    input: '出差深圳住宿标准是多少？', output: '深圳属于一类城市，员工住宿标准为 500 元/晚；部门负责人为 650 元/晚。详见《差旅管理制度》第 4.2 条。',
    startedAt: '10-28 10:15:20', durationMs: 1420, tokens: { input: 812, output: 168, cached: 320 }, cost: 0.0098, toolState: 'unused', skillState: 'unused',
    context: { used: 2410, limit: 128000, systemPrompt: '制度问答 v8（已脱敏）', historyTurns: 1, retrievedChunks: 3, toolResults: 0, truncated: false }, anomalies: [],
    spans: [
      { id: 'sp_41', kind: 'knowledge', name: '制度库检索', status: 'success', duration: '384 ms', startedAt: '10:15:20.008', detail: '混合检索 8 条，重排后使用 3 条。' },
      { id: 'sp_42', kind: 'model', name: '生成回答', status: 'success', duration: '1.01 s', startedAt: '10:15:20.394', tokens: { input: 812, output: 168 }, cost: 0.0098, detail: '回答包含制度引用。' },
    ],
  },
];

export const BUILD_JOBS: BuildJob[] = [
  {
    id: 'build_24018', knowledge: '产品手册与 FAQ', file: 'ES-200_用户手册_V3.2.pdf', trigger: '文件更新', status: 'success', stage: '已完成', startedAt: '10-28 10:08', duration: '2 分 18 秒', chunks: 186, sourceSize: '18.4 MB',
    stages: [
      { name: '上传与校验', status: 'success', duration: '2.1 秒', detail: 'SHA-256 校验通过，未发现重复文件。' },
      { name: '解析与 OCR', status: 'success', duration: '42.8 秒', detail: 'PDF 84 页；12 页启用 OCR；平均置信度 96.2%。' },
      { name: '元数据抽取', status: 'success', duration: '11.4 秒', detail: '抽取产品型号、版本、发布日期等 8 个字段。' },
      { name: '分块', status: 'success', duration: '8.6 秒', detail: '按标题层级生成 186 个分块，平均 428 tokens。' },
      { name: 'Embedding', status: 'success', duration: '58.2 秒', detail: 'bge-m3 生成 186 个向量，1024 维。' },
      { name: '索引发布', status: 'success', duration: '15.1 秒', detail: '新索引发布成功，旧索引保留 24 小时。' },
    ],
  },
  {
    id: 'build_24017', knowledge: '行业研究资料库', file: '2026_储能行业月报_10月.docx', trigger: '手动导入', status: 'failed', stage: 'Embedding', startedAt: '10-28 09:42', duration: '1 分 46 秒', chunks: 248, sourceSize: '6.7 MB',
    error: 'Embedding 提供商连续 3 次返回 HTTP 429，已停止任务。', recommendation: '等待限流窗口恢复后重试失败步骤；不需要重新解析和分块。',
    stages: [
      { name: '上传与校验', status: 'success', duration: '1.4 秒', detail: '文件校验通过。' },
      { name: '解析与 OCR', status: 'success', duration: '18.7 秒', detail: 'DOCX 解析出 214 个段落、9 张图片。' },
      { name: '元数据抽取', status: 'success', duration: '9.2 秒', detail: '抽取行业、报告期、来源机构等 6 个字段。' },
      { name: '分块', status: 'success', duration: '12.9 秒', detail: '语义分块生成 248 个分块。' },
      { name: 'Embedding', status: 'failed', duration: '1 分 04 秒', detail: 'text-embedding-v4 返回 HTTP 429，重试 3 次后失败。' },
      { name: '索引发布', status: 'waiting', duration: '—', detail: '等待 Embedding 完成。' },
    ],
  },
  {
    id: 'build_24016', knowledge: '法务条款库', file: '标准采购合同模板_2026版.docx', trigger: '定时同步', status: 'partial', stage: '索引发布', startedAt: '10-28 08:30', duration: '3 分 04 秒', chunks: 92, sourceSize: '1.9 MB',
    error: '3 个分块因元数据缺少“条款类型”未进入线上索引。', recommendation: '补充元数据后仅重建 3 个失败分块。',
    stages: [
      { name: '上传与校验', status: 'success', duration: '1.2 秒', detail: '文件校验通过。' },
      { name: '解析与 OCR', status: 'success', duration: '12.4 秒', detail: 'DOCX 解析成功。' },
      { name: '元数据抽取', status: 'partial', duration: '28.7 秒', detail: '89 / 92 个条款识别到条款类型。' },
      { name: '分块', status: 'success', duration: '7.8 秒', detail: '按合同条款生成 92 个分块。' },
      { name: 'Embedding', status: 'success', duration: '1 分 38 秒', detail: '生成 92 个向量。' },
      { name: '索引发布', status: 'partial', duration: '35.6 秒', detail: '发布 89 个分块，隔离 3 个异常分块。' },
    ],
  },
  {
    id: 'build_24015', knowledge: '公司制度库', file: '差旅管理制度_2026.pdf', trigger: '文件更新', status: 'running', stage: 'Embedding', startedAt: '10-28 10:43', duration: '1 分 02 秒', chunks: 74, sourceSize: '3.1 MB',
    stages: [
      { name: '上传与校验', status: 'success', duration: '1.6 秒', detail: '文件校验通过。' },
      { name: '解析与 OCR', status: 'success', duration: '18.3 秒', detail: 'PDF 31 页，无需 OCR。' },
      { name: '元数据抽取', status: 'success', duration: '7.8 秒', detail: '抽取制度编号、生效日期、适用部门。' },
      { name: '分块', status: 'success', duration: '6.9 秒', detail: '按标题层级生成 74 个分块。' },
      { name: 'Embedding', status: 'running', duration: '27.4 秒', detail: '已生成 52 / 74 个向量。' },
      { name: '索引发布', status: 'waiting', duration: '—', detail: '等待 Embedding 完成。' },
    ],
  },
];

export const CONVERSATIONS: ConversationLog[] = [
  { id: 'cv_10382', app: '智能客服助手', user: '张先生', channel: '企业微信', status: 'resolved', turns: 2, lastQuestion: '帮我查一下订单 SO20261024017 到哪了', traces: ['tr_8f2a1c90'], tokens: 1860, cost: 0.0186, feedback: 'none', updatedAt: '10:36' },
  { id: 'cv_10391', app: '智能客服助手', user: '访客 9c1e', channel: '官网嵌入', status: 'handoff', turns: 3, lastQuestion: '你们和 X 品牌比哪个更便宜？', traces: ['tr_9bc40271'], tokens: 2410, cost: 0.0279, feedback: 'bad', updatedAt: '10:22' },
  { id: 'cv_10402', app: '行业研究报告撰写', user: '战略部 · 李想', channel: '工作台', status: 'unresolved', turns: 6, lastQuestion: '生成 2026 年储能行业竞争格局报告', traces: ['tr_04d7be35'], tokens: 48210, cost: 1.284, feedback: 'none', updatedAt: '09:58' },
  { id: 'cv_10407', app: '合同风险审校', user: '法务部 · 王律', channel: '工作台', status: 'unresolved', turns: 1, lastQuestion: '审校《年度框架采购合同-华东》', traces: ['tr_7a011f20'], tokens: 14230, cost: 0.316, feedback: 'none', updatedAt: '运行中' },
  { id: 'cv_10411', app: '制度问答助手', user: '研发部 · 黄磊', channel: '工作台', status: 'resolved', turns: 1, lastQuestion: '出差深圳住宿标准是多少？', traces: ['tr_b7c2038a'], tokens: 980, cost: 0.0098, feedback: 'good', updatedAt: '10:15' },
];

export const COST_BY_APP = [
  { name: '行业研究报告撰写', calls: 312, input: 6840000, output: 1410000, cached: 2240000, cost: 1284.26, share: 42 },
  { name: '智能客服助手', calls: 8642, input: 12480000, output: 3160000, cached: 4830000, cost: 862.48, share: 28 },
  { name: '合同风险审校', calls: 128, input: 3980000, output: 840000, cached: 1120000, cost: 532.14, share: 17 },
  { name: '制度问答助手', calls: 1904, input: 2640000, output: 582000, cached: 980000, cost: 248.72, share: 8 },
  { name: '其他应用', calls: 719, input: 1230000, output: 284000, cached: 320000, cost: 142.30, share: 5 },
];

export const COST_BY_MODEL = [
  { name: 'Qwen3-Max', provider: '通义千问', input: 11320000, output: 2460000, cached: 2880000, cost: 1368.42, priceVersion: '2026-10-01' },
  { name: 'DeepSeek-V3.2', provider: 'DeepSeek', input: 15460000, output: 3682000, cached: 6130000, cost: 1011.20, priceVersion: '2026-10-12' },
  { name: 'DeepSeek-R1', provider: 'DeepSeek', input: 3980000, output: 840000, cached: 1120000, cost: 532.14, priceVersion: '2026-10-12' },
  { name: 'text-embedding-v4', provider: '通义千问', input: 1410000, output: 0, cached: 0, cost: 96.80, priceVersion: '2026-09-20' },
  { name: 'bge-m3', provider: '本地部署', input: 0, output: 0, cached: 0, cost: 61.34, priceVersion: '内部算力 2026-Q4' },
];

export const DAILY_COST = [
  { day: '10-22', value: 352 }, { day: '10-23', value: 396 }, { day: '10-24', value: 421 }, { day: '10-25', value: 384 },
  { day: '10-26', value: 408 }, { day: '10-27', value: 475 }, { day: '10-28', value: 632 },
];
