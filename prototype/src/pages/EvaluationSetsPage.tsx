import {
  ArrowRight, CheckCircle2, ClipboardCheck, CopyPlus, Filter, FolderPlus, MessageSquareText, Plus, Search,
  ShieldAlert, Sparkles, ThumbsDown, ThumbsUp,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Drawer, Field, Modal, Tag, useToast } from '../components/ui';
import {
  createEvaluationSet, getEvaluationState, moveEvaluationCases, updateEvaluationCase,
  type EvaluationCase, type EvaluationSet,
} from '../data/evaluation';

type CaseFilter = 'all' | 'good' | 'bad' | 'needs_standard';

function readinessTag(item: EvaluationCase) {
  if (item.readiness === 'ready') return <Tag tone="green"><CheckCircle2 size={12} />可运行</Tag>;
  if (item.readiness === 'needs_standard') return <Tag tone="orange"><ShieldAlert size={12} />待补标准</Tag>;
  return <Tag>草稿</Tag>;
}

export function EvaluationSetsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState(() => getEvaluationState());
  const [filter, setFilter] = useState<CaseFilter>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [caseDetail, setCaseDetail] = useState<EvaluationCase | null>(null);
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState(false);

  const requestedSet = params.get('set');
  const activeSetId = state.sets.some((item) => item.id === requestedSet) ? requestedSet! : state.sets[0]?.id ?? '';
  const activeSet = state.sets.find((item) => item.id === activeSetId);
  const counts = useMemo(() => Object.fromEntries(state.sets.map((set) => [set.id, state.cases.filter((item) => item.setId === set.id).length])), [state]);
  const activeCases = state.cases.filter((item) => item.setId === activeSetId && (filter === 'all' || item.type === filter || item.readiness === filter));
  const readyCount = state.cases.filter((item) => item.readiness === 'ready').length;
  const badCount = state.cases.filter((item) => item.type === 'bad').length;
  const pendingCount = state.cases.filter((item) => item.readiness === 'needs_standard').length;

  const refresh = () => setState(getEvaluationState());
  const selectSet = (setId: string) => {
    setParams({ set: setId });
    setSelected([]);
    setFilter('all');
  };
  const toggle = (caseId: string) => setSelected((items) => items.includes(caseId) ? items.filter((id) => id !== caseId) : [...items, caseId]);
  const toggleAll = () => setSelected(selected.length === activeCases.length ? [] : activeCases.map((item) => item.id));

  return (
    <div className="eval-page">
      <header className="eval-head">
        <div className="grow"><div className="row"><h1>评测集</h1><Tag tone="orange">原型演示数据</Tag></div><p>把线上 Good Case 与 Bad Case 回流为可重复运行的质量资产。</p></div>
        <button className="btn" onClick={() => navigate('/observability?view=conversations')}><MessageSquareText size={15} />从线上日志回流</button>
        <button className="btn primary" onClick={() => setCreating(true)}><FolderPlus size={15} />新建评测集</button>
      </header>

      <div className="eval-stats grid c4">
        <div className="card stat"><div className="label">评测集</div><div className="value">{state.sets.length}</div><div className="observability-meta ok">按业务场景独立维护</div></div>
        <div className="card stat"><div className="label">全部 Case</div><div className="value">{state.cases.length}</div><div className="observability-meta ok">{readyCount} 条可直接运行</div></div>
        <div className="card stat"><div className="label">Bad Case</div><div className="value">{badCount}</div><div className="observability-meta warn">用于修复与回归</div></div>
        <div className="card stat"><div className="label">待补标准</div><div className="value">{pendingCount}</div><div className="observability-meta bad">补齐后才能运行</div></div>
      </div>

      <div className="eval-workspace">
        <aside className="eval-set-list">
          <div className="eval-side-title"><strong>评测集</strong><button className="btn ghost sm icon" aria-label="新建评测集" onClick={() => setCreating(true)}><Plus size={15} /></button></div>
          {state.sets.map((set) => <button key={set.id} className={`eval-set-item ${activeSetId === set.id ? 'active' : ''}`} onClick={() => selectSet(set.id)}>
            <span className="eval-set-icon"><ClipboardCheck size={17} /></span><span className="grow"><strong>{set.name}</strong><small>{set.app} · {set.owner}</small></span><Tag>{counts[set.id] ?? 0}</Tag>
          </button>)}
        </aside>

        <main className="eval-case-panel">
          <div className="eval-set-head"><div className="grow"><h2>{activeSet?.name}</h2><p>{activeSet?.description}</p><div className="row wrap" style={{ marginTop: 7 }}><Tag>{activeSet?.app}</Tag><span className="faint">负责人 {activeSet?.owner}</span><span className="faint">更新于 {activeSet?.updatedAt}</span></div></div><button className="btn"><Sparkles size={14} />运行评测</button></div>
          <div className="eval-filter row wrap">
            <div className="seg">
              {([['all', '全部'], ['good', 'Good Case'], ['bad', 'Bad Case'], ['needs_standard', '待补标准']] as const).map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => { setFilter(key); setSelected([]); }}>{label}</button>)}
            </div>
            <button className="btn sm"><Filter size={13} />标签</button><span className="grow" /><div className="search-box" style={{ width: 230 }}><Search size={14} /><input className="input sm" placeholder="搜索输入或 Trace ID" /></div>
          </div>
          {selected.length ? <div className="eval-batch-bar"><span>已选择 <strong>{selected.length}</strong> 条 Case</span><button className="btn sm" onClick={() => setMoving(true)}><CopyPlus size={13} />移动到评测集</button><button className="btn sm ghost" onClick={() => setSelected([])}>取消选择</button></div> : null}
          <div className="eval-case-table table-scroll">
            <table className="table">
              <thead><tr><th><input type="checkbox" aria-label="选择全部 Case" checked={activeCases.length > 0 && selected.length === activeCases.length} onChange={toggleAll} /></th><th>Case 输入</th><th>类型</th><th>状态</th><th>来源快照</th><th>标签</th><th>添加时间</th></tr></thead>
              <tbody>{activeCases.map((item) => <tr key={item.id} className="clickable" onClick={() => setCaseDetail(item)}>
                <td onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`选择 ${item.input}`} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /></td>
                <td><div className="eval-case-input">{item.input}</div><code>{item.id}</code></td>
                <td><Tag tone={item.type === 'good' ? 'green' : 'red'}>{item.type === 'good' ? <ThumbsUp size={12} /> : <ThumbsDown size={12} />}{item.type === 'good' ? 'Good Case' : 'Bad Case'}</Tag></td>
                <td>{readinessTag(item)}</td>
                <td><div>{item.source.app} · {item.source.appVersion}</div><code>{item.source.traceId}</code></td>
                <td><div className="row wrap" style={{ gap: 4 }}>{item.tags.slice(0, 2).map((tag) => <Tag key={tag}>{tag}</Tag>)}</div></td>
                <td className="faint">{item.addedAt}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {!activeCases.length ? <div className="empty"><ClipboardCheck size={30} /><strong>当前筛选下没有 Case</strong><span>去线上日志选择真实会话回流到这个评测集。</span><button className="btn primary" onClick={() => navigate('/observability?view=conversations')}>查看线上日志<ArrowRight size={14} /></button></div> : null}
        </main>
      </div>

      <CreateSetModal open={creating} onClose={() => setCreating(false)} onCreated={(set) => { setCreating(false); refresh(); selectSet(set.id); toast(`已创建评测集「${set.name}」`); }} />
      <MoveCasesModal open={moving} sets={state.sets.filter((item) => item.id !== activeSetId)} count={selected.length} onClose={() => setMoving(false)} onMove={(setId) => { moveEvaluationCases(selected, setId); setMoving(false); setSelected([]); refresh(); toast(`已移动 ${selected.length} 条 Case`); }} />
      <CaseDrawer key={caseDetail?.id ?? 'closed'} item={caseDetail} onClose={() => setCaseDetail(null)} onSaved={() => { setCaseDetail(null); refresh(); }} />
    </div>
  );
}

function CreateSetModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (set: EvaluationSet) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [app, setApp] = useState('全部应用');
  return <Modal open={open} title="新建评测集" onClose={onClose} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" disabled={!name.trim()} onClick={() => onCreated(createEvaluationSet({ name: name.trim(), description: description.trim() || '从线上日志持续回流并维护的评测集。', app }))}>创建</button></>}>
    <Field label="评测集名称" required><input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：客服退款问题回归集" /></Field>
    <Field label="所属应用"><select className="select" value={app} onChange={(event) => setApp(event.target.value)}><option>全部应用</option><option>智能客服助手</option><option>行业研究报告撰写</option><option>合同风险审校</option><option>制度问答助手</option></select></Field>
    <Field label="说明"><textarea className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="说明收集范围与评测目标" /></Field>
  </Modal>;
}

function MoveCasesModal({ open, sets, count, onClose, onMove }: { open: boolean; sets: EvaluationSet[]; count: number; onClose: () => void; onMove: (setId: string) => void }) {
  const [target, setTarget] = useState(sets[0]?.id ?? '');
  return <Modal open={open} title={`移动 ${count} 条 Case`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" disabled={!target} onClick={() => onMove(target)}>确认移动</button></>}>
    <p className="muted" style={{ marginBottom: 12 }}>Case 的来源 Trace、应用版本、模型和判定标准会一起保留。</p>
    <Field label="目标评测集"><select className="select" value={target} onChange={(event) => setTarget(event.target.value)}>{sets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}</select></Field>
  </Modal>;
}

function CaseDrawer({ item, onClose, onSaved }: { item: EvaluationCase | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [expected, setExpected] = useState(item?.expectedOutput ?? '');
  const [criteria, setCriteria] = useState(item?.criteria.join('\n') ?? '');
  if (!item) return null;
  const save = () => {
    const list = criteria.split('\n').map((line) => line.trim()).filter(Boolean);
    updateEvaluationCase(item.id, { expectedOutput: expected.trim(), criteria: list, readiness: expected.trim() || list.length ? 'ready' : 'needs_standard' });
    toast('评测标准已保存');
    onSaved();
  };
  return <Drawer wide open title={<div className="row"><Tag tone={item.type === 'good' ? 'green' : 'red'}>{item.type === 'good' ? 'Good Case' : 'Bad Case'}</Tag><span>Case 详情</span><code>{item.id}</code></div>} onClose={onClose} footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" onClick={save}>保存评测标准</button></>}>
    <div className="case-detail-grid">
      <div className="case-source-card"><div className="row"><strong className="grow">线上来源快照</strong>{readinessTag(item)}</div><dl className="kv"><dt>会话</dt><dd><code>{item.source.conversationId}</code></dd><dt>Trace</dt><dd><code>{item.source.traceId}</code></dd><dt>应用版本</dt><dd>{item.source.app} · {item.source.appVersion}</dd><dt>模型</dt><dd>{item.source.model}</dd><dt>渠道 / 时间</dt><dd>{item.source.channel} · {item.source.capturedAt}</dd></dl></div>
      <div className="trace-copy"><header><span>用户输入</span></header><p>{item.input}</p></div>
      <div className="trace-copy"><header><span>线上实际输出</span><Tag>只读快照</Tag></header><p>{item.actualOutput}</p></div>
      {item.type === 'bad' && item.readiness === 'needs_standard' ? <div className="notice warn"><ShieldAlert size={16} /><span>Bad Case 尚不能直接运行。请补充期望输出或至少一条判定规则。</span></div> : null}
      <Field label={item.type === 'good' ? '参考答案 / 保持项' : '期望输出'}><textarea className="textarea" style={{ minHeight: 100 }} value={expected} onChange={(event) => setExpected(event.target.value)} placeholder="描述正确结果应该是什么" /></Field>
      <Field label="判定规则" hint="每行一条"><textarea className="textarea" style={{ minHeight: 110 }} value={criteria} onChange={(event) => setCriteria(event.target.value)} placeholder={'必须调用订单查询工具\n不得编造物流状态\n回答包含预计送达时间'} /></Field>
      <div><div className="field-label">标签</div><div className="row wrap">{item.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div></div>
    </div>
  </Drawer>;
}
