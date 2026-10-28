import {
  Activity, AlertTriangle, ArrowRight, Bot, Braces, CheckCircle2, ChevronRight, CircleDollarSign, ClipboardCheck, Clock3,
  Database, Eye, FileWarning, Gauge, Layers3, MessageSquareText, PlayCircle, RefreshCw, Search, ShieldAlert,
  Sparkles, ThumbsDown, ThumbsUp, Wrench, XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Dev, Drawer, Field, Modal, Tag, useToast } from '../components/ui';
import { addConversationsToEvaluationSet, getEvaluationState, type CaseType } from '../data/evaluation';
import {
  AGENT_TRACES, BUILD_JOBS, CONVERSATIONS, COST_BY_APP, COST_BY_MODEL, DAILY_COST,
  type AgentTrace, type BuildJob, type ConversationLog, type RunStatus, type SpanKind, type TraceSpan,
} from '../data/observability';

type ViewKey = 'overview' | 'knowledge' | 'agents' | 'conversations' | 'billing';

const VIEWS: { key: ViewKey; name: string; icon: typeof Activity }[] = [
  { key: 'overview', name: '总览', icon: Activity },
  { key: 'knowledge', name: '知识构建', icon: Database },
  { key: 'agents', name: 'Agent 运行', icon: Bot },
  { key: 'conversations', name: '对话日志', icon: MessageSquareText },
  { key: 'billing', name: '用量与费用', icon: CircleDollarSign },
];

const STATUS_META: Record<RunStatus, { text: string; tone: string }> = {
  success: { text: '成功', tone: 'green' },
  running: { text: '运行中', tone: 'blue' },
  partial: { text: '部分成功', tone: 'orange' },
  failed: { text: '失败', tone: 'red' },
  timeout: { text: '超时', tone: 'red' },
};

const SPAN_META: Record<SpanKind, { text: string; icon: typeof Activity; tone: string }> = {
  model: { text: '模型', icon: Sparkles, tone: 'purple' },
  knowledge: { text: '知识检索', icon: Database, tone: 'blue' },
  tool: { text: '工具', icon: Wrench, tone: 'teal' },
  skill: { text: 'Skill', icon: Braces, tone: 'orange' },
  harness: { text: 'Harness', icon: ShieldAlert, tone: '' },
};

function StatusTag({ status }: { status: RunStatus }) {
  const meta = STATUS_META[status];
  return <Tag tone={meta.tone}><span className="dot" />{meta.text}</Tag>;
}

function formatTokens(n: number) {
  return n >= 1000000 ? `${(n / 1000000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString();
}

function money(n: number) {
  return `¥${n < 10 ? n.toFixed(4) : n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function RunState({ state, label }: { state: AgentTrace['toolState']; label: string }) {
  if (state === 'unused') return <span className="faint">未调用</span>;
  return <Tag tone={state === 'success' ? 'green' : 'red'}>{state === 'success' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}{label}{state === 'success' ? '成功' : '失败'}</Tag>;
}

export function ObservabilityPage() {
  const [params, setParams] = useSearchParams();
  const rawView = params.get('view') as ViewKey | null;
  const view = VIEWS.some((item) => item.key === rawView) ? rawView! : 'overview';
  const [trace, setTrace] = useState<AgentTrace | null>(null);
  const [job, setJob] = useState<BuildJob | null>(null);
  const [conversation, setConversation] = useState<ConversationLog | null>(null);
  const [caseReturn, setCaseReturn] = useState<{ trace: AgentTrace; type: CaseType } | null>(null);

  const setView = (next: ViewKey) => setParams(next === 'overview' ? {} : { view: next });
  const openTraceById = (id: string) => {
    const found = AGENT_TRACES.find((item) => item.id === id);
    if (found) {
      setConversation(null);
      setTrace(found);
    }
  };
  const startCaseReturn = (target: AgentTrace, type: CaseType) => {
    setTrace(null);
    setConversation(null);
    setCaseReturn({ trace: target, type });
  };

  return (
    <div className="observability-layout">
      <header className="observability-head">
        <div className="grow">
          <div className="row" style={{ gap: 9 }}><h1>可观测</h1><Tag tone="orange">原型演示数据</Tag><Dev s="todo" note="需要统一 Trace 与计费事件模型" /></div>
          <p>从业务异常下钻到单次 Trace，定位知识构建、模型、工具、Skill、上下文和费用问题。</p>
        </div>
        <select className="select sm" style={{ width: 160 }} aria-label="环境"><option>生产环境</option><option>测试环境</option></select>
        <select className="select sm" style={{ width: 160 }} aria-label="应用"><option>全部应用</option><option>智能客服助手</option><option>行业研究报告撰写</option></select>
        <select className="select sm" style={{ width: 130 }} aria-label="时间范围"><option>最近 24 小时</option><option>最近 7 天</option><option>最近 30 天</option></select>
      </header>

      <nav className="observability-tabs" aria-label="可观测视图">
        {VIEWS.map(({ key, name, icon: Icon }) => (
          <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>
            <Icon size={15} />{name}
          </button>
        ))}
      </nav>

      <div className="observability-content">
        {view === 'overview' ? <OverviewView setView={setView} onTrace={setTrace} onJob={setJob} /> : null}
        {view === 'knowledge' ? <KnowledgeView onOpen={setJob} /> : null}
        {view === 'agents' ? <AgentRunsView onOpen={setTrace} /> : null}
        {view === 'conversations' ? <ConversationsView onOpen={setConversation} /> : null}
        {view === 'billing' ? <BillingView /> : null}
      </div>

      <TraceDrawer key={trace?.id ?? 'closed'} trace={trace} onClose={() => setTrace(null)} onReturnCase={startCaseReturn} />
      <BuildDrawer job={job} onClose={() => setJob(null)} />
      <ConversationDrawer conversation={conversation} onClose={() => setConversation(null)} onTrace={openTraceById} onReturnCase={startCaseReturn} />
      <CaseReturnModal key={caseReturn ? `${caseReturn.trace.id}-${caseReturn.type}` : 'closed'} value={caseReturn} onClose={() => setCaseReturn(null)} />
    </div>
  );
}

function OverviewView({ setView, onTrace, onJob }: { setView: (view: ViewKey) => void; onTrace: (trace: AgentTrace) => void; onJob: (job: BuildJob) => void }) {
  const latest = AGENT_TRACES.slice(0, 5);
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="grid observability-stats">
        {[
          { icon: CheckCircle2, label: '运行成功率', value: '97.6%', meta: '较昨日 -0.8pt', tone: 'warn' },
          { icon: Gauge, label: 'P95 延迟', value: '4.82s', meta: '目标 < 5s', tone: 'ok' },
          { icon: AlertTriangle, label: '异常运行', value: '18', meta: '失败 7 · 部分成功 11', tone: 'bad' },
          { icon: CircleDollarSign, label: '今日费用', value: '¥632.14', meta: '较 7 日均值 +38%', tone: 'warn' },
          { icon: Layers3, label: '知识构建成功率', value: '94.1%', meta: '1 个失败 · 1 个部分成功', tone: 'warn' },
        ].map(({ icon: Icon, label, value, meta, tone }) => (
          <div className="card stat" key={label}>
            <div className="label"><Icon size={15} />{label}</div>
            <div className="value">{value}</div>
            <div className={`observability-meta ${tone}`}>{meta}</div>
          </div>
        ))}
      </div>

      <div className="grid observability-main-grid">
        <section className="card pad">
          <div className="row section-row"><div><strong>需要处理</strong><div className="faint">按对业务和费用的影响排序</div></div><span className="grow" /><button className="btn sm ghost" onClick={() => setView('agents')}>查看全部<ArrowRight size={13} /></button></div>
          <button className="incident-row high" onClick={() => onTrace(AGENT_TRACES[2])}>
            <span className="incident-icon"><XCircle size={17} /></span>
            <span className="grow"><strong>行业报告运行失败</strong><small>联网搜索限流，重试后在质量门禁终止</small></span>
            <span><Tag tone="red">影响 1 次运行</Tag><small>{money(1.284)} 已消耗</small></span><ChevronRight size={16} />
          </button>
          <button className="incident-row medium" onClick={() => onJob(BUILD_JOBS[1])}>
            <span className="incident-icon"><FileWarning size={17} /></span>
            <span className="grow"><strong>知识构建卡在 Embedding</strong><small>提供商连续返回 429，可从失败步骤重试</small></span>
            <span><Tag tone="orange">248 个分块</Tag><small>09:42 开始</small></span><ChevronRight size={16} />
          </button>
          <button className="incident-row medium" onClick={() => onTrace(AGENT_TRACES[1])}>
            <span className="incident-icon"><Braces size={17} /></span>
            <span className="grow"><strong>策略 Skill 加载超时</strong><small>已降级使用主提示词，最终回复成功</small></span>
            <span><Tag tone="orange">部分成功</Tag><small>需检查 Skill</small></span><ChevronRight size={16} />
          </button>
        </section>

        <section className="card pad">
          <div className="row section-row"><div><strong>运行状态分布</strong><div className="faint">最近 24 小时 · 12,408 次</div></div></div>
          <div className="status-donut" aria-label="成功 97.6%，部分成功 1.5%，失败 0.6%，运行中 0.3%">
            <div><strong>97.6%</strong><span>成功</span></div>
          </div>
          <div className="legend-grid">
            <span><i className="green" />成功 <strong>12,110</strong></span>
            <span><i className="orange" />部分成功 <strong>183</strong></span>
            <span><i className="red" />失败/超时 <strong>78</strong></span>
            <span><i className="blue" />运行中 <strong>37</strong></span>
          </div>
        </section>
      </div>

      <section className="card pad">
        <div className="row section-row"><div><strong>最近 Trace</strong><div className="faint">一次输入到最终输出的完整调用链</div></div><span className="grow" /><button className="btn sm ghost" onClick={() => setView('agents')}>查看 Agent 运行<ArrowRight size={13} /></button></div>
        <TraceTable traces={latest} onOpen={onTrace} compact />
      </section>
    </div>
  );
}

function TraceTable({ traces, onOpen, compact = false }: { traces: AgentTrace[]; onOpen: (trace: AgentTrace) => void; compact?: boolean }) {
  return (
    <div className="table-scroll">
      <table className="table observability-table">
        <thead><tr><th>输入</th><th>应用</th><th>状态</th><th>耗时</th><th>工具</th><th>Skill</th><th>Tokens</th><th>费用</th><th>时间</th></tr></thead>
        <tbody>{traces.map((item) => (
          <tr key={item.id} className="clickable" onClick={() => onOpen(item)}>
            <td><div className="trace-primary ellipsis">{item.input}</div><code>{item.id}</code></td>
            <td>{item.app}<div className="faint">{item.version} · {item.channel}</div></td>
            <td><StatusTag status={item.status} /></td>
            <td>{item.durationMs >= 1000 ? `${(item.durationMs / 1000).toFixed(2)}s` : `${item.durationMs}ms`}</td>
            <td><RunState state={item.toolState} label="工具" /></td>
            <td><RunState state={item.skillState} label="Skill" /></td>
            <td>{formatTokens(item.tokens.input + item.tokens.output)}{!compact && item.tokens.cached ? <div className="faint">缓存 {formatTokens(item.tokens.cached)}</div> : null}</td>
            <td>{money(item.cost)}</td>
            <td className="faint">{item.startedAt}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function KnowledgeView({ onOpen }: { onOpen: (job: BuildJob) => void }) {
  const [filter, setFilter] = useState<'all' | 'issues'>('all');
  const jobs = filter === 'issues' ? BUILD_JOBS.filter((item) => ['failed', 'partial'].includes(item.status)) : BUILD_JOBS;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="view-title"><div><h2>知识库构建过程</h2><p>按文件追踪解析、OCR、元数据、分块、Embedding 与索引发布。</p></div><span className="grow" /><button className="btn"><RefreshCw size={14} />刷新</button></div>
      <div className="grid c4">
        <div className="card stat"><div className="label">今日构建任务</div><div className="value">34</div><div className="observability-meta ok">31 个已完成</div></div>
        <div className="card stat"><div className="label">平均构建耗时</div><div className="value">2m 14s</div><div className="observability-meta ok">较昨日 -18s</div></div>
        <div className="card stat"><div className="label">待索引分块</div><div className="value">270</div><div className="observability-meta warn">2 个任务等待中</div></div>
        <div className="card stat"><div className="label">失败 / 部分成功</div><div className="value">2</div><div className="observability-meta bad">需要处理</div></div>
      </div>
      <div className="row filter-bar">
        <div className="seg"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部任务</button><button className={filter === 'issues' ? 'active' : ''} onClick={() => setFilter('issues')}>仅异常</button></div>
        <select className="select sm" style={{ width: 150 }}><option>全部知识库</option><option>产品手册与 FAQ</option><option>行业研究资料库</option></select>
        <select className="select sm" style={{ width: 130 }}><option>全部触发方式</option><option>手动导入</option><option>文件更新</option><option>定时同步</option></select>
        <span className="grow" />
        <div className="search-box" style={{ width: 240 }}><Search size={15} /><input className="input sm" placeholder="搜索文件或任务 ID" /></div>
      </div>
      <div className="card table-card table-scroll">
        <table className="table observability-table">
          <thead><tr><th>文件 / 任务</th><th>知识库</th><th>触发方式</th><th>状态</th><th>当前阶段</th><th>分块</th><th>耗时</th><th>开始时间</th></tr></thead>
          <tbody>{jobs.map((item) => (
            <tr key={item.id} className="clickable" onClick={() => onOpen(item)}>
              <td><div className="trace-primary">{item.file}</div><code>{item.id}</code></td><td>{item.knowledge}</td><td>{item.trigger}</td><td><StatusTag status={item.status} /></td>
              <td>{item.stage}</td><td>{item.chunks}</td><td>{item.duration}</td><td className="faint">{item.startedAt}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function AgentRunsView({ onOpen }: { onOpen: (trace: AgentTrace) => void }) {
  const [filter, setFilter] = useState<'all' | 'issues'>('all');
  const traces = filter === 'issues' ? AGENT_TRACES.filter((item) => !['success', 'running'].includes(item.status)) : AGENT_TRACES;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="view-title"><div><h2>Agent 运行</h2><p>以单次输入输出为单位查看模型、工具、Skill、上下文、Token 与 Harness 状态。</p></div><span className="grow" /><button className="btn"><Eye size={14} />字段脱敏规则</button></div>
      <div className="row filter-bar wrap">
        <div className="seg"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部运行</button><button className={filter === 'issues' ? 'active' : ''} onClick={() => setFilter('issues')}>仅异常</button></div>
        <select className="select sm" style={{ width: 160 }}><option>全部应用</option><option>智能客服助手</option><option>行业研究报告撰写</option></select>
        <select className="select sm" style={{ width: 140 }}><option>全部状态</option><option>运行中</option><option>成功</option><option>部分成功</option><option>失败</option></select>
        <select className="select sm" style={{ width: 150 }}><option>全部调用类型</option><option>工具异常</option><option>Skill 异常</option><option>Harness 异常</option></select>
        <span className="grow" />
        <div className="search-box" style={{ width: 250 }}><Search size={15} /><input className="input sm" placeholder="搜索输入、Trace ID 或用户" /></div>
      </div>
      <div className="card table-card"><TraceTable traces={traces} onOpen={onOpen} /></div>
    </div>
  );
}

function ConversationsView({ onOpen }: { onOpen: (conversation: ConversationLog) => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [returning, setReturning] = useState(false);
  const [caseType, setCaseType] = useState<CaseType>('bad');
  const [targetSet, setTargetSet] = useState(() => getEvaluationState().sets[0]?.id ?? '');
  const [standard, setStandard] = useState('');
  const [tagText, setTagText] = useState('线上回流');
  const sets = getEvaluationState().sets;
  const toggle = (id: string) => setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const toggleAll = () => setSelected(selected.length === CONVERSATIONS.length ? [] : CONVERSATIONS.map((item) => item.id));
  const submit = () => {
    const tags = tagText.split(/[，,]/).map((item) => item.trim()).filter(Boolean);
    const result = addConversationsToEvaluationSet(selected, targetSet, caseType, standard, tags);
    setReturning(false);
    setSelected([]);
    setStandard('');
    toast(result.added ? `已回流 ${result.added} 条 Case${result.duplicates ? `，跳过 ${result.duplicates} 条重复 Trace` : ''}` : `没有新增 Case，${result.duplicates} 条 Trace 已存在`);
  };
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="view-title"><div><h2>对话日志</h2><p>按会话查看多轮消息、反馈与累计消耗；勾选真实日志可回流为 Good / Bad Case。</p></div><span className="grow" /><button className="btn" onClick={() => navigate('/evaluation-sets')}><ClipboardCheck size={14} />查看评测集</button></div>
      <div className="row filter-bar wrap">
        <div className="seg"><button className="active">全部会话</button><button>差评</button><button>转人工</button><button>未解决</button></div>
        <select className="select sm" style={{ width: 150 }}><option>全部渠道</option><option>工作台</option><option>官网嵌入</option><option>企业微信</option></select>
        <span className="grow" /><div className="search-box" style={{ width: 250 }}><Search size={15} /><input className="input sm" placeholder="搜索问题、用户或会话 ID" /></div>
      </div>
      {selected.length ? <div className="eval-batch-bar"><span>已选择 <strong>{selected.length}</strong> 条线上会话</span><button className="btn sm primary" onClick={() => setReturning(true)}><ArrowRight size={13} />回流到评测集</button><button className="btn sm ghost" onClick={() => setSelected([])}>取消选择</button></div> : null}
      <div className="card table-card table-scroll">
        <table className="table observability-table">
          <thead><tr><th><input type="checkbox" aria-label="选择全部会话" checked={selected.length === CONVERSATIONS.length} onChange={toggleAll} /></th><th>最近问题 / 会话</th><th>应用</th><th>用户</th><th>渠道</th><th>轮次</th><th>结果</th><th>Tokens</th><th>累计费用</th><th>反馈</th><th>更新时间</th></tr></thead>
          <tbody>{CONVERSATIONS.map((item) => (
            <tr key={item.id} className="clickable" onClick={() => onOpen(item)}>
              <td onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`选择 ${item.lastQuestion}`} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></td>
              <td><div className="trace-primary ellipsis">{item.lastQuestion}</div><code>{item.id}</code></td><td>{item.app}</td><td>{item.user}</td><td><Tag>{item.channel}</Tag></td><td>{item.turns}</td>
              <td><Tag tone={item.status === 'resolved' ? 'green' : item.status === 'handoff' ? 'orange' : 'red'}>{item.status === 'resolved' ? '已解决' : item.status === 'handoff' ? '转人工' : '未解决'}</Tag></td>
              <td>{formatTokens(item.tokens)}</td><td>{money(item.cost)}</td><td>{item.feedback === 'good' ? <Tag tone="green">好评</Tag> : item.feedback === 'bad' ? <Tag tone="red">差评</Tag> : <span className="faint">—</span>}</td><td className="faint">{item.updatedAt}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Modal open={returning} title={`回流 ${selected.length} 条线上 Case`} onClose={() => setReturning(false)} footer={<><button className="btn" onClick={() => setReturning(false)}>取消</button><button className="btn primary" disabled={!targetSet} onClick={submit}>确认回流</button></>}>
        <div className="case-type-picker">
          <button className={caseType === 'good' ? 'active good' : ''} onClick={() => setCaseType('good')}><ThumbsUp size={18} /><span><strong>Good Case</strong><small>线上结果已人工确认，可作为参考答案</small></span></button>
          <button className={caseType === 'bad' ? 'active bad' : ''} onClick={() => setCaseType('bad')}><ThumbsDown size={18} /><span><strong>Bad Case</strong><small>线上结果存在问题，需要补充期望标准</small></span></button>
        </div>
        <Field label="目标评测集" required><select className="select" value={targetSet} onChange={(event) => setTargetSet(event.target.value)}>{sets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}</select></Field>
        <Field label={caseType === 'good' ? '保持项 / 备注' : '期望结果或判定规则'} hint={caseType === 'bad' ? '可稍后补充' : undefined}><textarea className="textarea" value={standard} onChange={(event) => setStandard(event.target.value)} placeholder={caseType === 'good' ? '不填则使用已验证的线上回答作为参考' : '例如：工具失败时必须转人工，不得给出估算结果'} /></Field>
        <Field label="标签" hint="逗号分隔"><input className="input" value={tagText} onChange={(event) => setTagText(event.target.value)} /></Field>
        {caseType === 'bad' && !standard.trim() ? <div className="notice warn"><ShieldAlert size={16} /><span>未填写评测标准的 Bad Case 会进入“待补标准”，不会直接参与自动评测。</span></div> : null}
      </Modal>
    </div>
  );
}

function BillingView() {
  const [dimension, setDimension] = useState<'app' | 'model'>('app');
  const maxCost = Math.max(...DAILY_COST.map((item) => item.value));
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="view-title"><div><h2>用量与费用</h2><p>费用按调用时价格快照估算，用于归因和预算预警；供应商账单同步后再做最终对账。</p></div><span className="grow" /><Tag tone="orange">账单未同步 · 估算值</Tag></div>
      <div className="grid c4">
        <div className="card stat"><div className="label">本月估算费用</div><div className="value">¥3,069.90</div><div className="observability-meta warn">预算 ¥4,000 · 已用 76.7%</div></div>
        <div className="card stat"><div className="label">输入 Tokens</div><div className="value">27.2M</div><div className="observability-meta ok">其中缓存命中 9.5M</div></div>
        <div className="card stat"><div className="label">输出 Tokens</div><div className="value">6.28M</div><div className="observability-meta warn">较上月 +24%</div></div>
        <div className="card stat"><div className="label">月底预测</div><div className="value">¥4,380</div><div className="observability-meta bad">预计超预算 9.5%</div></div>
      </div>
      <div className="grid observability-main-grid">
        <section className="card pad">
          <div className="row section-row"><div><strong>每日费用</strong><div className="faint">人民币 · 按价格快照估算</div></div><span className="grow" /><Tag tone="red">10-28 较均值 +38%</Tag></div>
          <div className="cost-chart">
            {DAILY_COST.map((item) => <div key={item.day} className="cost-bar-wrap"><span>{money(item.value)}</span><i style={{ height: `${(item.value / maxCost) * 100}%` }} /><small>{item.day}</small></div>)}
          </div>
        </section>
        <section className="card pad budget-card">
          <div className="row section-row"><div><strong>月度预算</strong><div className="faint">2026 年 10 月</div></div><span className="grow" /><button className="btn sm">设置预算</button></div>
          <div className="budget-number"><strong>¥3,069.90</strong><span>/ ¥4,000</span></div>
          <div className="progress budget-progress"><i style={{ width: '76.7%' }} /></div>
          <div className="budget-thresholds"><span>60% 提醒</span><span>80% 告警</span><span>100% 阻断可选</span></div>
          <div className="notice warn"><AlertTriangle size={16} /><span>按当前趋势，预计 10 月 30 日达到 80% 告警线。</span></div>
        </section>
      </div>
      <section className="card pad">
        <div className="row section-row"><div><strong>费用归因</strong><div className="faint">点击行后可继续下钻到 Trace 级明细</div></div><span className="grow" /><div className="seg"><button className={dimension === 'app' ? 'active' : ''} onClick={() => setDimension('app')}>按应用</button><button className={dimension === 'model' ? 'active' : ''} onClick={() => setDimension('model')}>按模型</button></div></div>
        <div className="table-scroll">
          {dimension === 'app' ? (
            <table className="table observability-table"><thead><tr><th>应用</th><th>调用次数</th><th>输入 Tokens</th><th>输出 Tokens</th><th>缓存命中</th><th>费用</th><th>占比</th></tr></thead><tbody>
              {COST_BY_APP.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td><td>{item.calls.toLocaleString()}</td><td>{formatTokens(item.input)}</td><td>{formatTokens(item.output)}</td><td>{formatTokens(item.cached)}</td><td>{money(item.cost)}</td><td><div className="share-cell"><span style={{ width: `${item.share}%` }} />{item.share}%</div></td></tr>)}
            </tbody></table>
          ) : (
            <table className="table observability-table"><thead><tr><th>模型</th><th>提供商</th><th>输入 Tokens</th><th>输出 Tokens</th><th>缓存命中</th><th>费用</th><th>价格版本</th></tr></thead><tbody>
              {COST_BY_MODEL.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td><td>{item.provider}</td><td>{formatTokens(item.input)}</td><td>{formatTokens(item.output)}</td><td>{formatTokens(item.cached)}</td><td>{money(item.cost)}</td><td><Tag>{item.priceVersion}</Tag></td></tr>)}
            </tbody></table>
          )}
        </div>
      </section>
    </div>
  );
}

function explicitPlan(trace: AgentTrace) {
  if (trace.app === '行业研究报告撰写') return {
    objective: '生成有来源支撑的竞争格局报告；资料不完整时不得输出确定性结论。',
    basis: '这是 Agent 显式写入 Trace 的计划与停止条件，不是模型不可见的内部思维。',
    steps: ['调用「研究框架生成」Skill 产出章节结构', '从研究资料库召回并重排证据', '联网补充厂商与市场数据', '压缩上下文后按章节撰写', '执行来源完整性门禁，通过后输出报告'],
  };
  if (trace.app === '智能客服助手') return {
    objective: '识别用户意图，优先使用授权工具或知识回答，必要时转人工。',
    basis: '计划由 Agent 运行时显式生成并持久化；节点执行后以 Observation 更新后续动作。',
    steps: ['识别问题类型与风险级别', trace.toolState !== 'unused' ? '调用业务工具获取实时结果' : '检索授权知识库', '校验工具或知识结果', '生成回复并执行敏感信息检查'],
  };
  return {
    objective: `完成「${trace.input}」并在质量门禁前保留可追溯证据。`,
    basis: '仅展示可审计的显式计划、动作和观察结果。',
    steps: trace.spans.map((span) => span.name),
  };
}

function contextPayload(trace: AgentTrace) {
  return `<system>\n你是「${trace.app}」${trace.version}。只能使用当前租户授权的知识、工具与 Skill；事实结论必须保留来源；工具失败时说明边界并按策略降级。\n</system>\n\n<context>\nconversation_id: ${trace.conversationId}\nhistory_turns: ${trace.context.historyTurns}\nretrieved_chunks: ${trace.context.retrievedChunks}\ntool_results: ${trace.context.toolResults}\ncontext_tokens: ${trace.context.used} / ${trace.context.limit}\ntruncated: ${trace.context.truncated}\n</context>\n\n<user>\n${trace.input}\n</user>`;
}

function runtimeCode(span: TraceSpan, trace: AgentTrace) {
  if (span.kind === 'tool') return `const observation = await toolRegistry.call({\n  traceId: "${trace.id}",\n  tool: "${span.name}",\n  arguments: ${span.request ?? '{ /* 由上一步模型输出并通过 Schema 校验 */ }'},\n  timeoutMs: 10_000,\n});\ntrace.recordObservation("${span.id}", observation);`;
  if (span.kind === 'skill') return `const skill = await skillRegistry.load("${span.request ?? span.name}");\nconst result = await skill.execute({\n  traceId: "${trace.id}",\n  context: assembledContext,\n  abortSignal,\n});\ntrace.recordSkillResult("${span.id}", result);`;
  if (span.kind === 'knowledge') return `const hits = await retrieval.search({\n  query: userInput,\n  mode: "hybrid",\n  topK: 6,\n  rerankTopN: ${trace.context.retrievedChunks || 2},\n});\nassembledContext.add(hits);`;
  if (span.kind === 'model') return `const completion = await model.generate({\n  model: "${trace.model}",\n  messages: assembledContext.messages,\n  tools: authorizedTools,\n  responseFormat: "traceable_json",\n});\ntrace.recordModelOutput("${span.id}", completion);`;
  return `await harness.runGuard({\n  traceId: "${trace.id}",\n  stage: "${span.name}",\n  contextTokens: ${trace.context.used},\n  contextLimit: ${trace.context.limit},\n  retryPolicy: { maxAttempts: 3, backoff: "exponential" },\n});`;
}

function codeExplanation(span: TraceSpan) {
  const common = `最后一行把结果写回 ${span.id}，后续节点和审计页面读取的是同一条记录。`;
  if (span.kind === 'tool') return ['从工具注册表按名称调用，不允许模型直接访问外部系统。', 'arguments 是经过 Schema 校验的真实调用参数；timeoutMs 控制单次等待上限。', common];
  if (span.kind === 'skill') return ['先按版本加载 Skill，再传入本次 Trace 的上下文与取消信号。', 'Skill 超时、加载失败或权限不符时由 Harness 决定重试或降级。', common];
  if (span.kind === 'knowledge') return ['hybrid 表示同时使用语义与全文检索。', 'topK 是初召回数量，rerankTopN 是重排后真正放入模型上下文的数量。', common];
  if (span.kind === 'model') return ['messages 是本次真实组装后的上下文，不只是用户最后一句输入。', 'authorizedTools 限定当前模型可以调用的工具集合。', 'traceable_json 要求模型返回可解析的计划、动作或最终答案结构。', common];
  return ['Harness 在节点前后执行权限、Token、超时、重试和输出校验。', '达到阈值时会生成异常事件，并决定继续、降级或终止。', common];
}

function TraceDrawer({ trace, onClose, onReturnCase }: { trace: AgentTrace | null; onClose: () => void; onReturnCase: (trace: AgentTrace, type: CaseType) => void }) {
  if (!trace) return null;
  const contextPct = (trace.context.used / trace.context.limit) * 100;
  const plan = explicitPlan(trace);
  return (
    <Drawer wide open title={<div className="row"><StatusTag status={trace.status} /><span>Trace 详情</span><code>{trace.id}</code></div>} onClose={onClose}>
      <div className="trace-drawer">
        <div className="trace-summary-grid">
          <div><span>应用 / 版本</span><strong>{trace.app} · {trace.version}</strong></div>
          <div><span>模型</span><strong>{trace.model}</strong></div>
          <div><span>耗时</span><strong>{(trace.durationMs / 1000).toFixed(2)}s</strong></div>
          <div><span>Token / 费用</span><strong>{formatTokens(trace.tokens.input + trace.tokens.output)} · {money(trace.cost)}</strong></div>
          <div><span>用户 / 渠道</span><strong>{trace.user} · {trace.channel}</strong></div>
          <div><span>会话</span><code>{trace.conversationId}</code></div>
        </div>
        <div className="case-return-bar"><div className="grow"><strong>沉淀为线上 Case</strong><span>保留本次输入、输出、Trace 和应用版本快照</span></div><button className="btn sm good-case-btn" onClick={() => onReturnCase(trace, 'good')}><ThumbsUp size={13} />保存为 Good Case</button><button className="btn sm bad-case-btn" onClick={() => onReturnCase(trace, 'bad')}><ThumbsDown size={13} />保存为 Bad Case</button></div>
        <div className="trace-scope-note"><Eye size={15} /><span><strong>完整执行记录：</strong>展示 Agent 显式输出的 Plan、Action、Observation、上下文和运行事件；不伪造模型不可见的内部思维。</span></div>
        <div className="execution-stream">
          <section className="execution-node input-node">
            <div className="execution-marker"><MessageSquareText size={16} /></div>
            <div className="execution-card"><div className="execution-head"><Tag tone="blue">Input</Tag><strong>用户输入</strong><span className="grow" /><Tag>已脱敏</Tag></div><p className="execution-copy">{trace.input}</p></div>
          </section>

          <section className="execution-node context-node">
            <div className="execution-marker"><Layers3 size={16} /></div>
            <div className="execution-card">
              <div className="execution-head"><Tag>Context</Tag><strong>上下文装配</strong><span className="grow" /><span className={contextPct > 90 ? 'context-danger' : 'faint'}>{formatTokens(trace.context.used)} / {formatTokens(trace.context.limit)} · {contextPct.toFixed(1)}%</span></div>
              <div className="progress" style={{ marginTop: 10 }}><i style={{ width: `${contextPct}%`, background: contextPct > 90 ? 'var(--orange)' : 'var(--primary)' }} /></div>
              <div className="context-chips"><Tag>System Prompt</Tag><Tag>{trace.context.historyTurns} 轮历史</Tag><Tag>{trace.context.retrievedChunks} 个知识分块</Tag><Tag>{trace.context.toolResults} 条工具结果</Tag></div>
              {trace.context.truncated ? <div className="inline-anomaly"><AlertTriangle size={14} />上下文达到阈值，已压缩最早对话后继续执行。</div> : null}
              <details className="node-inspector"><summary>展开完整上下文载荷</summary><div className="inspector-section"><div className="inspector-title">发送给模型的上下文</div><pre>{contextPayload(trace)}</pre></div><div className="code-explanation"><strong>字段解释</strong><ol><li>system 是应用版本固定指令和安全边界。</li><li>history、retrieval、tool_results 按实际装配顺序进入上下文。</li><li>truncated 记录是否发生压缩，避免只看到最终 Prompt 而遗漏信息损失。</li></ol></div></details>
            </div>
          </section>

          <section className="execution-node plan-node">
            <div className="execution-marker"><Bot size={16} /></div>
            <div className="execution-card">
              <div className="execution-head"><Tag tone="purple">ReAct / Plan</Tag><strong>显式执行计划</strong><span className="grow" /><Tag>{plan.steps.length} 步</Tag></div>
              <p className="plan-objective">目标：{plan.objective}</p>
              <ol className="plan-steps">{plan.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol>
              <div className="plan-basis"><ShieldAlert size={14} /><span>{plan.basis}</span></div>
              <details className="node-inspector"><summary>展开 Plan 原始结构</summary><div className="inspector-section"><div className="inspector-title">Agent 显式输出</div><pre>{JSON.stringify({ objective: plan.objective, steps: plan.steps, stop_conditions: ['质量门禁失败', '超过最大循环次数', '预算或权限阻断'] }, null, 2)}</pre></div></details>
            </div>
          </section>

          {trace.spans.map((span, index) => {
            const meta = SPAN_META[span.kind];
            const Icon = meta.icon;
            return <section className={`execution-node action-node ${span.status}`} key={span.id}>
              <div className="execution-marker"><Icon size={16} /></div>
              <div className="execution-card">
                <div className="execution-head"><Tag tone={meta.tone}>Cycle {index + 1} · {meta.text}</Tag><strong>{span.name}</strong><span className="grow" /><StatusTag status={span.status} /><span className="faint">{span.duration}</span></div>
                <div className="react-grid"><div><span>Action</span><p>{span.detail}</p></div><div><span>Observation</span><p>{span.response ?? (span.status === 'success' ? '节点完成，结果已写入 Trace 并传给下一步。' : '节点未得到可用结果，Harness 已接管恢复策略。')}</p></div></div>
                <div className="row wrap faint execution-meta"><code>{span.id}</code><span>{span.startedAt}</span>{span.tokens ? <span>输入 {formatTokens(span.tokens.input)} / 输出 {formatTokens(span.tokens.output)} tokens</span> : null}{span.cost ? <span>{money(span.cost)}</span> : null}</div>
                <details className="node-inspector"><summary>展开节点内部：请求、响应、运行代码与解释</summary>
                  <div className="inspector-grid">
                    <div className="inspector-section"><div className="inspector-title">请求 / 输入</div><pre>{span.request ?? `trace_id=${trace.id}\nspan_id=${span.id}\ninput_from=previous_observation`}</pre></div>
                    <div className="inspector-section"><div className="inspector-title">响应 / 输出</div><pre>{span.response ?? `${span.status.toUpperCase()}: ${span.detail}`}</pre></div>
                  </div>
                  <div className="runtime-code"><div className="inspector-title"><Braces size={14} />执行代码 / 配置快照 <Tag tone="orange">原型示例</Tag></div><pre>{runtimeCode(span, trace)}</pre></div>
                  <div className="code-explanation"><strong>代码解释</strong><ol>{codeExplanation(span).map((item) => <li key={item}>{item}</li>)}</ol></div>
                </details>
              </div>
            </section>;
          })}

          <section className={`execution-node harness-node ${trace.anomalies.length ? 'has-anomaly' : ''}`}>
            <div className="execution-marker"><ShieldAlert size={16} /></div>
            <div className="execution-card"><div className="execution-head"><Tag tone={trace.anomalies.length ? 'orange' : 'green'}>Harness</Tag><strong>运行守护与异常</strong><span className="grow" /><Tag tone={trace.anomalies.length ? 'orange' : 'green'}>{trace.anomalies.length ? `${trace.anomalies.length} 个事件` : '全部通过'}</Tag></div>
              {trace.anomalies.length ? <div className="anomaly-list">{trace.anomalies.map((item, index) => <div key={item}><AlertTriangle size={15} /><span><strong>事件 {index + 1}</strong>{item}</span></div>)}</div> : <p className="execution-copy">权限、Token、循环次数、超时、预算、沙箱和输出校验均未发现异常。</p>}
              <details className="node-inspector"><summary>展开 Harness 判定规则</summary><div className="runtime-code"><div className="inspector-title"><ShieldAlert size={14} />守护配置</div><pre>{`max_cycles: 12\ncontext_warning: 90%\ncontext_compress: 95%\ntool_timeout_ms: 10000\nretry_attempts: 3\nbudget_policy: warn_then_block\nredaction: pii_and_secrets`}</pre></div><div className="code-explanation"><strong>规则解释</strong><ol><li>告警阈值用于提示，不会立即终止任务。</li><li>压缩、重试、降级和阻断都会作为事件插回这条执行轨迹。</li><li>原始输入输出与代码查看受权限和审计控制。</li></ol></div></details>
            </div>
          </section>

          <section className="execution-node output-node">
            <div className="execution-marker"><CheckCircle2 size={16} /></div>
            <div className="execution-card"><div className="execution-head"><Tag tone={trace.status === 'failed' ? 'red' : 'green'}>Output</Tag><strong>最终输出</strong><span className="grow" /><Tag tone={trace.status === 'failed' ? 'red' : 'green'}>{trace.status === 'failed' ? '未完成' : '已返回用户'}</Tag></div><p className="execution-copy">{trace.output}</p><div className="row wrap" style={{ marginTop: 10 }}><RunState state={trace.toolState} label="工具" /><RunState state={trace.skillState} label="Skill" /><span className="faint">总计 {formatTokens(trace.tokens.input + trace.tokens.output)} tokens · {money(trace.cost)}</span></div></div>
          </section>
        </div>
      </div>
    </Drawer>
  );
}

function BuildDrawer({ job, onClose }: { job: BuildJob | null; onClose: () => void }) {
  const toast = useToast();
  if (!job) return null;
  return (
    <Drawer open title={<div className="row"><StatusTag status={job.status} /><span>构建任务</span><code>{job.id}</code></div>} onClose={onClose} footer={job.status === 'failed' || job.status === 'partial' ? <button className="btn primary" onClick={() => toast('原型：将只重试失败步骤，不重复解析已完成内容')}><RefreshCw size={14} />重试失败步骤</button> : undefined}>
      <div className="col" style={{ gap: 16 }}>
        <div className="trace-copy"><header><span>{job.file}</span><Tag>{job.sourceSize}</Tag></header><p>{job.knowledge} · {job.trigger} · {job.startedAt}</p></div>
        <div className="trace-summary-grid build-summary"><div><span>当前阶段</span><strong>{job.stage}</strong></div><div><span>总耗时</span><strong>{job.duration}</strong></div><div><span>分块数</span><strong>{job.chunks}</strong></div><div><span>触发方式</span><strong>{job.trigger}</strong></div></div>
        {job.error ? <div className="notice warn"><AlertTriangle size={17} /><div><strong>{job.error}</strong><p>{job.recommendation}</p></div></div> : null}
        <div><strong>构建流水线</strong><div className="build-pipeline">
          {job.stages.map((stage, index) => <div className={`build-stage ${stage.status}`} key={stage.name}>
            <div className="build-stage-marker">{stage.status === 'success' ? <CheckCircle2 size={17} /> : stage.status === 'failed' ? <XCircle size={17} /> : stage.status === 'running' ? <PlayCircle size={17} /> : stage.status === 'partial' ? <AlertTriangle size={17} /> : <Clock3 size={17} />}{index < job.stages.length - 1 ? <i /> : null}</div>
            <div className="grow"><div className="row"><strong>{stage.name}</strong><span className="grow" /><span className="faint">{stage.duration}</span></div><p>{stage.detail}</p></div>
          </div>)}
        </div></div>
      </div>
    </Drawer>
  );
}

function ConversationDrawer({ conversation, onClose, onTrace, onReturnCase }: { conversation: ConversationLog | null; onClose: () => void; onTrace: (id: string) => void; onReturnCase: (trace: AgentTrace, type: CaseType) => void }) {
  if (!conversation) return null;
  const traces = AGENT_TRACES.filter((item) => conversation.traces.includes(item.id));
  return (
    <Drawer open title={<div className="row"><span>会话详情</span><code>{conversation.id}</code></div>} onClose={onClose} footer={traces[0] ? <><button className="btn good-case-btn" onClick={() => onReturnCase(traces[0], 'good')}><ThumbsUp size={14} />保存为 Good Case</button><button className="btn bad-case-btn" onClick={() => onReturnCase(traces[0], 'bad')}><ThumbsDown size={14} />保存为 Bad Case</button></> : undefined}>
      <div className="col" style={{ gap: 16 }}>
        <div className="trace-summary-grid build-summary"><div><span>应用</span><strong>{conversation.app}</strong></div><div><span>用户</span><strong>{conversation.user}</strong></div><div><span>渠道 / 轮次</span><strong>{conversation.channel} · {conversation.turns} 轮</strong></div><div><span>累计消耗</span><strong>{formatTokens(conversation.tokens)} · {money(conversation.cost)}</strong></div></div>
        <div className="message-thread">
          <div className="message-item user-message"><span>用户</span><p>{conversation.lastQuestion}</p></div>
          <div className="message-item assistant-message"><span>AI</span><p>{traces[0]?.output ?? '会话记录已脱敏。'}</p></div>
        </div>
        <div><div className="row section-row"><strong>关联 Trace</strong><span className="grow" /><span className="faint">每轮可独立排障</span></div>
          {traces.map((item) => <button className="linked-trace" key={item.id} onClick={() => onTrace(item.id)}><StatusTag status={item.status} /><span className="grow"><strong>{item.input}</strong><code>{item.id}</code></span><span>{formatTokens(item.tokens.input + item.tokens.output)} tokens</span><ChevronRight size={15} /></button>)}
        </div>
      </div>
    </Drawer>
  );
}

function CaseReturnModal({ value, onClose }: { value: { trace: AgentTrace; type: CaseType } | null; onClose: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const state = getEvaluationState();
  const trace = value?.trace;
  const [type, setType] = useState<CaseType>(value?.type ?? 'bad');
  const existingSetIds = new Set(state.cases.filter((item) => item.source.traceId === trace?.id).map((item) => item.setId));
  const availableSets = state.sets.filter((item) => !existingSetIds.has(item.id));
  const [targetSet, setTargetSet] = useState(availableSets[0]?.id ?? '');
  const [standard, setStandard] = useState('');
  const [tagText, setTagText] = useState(type === 'good' ? '线上回流,人工确认' : '线上回流,待复盘');
  if (!value || !trace) return null;
  const submit = () => {
    const tags = tagText.split(/[，,]/).map((item) => item.trim()).filter(Boolean);
    const result = addConversationsToEvaluationSet([trace.conversationId], targetSet, type, standard, tags);
    if (result.added) {
      toast(`已保存为 ${type === 'good' ? 'Good Case' : 'Bad Case'}`);
      onClose();
    } else toast('该 Trace 已存在于所选评测集');
  };
  return <Modal open title={`保存为 ${type === 'good' ? 'Good Case' : 'Bad Case'}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" disabled={!targetSet} onClick={submit}>确认保存</button></>}>
    <div className="case-source-preview"><span><strong>{trace.input}</strong><small>{trace.app} · {trace.version} · <code>{trace.id}</code></small></span><Tag tone={trace.status === 'success' ? 'green' : 'orange'}>{trace.status === 'success' ? '运行成功' : '运行异常'}</Tag></div>
    <div className="case-type-picker">
      <button className={type === 'good' ? 'active good' : ''} onClick={() => { setType('good'); setTagText('线上回流,人工确认'); }}><ThumbsUp size={18} /><span><strong>Good Case</strong><small>当前结果已确认，可作为参考答案</small></span></button>
      <button className={type === 'bad' ? 'active bad' : ''} onClick={() => { setType('bad'); setTagText('线上回流,待复盘'); }}><ThumbsDown size={18} /><span><strong>Bad Case</strong><small>当前结果有问题，需要补期望标准</small></span></button>
    </div>
    {availableSets.length ? <Field label="目标评测集" required><select className="select" value={targetSet} onChange={(event) => setTargetSet(event.target.value)}>{availableSets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}</select><div className="faint" style={{ marginTop: 5 }}>已包含这条 Trace 的评测集不会重复显示。</div></Field> : <div className="notice warn"><ShieldAlert size={16} /><span className="grow">现有评测集都已包含这条 Trace，请先新建评测集。</span><button className="btn sm" onClick={() => { onClose(); navigate('/evaluation-sets'); }}>新建评测集</button></div>}
    <Field label={type === 'good' ? '参考答案 / 保持项' : '期望输出或判定规则'} hint={type === 'bad' ? '可稍后补充' : undefined}><textarea className="textarea" value={standard} onChange={(event) => setStandard(event.target.value)} placeholder={type === 'good' ? '不填则使用当前线上回答作为参考答案' : '例如：订单查询必须调用工具，不得编造物流状态'} /></Field>
    <Field label="标签" hint="逗号分隔"><input className="input" value={tagText} onChange={(event) => setTagText(event.target.value)} /></Field>
    {type === 'bad' && !standard.trim() ? <div className="notice warn"><ShieldAlert size={16} /><span>未填写标准的 Bad Case 会保存为“待补标准”，不会直接参与自动评测。</span></div> : null}
  </Modal>;
}
