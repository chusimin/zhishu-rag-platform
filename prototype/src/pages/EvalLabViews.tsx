import {
  ArrowLeft, Bot, BrainCircuit, Check, CheckCircle2, ChevronRight, CircleAlert, Cpu, FlaskConical, Gauge, Headset, MessageSquareText,
  Play, Plus, Route, Scale, ShieldCheck, Sparkles, TriangleAlert, Wrench, X, XCircle, type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Dev, Drawer, Field, Modal, Slider, Switch, Tag, useToast } from '../components/ui';
import {
  EXPERIMENTS, GRADER_META, GRADERS, pct, SKILL_SUITES, TARGET_META,
  type CaseRow, type CellResult, type Experiment, type Grader, type TargetKind, type TrajectoryStep, type Variant,
} from '../data/experiments';
import { MODELS, TOOLS } from '../data/mock';

const TARGET_ICON: Record<TargetKind, LucideIcon> = { model: Cpu, prompt: MessageSquareText, skill: Wrench, agent: Bot };
const STEP_ICON: Record<TrajectoryStep['kind'], LucideIcon> = { retrieval: FlaskConical, tool: Wrench, handoff: Headset, model: BrainCircuit, confirm: ShieldCheck };

function TargetTag({ target }: { target: TargetKind }) {
  const Icon = TARGET_ICON[target];
  return <span className="tag" style={{ color: TARGET_META[target].color, borderColor: `${TARGET_META[target].color}33`, background: `${TARGET_META[target].color}0f` }}><Icon size={12} />{TARGET_META[target].name}</span>;
}

function Delta({ value, base, unit = 'pct', lowerIsBetter }: { value: number; base: number; unit?: 'pct' | 'ms' | 'cost' | 'score'; lowerIsBetter?: boolean }) {
  if (value === base) return null;
  const diff = value - base;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  const text = unit === 'pct' ? `${diff > 0 ? '+' : ''}${(diff * 100).toFixed(1)}` : unit === 'score' ? `${diff > 0 ? '+' : ''}${diff.toFixed(2)}` : `${diff > 0 ? '+' : ''}${Math.round((diff / base) * 100)}%`;
  return <span className={`lab-delta ${good ? 'up' : 'down'}`}>{text}</span>;
}

function Runs({ runs }: { runs: boolean[] }) {
  return <span className="lab-runs" title={`${runs.filter(Boolean).length}/${runs.length} 次通过`}>{runs.map((ok, index) => <i key={index} className={ok ? 'ok' : 'fail'} />)}</span>;
}

/* ============================== 对比实验 ============================== */

export function ExperimentsView() {
  const [params, setParams] = useSearchParams();
  const [experiments, setExperiments] = useState<Experiment[]>(EXPERIMENTS);
  const [creating, setCreating] = useState(false);
  const openId = params.get('exp');
  const open = experiments.find((item) => item.id === openId);
  const go = (id: string | null) => setParams(id ? { view: 'experiments', exp: id } : { view: 'experiments' });

  // 原型：运行中的实验逐步推进进度
  useEffect(() => {
    if (!experiments.some((item) => item.status === 'running')) return undefined;
    const timer = window.setInterval(() => setExperiments((list) => list.map((item) => {
      if (item.status !== 'running') return item;
      const progress = Math.min(1, (item.progress ?? 0) + 0.08);
      if (progress < 1 || !item.id.startsWith('exp-new-')) return { ...item, progress: Math.min(progress, item.id === 'exp-skill' ? 0.94 : 1) };
      const template = EXPERIMENTS.find((candidate) => candidate.target === item.target && candidate.status === 'completed') ?? EXPERIMENTS[0];
      return { ...template, ...item, status: 'completed', progress: 1, summaries: template.summaries.map((summary, index) => ({ ...summary, variantId: item.variants[index]?.id ?? summary.variantId })).slice(0, item.variants.length), groups: template.groups.map((group) => ({ group: group.group, rates: Object.fromEntries(item.variants.map((variant, index) => [variant.id, Object.values(group.rates)[index] ?? Object.values(group.rates)[0]])) })), rows: template.rows.map((row) => ({ ...row, cells: item.variants.map((variant, index) => ({ ...(row.cells[index] ?? row.cells[0]), variantId: variant.id })) })), verdict: template.verdict };
    })), 600);
    return () => window.clearInterval(timer);
  }, [experiments]);

  if (open) return <ExperimentDetail exp={open} onBack={() => go(null)} />;

  return (
    <div className="lab-view">
      <div className="lab-intro">
        <div className="grow">
          <h2>对比实验 <Dev s="todo" note="实验 + 变体 + 重复运行" /></h2>
          <p>同一个评测集 × 多个配置变体，回答「换模型值不值」「改提示词有没有改坏」「新 Skill 能不能替换」「Agent 是否按规矩做事」。</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}><Plus size={15} />新建实验</button>
      </div>
      <div className="lab-target-strip">
        {(Object.keys(TARGET_META) as TargetKind[]).map((key) => {
          const Icon = TARGET_ICON[key];
          return <button key={key} className="lab-target-card" onClick={() => setCreating(true)}><span style={{ color: TARGET_META[key].color, background: `${TARGET_META[key].color}14` }}><Icon size={18} /></span><div><strong>评测{TARGET_META[key].name}</strong><small>{TARGET_META[key].question}</small></div></button>;
        })}
      </div>
      <div className="card table-scroll">
        <table className="table">
          <thead><tr><th>实验</th><th>评测对象</th><th>变体</th><th>评测集 · 规模</th><th>结论</th><th>状态</th><th>创建</th></tr></thead>
          <tbody>{experiments.map((item) => (
            <tr key={item.id} className="clickable" onClick={() => go(item.id)}>
              <td><strong>{item.name}</strong><div className="faint">{item.app}</div></td>
              <td><TargetTag target={item.target} /></td>
              <td>{item.variants.length} 个<div className="faint ellipsis" style={{ maxWidth: 200 }}>{item.variants.map((variant) => variant.name).join(' / ')}</div></td>
              <td>{item.setName}<div className="faint">{item.caseCount} Case × {item.repeats} 次</div></td>
              <td style={{ maxWidth: 280 }}>{item.status === 'running' ? <span className="faint">—</span> : <span className={`lab-verdict-inline ${item.verdict.tone}`}>{item.verdict.title}</span>}</td>
              <td>{item.status === 'running' ? <div style={{ width: 120 }}><div className="faint" style={{ marginBottom: 4 }}>运行中 {Math.round((item.progress ?? 0) * 100)}%</div><div className="progress"><i style={{ width: `${(item.progress ?? 0) * 100}%` }} /></div></div> : <Tag tone="green"><CheckCircle2 size={12} />已完成</Tag>}</td>
              <td className="faint">{item.createdAt}<div>{item.owner}</div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <NewExperimentModal open={creating} onClose={() => setCreating(false)} onCreate={(exp) => { setExperiments((list) => [exp, ...list]); setCreating(false); go(exp.id); }} />
    </div>
  );
}

/* ---------------- 实验报告 ---------------- */

type RowFilter = 'all' | 'regression' | 'improved' | 'unstable';

function ExperimentDetail({ exp, onBack }: { exp: Experiment; onBack: () => void }) {
  const toast = useToast();
  const [filter, setFilter] = useState<RowFilter>('all');
  const [compare, setCompare] = useState<CaseRow | null>(null);
  const base = exp.variants.find((item) => item.baseline) ?? exp.variants[0];
  const baseSummary = exp.summaries.find((item) => item.variantId === base.id);
  const passOf = (cell?: CellResult) => (cell ? cell.runs.filter(Boolean).length / cell.runs.length >= 0.5 : false);
  const classify = (row: CaseRow) => {
    const baseCell = row.cells.find((cell) => cell.variantId === base.id);
    const others = row.cells.filter((cell) => cell.variantId !== base.id);
    return {
      regression: passOf(baseCell) && others.some((cell) => !passOf(cell)),
      improved: !passOf(baseCell) && others.some((cell) => passOf(cell)),
      unstable: row.cells.some((cell) => cell.runs.some(Boolean) && cell.runs.some((run) => !run)),
    };
  };
  const counts = useMemo(() => {
    const result = { regression: 0, improved: 0, unstable: 0 };
    exp.rows.forEach((row) => { const kind = classify(row); if (kind.regression) result.regression += 1; if (kind.improved) result.improved += 1; if (kind.unstable) result.unstable += 1; });
    return result;
  }, [exp]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = exp.rows.filter((row) => filter === 'all' || classify(row)[filter]);

  if (exp.status === 'running') {
    return (
      <div className="lab-view">
        <button className="back-link" onClick={onBack}><ArrowLeft size={14} />全部实验</button>
        <div className="card pad" style={{ maxWidth: 720 }}>
          <div className="row"><TargetTag target={exp.target} /><strong className="grow">{exp.name}</strong></div>
          <p className="muted" style={{ margin: '10px 0' }}>{exp.caseCount} 条 Case × {exp.variants.length} 个变体 × {exp.repeats} 次，共 {exp.caseCount * exp.variants.length * exp.repeats} 次运行。副作用工具使用模拟执行。</p>
          <div className="progress" style={{ height: 8 }}><i style={{ width: `${(exp.progress ?? 0) * 100}%` }} /></div>
          <div className="faint" style={{ marginTop: 6 }}>已完成 {Math.round((exp.progress ?? 0) * 100)}% · 可离开页面，完成后在列表中查看</div>
        </div>
      </div>
    );
  }

  return (
    <div className="lab-view">
      <button className="back-link" onClick={onBack}><ArrowLeft size={14} />全部实验</button>
      <div className="lab-detail-head">
        <div className="grow">
          <div className="row"><TargetTag target={exp.target} /><h2>{exp.name}</h2></div>
          <div className="row wrap faint" style={{ marginTop: 6, gap: 10 }}>
            <span>{exp.app}</span><span>评测集：{exp.setName}</span><span>{exp.caseCount} Case × {exp.repeats} 次重复</span>
            <span>评测器：{exp.graders.map((id) => GRADERS.find((g) => g.id === id)?.name).join('、')}</span><span>{exp.createdAt} · {exp.owner}</span>
          </div>
        </div>
        <button className="btn" onClick={() => toast('已按相同配置重新运行')}><Play size={14} />重新运行</button>
        <button className="btn" onClick={() => toast(`已把「${base.name}」设为门禁基线：之后发布要求相对它无回归`)}><Scale size={14} />设为门禁基线 <Dev s="todo" note="无回归门禁" /></button>
        <button className="btn primary" disabled={!exp.verdict.recommend || exp.verdict.recommend === base.id} onClick={() => toast('已把该变体的改动应用到应用草稿')}><Check size={14} />采用推荐变体到草稿</button>
      </div>

      <div className={`lab-verdict ${exp.verdict.tone}`}>
        {exp.verdict.tone === 'ok' ? <CheckCircle2 size={18} /> : exp.verdict.tone === 'warn' ? <TriangleAlert size={18} /> : <XCircle size={18} />}
        <div><strong>{exp.verdict.title}</strong><p>{exp.verdict.detail}</p></div>
      </div>

      <section className="card pad">
        <div className="row section-row"><strong className="grow">变体对比</strong><span className="faint">通过率按「多数次通过」计；± 为 {exp.repeats} 次重复运行的波动</span></div>
        <div className="table-scroll">
          <table className="table lab-compare">
            <thead><tr><th>变体</th><th>相对基线的改动</th><th>通过率</th>{exp.summaries.some((s) => s.judgeScore != null) ? <th>评委均分</th> : null}{exp.summaries.some((s) => s.avgSteps != null) ? <th>平均步数</th> : null}<th>P50 延迟</th><th>每百次费用</th><th>每次通过成本</th></tr></thead>
            <tbody>{exp.variants.map((variant) => {
              const summary = exp.summaries.find((item) => item.variantId === variant.id);
              if (!summary || !baseSummary) return null;
              return (
                <tr key={variant.id} className={exp.verdict.recommend === variant.id ? 'lab-best' : undefined}>
                  <td><strong>{variant.name}</strong>{variant.baseline ? <Tag>基线</Tag> : null}{exp.verdict.recommend === variant.id ? <Tag tone="green">推荐</Tag> : null}</td>
                  <td><ChangeList variant={variant} /></td>
                  <td><div className="lab-rate"><span style={{ width: `${summary.passRate * 100}%` }} /></div><strong>{pct(summary.passRate)}</strong> <span className="faint">±{summary.spread}</span> <Delta value={summary.passRate} base={baseSummary.passRate} /></td>
                  {exp.summaries.some((s) => s.judgeScore != null) ? <td>{summary.judgeScore?.toFixed(2) ?? '—'} {summary.judgeScore != null && baseSummary.judgeScore != null ? <Delta value={summary.judgeScore} base={baseSummary.judgeScore} unit="score" /> : null}</td> : null}
                  {exp.summaries.some((s) => s.avgSteps != null) ? <td>{summary.avgSteps} <Delta value={summary.avgSteps ?? 0} base={baseSummary.avgSteps ?? 0} unit="ms" lowerIsBetter /></td> : null}
                  <td>{(summary.p50Ms / 1000).toFixed(1)}s <Delta value={summary.p50Ms} base={baseSummary.p50Ms} unit="ms" lowerIsBetter /></td>
                  <td>${summary.costPer100.toFixed(2)} <Delta value={summary.costPer100} base={baseSummary.costPer100} unit="cost" lowerIsBetter /></td>
                  <td>${(summary.costPer100 / 100 / summary.passRate).toFixed(4)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </section>

      <div className="lab-two-col">
        <section className="card pad">
          <div className="row section-row"><strong className="grow">按评测维度</strong><span className="faint">一眼看出改动伤到了哪里</span></div>
          <table className="table">
            <thead><tr><th>维度</th>{exp.variants.map((variant) => <th key={variant.id}>{variant.name.split('（')[0]}</th>)}</tr></thead>
            <tbody>{exp.groups.map((group) => (
              <tr key={group.group}>
                <td>{group.group}</td>
                {exp.variants.map((variant) => {
                  const value = group.rates[variant.id] ?? 0;
                  const baseValue = group.rates[base.id] ?? 0;
                  const drop = !variant.baseline && value < baseValue - 0.05;
                  return <td key={variant.id} className={drop ? 'lab-cell-drop' : !variant.baseline && value > baseValue + 0.05 ? 'lab-cell-up' : undefined}>{pct(value)}{!variant.baseline ? <Delta value={value} base={baseValue} /> : null}</td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </section>
        <section className="card pad">
          <div className="row section-row"><strong className="grow">需要关注</strong></div>
          <button className="lab-attention bad" onClick={() => setFilter('regression')}><XCircle size={16} /><span className="grow"><strong>{counts.regression} 条回归</strong><small>基线通过、变体未通过</small></span><ChevronRight size={15} /></button>
          <button className="lab-attention good" onClick={() => setFilter('improved')}><CheckCircle2 size={16} /><span className="grow"><strong>{counts.improved} 条改进</strong><small>基线未通过、变体通过</small></span><ChevronRight size={15} /></button>
          <button className="lab-attention warn" onClick={() => setFilter('unstable')}><Gauge size={16} /><span className="grow"><strong>{counts.unstable} 条不稳定</strong><small>同一变体多次运行结果不一致</small></span><ChevronRight size={15} /></button>
        </section>
      </div>

      <section className="card pad">
        <div className="row section-row">
          <strong className="grow">逐条结果</strong>
          <div className="seg">{([['all', '全部'], ['regression', `回归 ${counts.regression}`], ['improved', `改进 ${counts.improved}`], ['unstable', `不稳定 ${counts.unstable}`]] as const).map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Case</th><th>维度</th>{exp.variants.map((variant) => <th key={variant.id}>{variant.name.split('（')[0]}</th>)}<th /></tr></thead>
            <tbody>{rows.map((row) => {
              const kind = classify(row);
              return (
                <tr key={row.id} className="clickable" onClick={() => setCompare(row)}>
                  <td style={{ maxWidth: 320 }}><div className="ellipsis" style={{ fontWeight: 500 }}>{row.input}</div><div className="row" style={{ gap: 4, marginTop: 3 }}>{kind.regression ? <Tag tone="red">回归</Tag> : null}{kind.improved ? <Tag tone="green">改进</Tag> : null}{kind.unstable ? <Tag tone="orange">不稳定</Tag> : null}</div></td>
                  <td><Tag>{row.group}</Tag></td>
                  {exp.variants.map((variant) => {
                    const cell = row.cells.find((item) => item.variantId === variant.id);
                    return <td key={variant.id}>{cell ? <div className="row" style={{ gap: 6 }}>{passOf(cell) ? <CheckCircle2 size={16} color="#12b76a" /> : <XCircle size={16} color="#f04438" />}<Runs runs={cell.runs} />{cell.judge ? <span className="faint">{cell.judge.score.toFixed(1)}</span> : null}</div> : '—'}</td>;
                  })}
                  <td><span className="faint row" style={{ gap: 2 }}>对比<ChevronRight size={14} /></span></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        {exp.rows.length < exp.caseCount ? <p className="faint" style={{ marginTop: 8 }}>原型仅展示 {exp.rows.length} / {exp.caseCount} 条代表性 Case。</p> : null}
      </section>

      <CompareDrawer row={compare} exp={exp} onClose={() => setCompare(null)} />
    </div>
  );
}

function ChangeList({ variant }: { variant: Variant }) {
  if (variant.baseline) return <span className="faint">当前线上配置</span>;
  return <div className="col" style={{ gap: 3 }}>{variant.changes.map((change) => <div key={change.field} className="lab-change"><b>{change.field}</b><s>{change.from}</s><span>→</span><em>{change.to}</em></div>)}</div>;
}

function CompareDrawer({ row, exp, onClose }: { row: CaseRow | null; exp: Experiment; onClose: () => void }) {
  const toast = useToast();
  if (!row) return null;
  return (
    <Drawer open wide title={<div className="row"><span>逐条对比</span><Tag>{row.group}</Tag></div>} onClose={onClose}
      footer={<>{row.cells.some((cell) => cell.judge) ? <button className="btn" onClick={() => toast('已标记为评委误判，进入校准样本')}>评委判错了，人工改判 <Dev s="todo" /></button> : null}<span className="grow" /><button className="btn primary" onClick={onClose}>完成</button></>}>
      <div className="trace-copy"><header><span>用户输入</span></header><p>{row.input}</p></div>
      <div className="row wrap" style={{ margin: '10px 0 14px', gap: 6 }}><span className="faint">判定标准</span>{row.criteria.map((item) => <Tag key={item}>{item}</Tag>)}</div>
      <div className="lab-compare-cols" style={{ gridTemplateColumns: `repeat(${row.cells.length}, minmax(0, 1fr))` }}>
        {row.cells.map((cell) => {
          const variant = exp.variants.find((item) => item.id === cell.variantId);
          const passed = cell.runs.filter(Boolean).length;
          return (
            <div key={cell.variantId} className="lab-compare-col">
              <header><strong className="grow ellipsis">{variant?.name}</strong>{passed / cell.runs.length >= 0.5 ? <Tag tone="green">通过</Tag> : <Tag tone="red">未通过</Tag>}</header>
              <div className="row" style={{ gap: 6, marginBottom: 8 }}><Runs runs={cell.runs} /><span className="faint">{passed}/{cell.runs.length} 次通过</span></div>
              <div className="lab-output">{cell.output}</div>
              {cell.ruleNotes.length ? <div className="lab-note bad"><CircleAlert size={13} />{cell.ruleNotes.join('；')}</div> : <div className="lab-note ok"><CheckCircle2 size={13} />规则判定全部满足</div>}
              {cell.judge ? <div className="lab-judge"><div className="row"><Sparkles size={13} color="var(--purple)" /><strong className="grow">LLM 评委</strong><span className="lab-score">{cell.judge.score.toFixed(1)} / 5</span></div><p>{cell.judge.reason}</p></div> : null}
              {cell.trajectory ? <div className="lab-trajectory"><div className="faint" style={{ marginBottom: 6 }}>执行轨迹</div>{cell.trajectory.map((step, index) => {
                const Icon = STEP_ICON[step.kind];
                return <div key={index} className={`lab-step ${step.ok ? '' : 'fail'}`}><Icon size={13} /><span className="grow">{step.label}{step.note ? <small>{step.note}</small> : null}</span>{step.ok ? <Check size={13} color="#12b76a" /> : <X size={13} color="#f04438" />}</div>;
              })}</div> : null}
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}

/* ---------------- 新建实验 ---------------- */

const APPS = ['智能客服助手', '行业研究报告撰写', '制度问答助手'];
const SETS = ['智能客服 · 线上回流集（36 条）', '客服 Agent 轨迹集（18 条）', '跨应用异常回归集（22 条）'];

interface DraftVariant { id: string; name: string; changes: Array<{ field: string; to: string }> }

function NewExperimentModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (exp: Experiment) => void }) {
  const [step, setStep] = useState(1);
  const [target, setTarget] = useState<TargetKind>('model');
  const [app, setApp] = useState(APPS[0]);
  const [setName, setSetName] = useState(SETS[0]);
  const [variants, setVariants] = useState<DraftVariant[]>([]);
  const [graders, setGraders] = useState<string[]>(['g-rule', 'g-judge-cs']);
  const [repeats, setRepeats] = useState(3);
  const [mock, setMock] = useState(true);

  useEffect(() => { if (open) { setStep(1); setTarget('model'); setVariants([]); setRepeats(3); setMock(true); } }, [open]);
  useEffect(() => {
    // 切换评测对象时给一个合理的默认变体与评测器
    const defaults: Record<TargetKind, DraftVariant> = {
      model: { id: 'n1', name: 'Qwen3-Max', changes: [{ field: '对话模型', to: 'Qwen3-Max' }] },
      prompt: { id: 'n1', name: '提示词 B 版', changes: [{ field: '系统提示词', to: '你是售后客服助手。退款问题必须给出时效与到账路径；涉及赔偿时说明需人工核定并转接。' }] },
      skill: { id: 'n1', name: '订单查询 v2', changes: [{ field: '工具「订单查询」', to: 'erp.example.com/v2/orders' }] },
      agent: { id: 'n1', name: '快速模式', changes: [{ field: '最大步数', to: '5' }, { field: '知识使用方式', to: '每轮先检索' }] },
    };
    setVariants([defaults[target]]);
    setGraders(target === 'agent' || target === 'skill' ? ['g-rule', 'g-traj-cs'] : ['g-rule', 'g-judge-cs']);
  }, [target]);

  const caseCount = Number(setName.match(/（(\d+) 条）/)?.[1] ?? 20);
  const runs = caseCount * (variants.length + 1) * repeats;
  const judgeRuns = graders.includes('g-judge-cs') || graders.includes('g-judge-report') ? runs : 0;
  const estimate = runs * 0.0021 + judgeRuns * 0.0012;

  const create = () => {
    const id = `exp-new-${Date.now()}`;
    const base: Variant = { id: 'v-base', name: '线上 v12', baseline: true, changes: [] };
    onCreate({
      id, name: `${app} · ${TARGET_META[target].name}对比：${variants.map((item) => item.name).join(' / ')}`, app, target, setName: setName.replace(/（.*）/, ''), caseCount, repeats, graders,
      status: 'running', progress: 0, createdAt: '刚刚', owner: '周敏',
      variants: [base, ...variants.map((item, index) => ({ id: `v-n${index}`, name: item.name, changes: item.changes.map((change) => ({ ...change, from: '线上配置' })) }))],
      summaries: [], groups: [], rows: [], verdict: { tone: 'ok', title: '运行中', detail: '' },
    });
  };

  const patchVariant = (id: string, patch: Partial<DraftVariant>) => setVariants((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  return (
    <Modal open={open} wide title="新建对比实验" icon={<FlaskConical size={18} color="var(--primary)" />} onClose={onClose}
      footer={<>
        <span className="faint grow">{step === 3 ? `共 ${runs} 次运行${judgeRuns ? ` + ${judgeRuns} 次评委打分` : ''}，预计 $${estimate.toFixed(2)}` : `第 ${step} / 3 步`}</span>
        {step > 1 ? <button className="btn" onClick={() => setStep(step - 1)}>上一步</button> : <button className="btn" onClick={onClose}>取消</button>}
        {step < 3 ? <button className="btn primary" disabled={step === 2 && !variants.length} onClick={() => setStep(step + 1)}>下一步</button> : <button className="btn primary" onClick={create}><Play size={14} />开始实验</button>}
      </>}>
      <div className="steps" style={{ marginBottom: 18 }}>
        {['评测什么', '配置变体', '评测器与运行'].map((label, index) => <div key={label} className="row" style={{ gap: 8 }}>{index ? <span className="step-line" /> : null}<div className={`step ${step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''}`}><span className="n">{step > index + 1 ? <Check size={13} /> : index + 1}</span>{label}</div></div>)}
      </div>

      {step === 1 ? <>
        <Field label="评测对象">
          <div className="grid c2" style={{ gap: 10 }}>
            {(Object.keys(TARGET_META) as TargetKind[]).map((key) => {
              const Icon = TARGET_ICON[key];
              return <button key={key} type="button" className={`method-card ${target === key ? 'active' : ''}`} onClick={() => setTarget(key)}>
                <span className="lab-target-icon" style={{ color: TARGET_META[key].color, background: `${TARGET_META[key].color}14` }}><Icon size={18} /></span>
                <div><h4>{TARGET_META[key].name}</h4><p>{TARGET_META[key].desc}</p></div>
              </button>;
            })}
          </div>
        </Field>
        <div className="form-grid">
          <Field label="应用"><select className="select" value={app} onChange={(event) => setApp(event.target.value)}>{APPS.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="评测集" hint="用同一批 Case 公平对比"><select className="select" value={setName} onChange={(event) => setSetName(event.target.value)}>{SETS.map((item) => <option key={item}>{item}</option>)}</select></Field>
        </div>
      </> : null}

      {step === 2 ? <>
        <div className="lab-variant base"><div className="row"><strong className="grow">基线：线上 v12</strong><Tag>不可修改</Tag></div><p className="faint">DeepSeek-V3.2 · 温度 0.2 · 提示词 v12 · 工具：订单查询 v1、创建售后工单、客户档案查询 · 最大步数 8</p></div>
        {variants.map((variant, index) => (
          <div key={variant.id} className="lab-variant">
            <div className="row" style={{ marginBottom: 10 }}><span className="lab-variant-no">变体 {index + 1}</span><input className="input sm" style={{ maxWidth: 260 }} value={variant.name} onChange={(event) => patchVariant(variant.id, { name: event.target.value })} /><span className="grow" />{variants.length > 1 ? <button className="btn ghost sm icon" aria-label="删除变体" onClick={() => setVariants(variants.filter((item) => item.id !== variant.id))}><X size={14} /></button> : null}</div>
            <VariantEditor target={target} variant={variant} onChange={(changes) => patchVariant(variant.id, { changes })} />
          </div>
        ))}
        <button className="btn sm" disabled={variants.length >= 4} onClick={() => setVariants([...variants, { id: `n${Date.now()}`, name: `变体 ${variants.length + 1}`, changes: [] }])}><Plus size={13} />添加变体</button>
        <span className="faint" style={{ marginLeft: 8 }}>最多 4 个变体；每个变体只记录相对基线的改动</span>
      </> : null}

      {step === 3 ? <>
        <Field label="评测器" hint="可多选，结果分别展示">
          <div className="col" style={{ gap: 8 }}>
            {GRADERS.map((grader) => {
              const on = graders.includes(grader.id);
              const recommended = grader.kind === 'trajectory' ? target === 'agent' || target === 'skill' : grader.kind === 'llm_judge' ? grader.id === 'g-judge-cs' && (target === 'model' || target === 'prompt') : true;
              return <button key={grader.id} type="button" className={`method-card ${on ? 'active' : ''}`} style={{ padding: 10 }} onClick={() => setGraders(on ? graders.filter((id) => id !== grader.id) : [...graders, grader.id])}>
                <input type="checkbox" readOnly checked={on} tabIndex={-1} style={{ marginTop: 3 }} />
                <div className="grow"><h4 style={{ fontSize: 13 }}>{grader.name}<Tag>{GRADER_META[grader.kind].name}</Tag>{recommended ? <Tag tone="green">推荐</Tag> : null}{grader.agreement != null && grader.agreement < 0.85 ? <Tag tone="orange">一致率 {Math.round(grader.agreement * 100)}%</Tag> : null}</h4><p>{grader.description}</p></div>
              </button>;
            })}
          </div>
        </Field>
        <div className="form-grid">
          <Field label="每条 Case 重复运行" hint="消除随机波动"><Slider value={repeats} min={1} max={5} onChange={setRepeats} suffix="次" /></Field>
          <Field label="副作用工具"><div className="row" style={{ height: 36 }}><Switch on={mock} onChange={setMock} label="模拟执行" /><span className="faint">模拟执行（推荐）</span></div></Field>
        </div>
        {mock ? <div className="notice ok"><ShieldCheck size={16} /><div><strong>副作用工具将模拟执行</strong><p>「创建售后工单」等会修改外部系统的工具不发真实请求，返回 Skill 单测中预设的结果，并记录调用参数供轨迹判定检查。<Dev s="todo" note="工具模拟执行" /></p></div></div>
          : <div className="notice warn"><TriangleAlert size={16} /><div><strong>将真实调用副作用工具</strong><p>评测会在外部系统中真实创建工单、修改数据，仅建议在测试环境使用。</p></div></div>}
      </> : null}
    </Modal>
  );
}

function VariantEditor({ target, variant, onChange }: { target: TargetKind; variant: DraftVariant; onChange: (changes: DraftVariant['changes']) => void }) {
  const get = (field: string) => variant.changes.find((item) => item.field === field)?.to ?? '';
  const set = (field: string, to: string) => onChange([...variant.changes.filter((item) => item.field !== field), ...(to ? [{ field, to }] : [])]);
  if (target === 'model') return <div className="form-grid">
    <Field label="对话模型"><select className="select" value={get('对话模型')} onChange={(event) => set('对话模型', event.target.value)}><option value="">与基线相同</option>{MODELS.filter((item) => item.type === 'LLM').map((item) => <option key={item.name}>{item.name}</option>)}</select></Field>
    <Field label="温度"><input className="input" placeholder="与基线相同（0.2）" value={get('温度')} onChange={(event) => set('温度', event.target.value)} /></Field>
  </div>;
  if (target === 'prompt') return <Field label="系统提示词" hint="与基线不同的部分会在报告中高亮"><textarea className="textarea mono" style={{ minHeight: 120, fontSize: 12 }} value={get('系统提示词')} onChange={(event) => set('系统提示词', event.target.value)} /></Field>;
  if (target === 'skill') return <div className="col" style={{ gap: 8 }}>
    {TOOLS.slice(0, 4).map((tool) => {
      const field = `工具「${tool.name}」`;
      const value = get(field);
      return <div key={tool.id} className="row" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
        <Wrench size={14} color={tool.color} /><strong style={{ fontSize: 13 }}>{tool.name}</strong><span className="grow" />
        <select className="select sm" style={{ width: 210 }} value={value} onChange={(event) => set(field, event.target.value)}>
          <option value="">与基线相同</option><option value="移除该工具">移除该工具</option>{tool.id === 't-order' ? <option>erp.example.com/v2/orders</option> : null}<option value="替换为 Mock 返回">替换为 Mock 返回</option>
        </select>
      </div>;
    })}
  </div>;
  return <div className="form-grid">
    <Field label="最大步数"><input className="input" type="number" placeholder="与基线相同（8）" value={get('最大步数')} onChange={(event) => set('最大步数', event.target.value)} /></Field>
    <Field label="知识使用方式"><select className="select" value={get('知识使用方式')} onChange={(event) => set('知识使用方式', event.target.value)}><option value="">与基线相同</option><option>作为工具，由 Agent 决定</option><option>每轮先检索</option></select></Field>
    <Field label="对话模型"><select className="select" value={get('对话模型')} onChange={(event) => set('对话模型', event.target.value)}><option value="">与基线相同</option>{MODELS.filter((item) => item.type === 'LLM').map((item) => <option key={item.name}>{item.name}</option>)}</select></Field>
    <Field label="转人工策略"><select className="select" value={get('转人工策略')} onChange={(event) => set('转人工策略', event.target.value)}><option value="">与基线相同</option><option>投诉即转人工</option><option>先尝试解决，两次失败再转</option></select></Field>
  </div>;
}

/* ============================== 评测器 ============================== */

export function GradersView() {
  const [open, setOpen] = useState<Grader | null>(null);
  return (
    <div className="lab-view">
      <div className="lab-intro">
        <div className="grow"><h2>评测器</h2><p>决定「怎样算通过」。规则判定便宜确定；LLM 评委按评分细则打分，需要人工标注校准；轨迹判定检查 Agent 的执行过程。</p></div>
        <button className="btn primary"><Plus size={15} />新建评测器</button>
      </div>
      <div className="grid c3">
        {(['rule', 'llm_judge', 'trajectory'] as const).map((kind) => (
          <div key={kind} className="card pad lab-grader-kind">
            <div className="row">{kind === 'rule' ? <Check size={16} /> : kind === 'llm_judge' ? <Sparkles size={16} /> : <Route size={16} />}<strong>{GRADER_META[kind].name}</strong>
              {kind === 'rule' ? <Dev s="ready" /> : kind === 'llm_judge' ? <Dev s="todo" /> : <Dev s="partial" note="Trace 已记录工具步骤" />}</div>
            <p className="faint">{GRADER_META[kind].desc}</p>
          </div>
        ))}
      </div>
      <div className="card table-scroll" style={{ marginTop: 16 }}>
        <table className="table">
          <thead><tr><th>评测器</th><th>类型</th><th>配置</th><th>可信度</th><th>使用中</th></tr></thead>
          <tbody>{GRADERS.map((grader) => (
            <tr key={grader.id} className="clickable" onClick={() => setOpen(grader)}>
              <td><strong>{grader.name}</strong><div className="faint">{grader.description}</div></td>
              <td><Tag>{GRADER_META[grader.kind].name}</Tag></td>
              <td className="faint">{grader.kind === 'llm_judge' ? `评委 ${grader.judgeModel} · ${grader.rubric?.length} 项细则 · ≥${grader.passScore} 分通过` : grader.kind === 'trajectory' ? `${grader.assertions?.length} 条断言` : '关键词 / 引用 / 期望输出'}</td>
              <td>{grader.agreement != null ? <AgreementTag value={grader.agreement} labels={grader.humanLabels ?? 0} /> : <span className="faint">确定性判定</span>}</td>
              <td>{grader.usedBy} 个评测集</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <GraderDrawer grader={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function AgreementTag({ value, labels }: { value: number; labels: number }) {
  return <span><Tag tone={value >= 0.85 ? 'green' : 'orange'}>与人工一致 {Math.round(value * 100)}%</Tag><div className="faint">{labels} 条人工标注</div></span>;
}

function GraderDrawer({ grader, onClose }: { grader: Grader | null; onClose: () => void }) {
  const toast = useToast();
  if (!grader) return null;
  return (
    <Drawer open wide title={<div className="row"><span>{grader.name}</span><Tag>{GRADER_META[grader.kind].name}</Tag></div>} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>取消</button><button className="btn primary" onClick={() => { toast('评测器已保存'); onClose(); }}>保存</button></>}>
      <Field label="名称"><input className="input" defaultValue={grader.name} /></Field>
      {grader.kind === 'llm_judge' ? <>
        <div className="form-grid">
          <Field label="评委模型" hint="建议与被测模型不同"><select className="select" defaultValue={grader.judgeModel}>{MODELS.filter((item) => item.type === 'LLM').map((item) => <option key={item.name}>{item.name}</option>)}</select></Field>
          <Field label="通过分数" hint="1–5 分"><input className="input" type="number" defaultValue={grader.passScore} /></Field>
        </div>
        <Field label="评分细则" hint="每项打 1–5 分，按权重加权">
          <div className="col" style={{ gap: 8 }}>{grader.rubric?.map((item) => <div key={item.name} className="lab-rubric"><strong>{item.name}</strong><span className="grow faint">{item.desc}</span><Tag>{item.weight}%</Tag></div>)}</div>
        </Field>
        <div className={`notice ${grader.agreement != null && grader.agreement >= 0.85 ? 'ok' : 'warn'}`}>
          {grader.agreement != null && grader.agreement >= 0.85 ? <CheckCircle2 size={16} /> : <TriangleAlert size={16} />}
          <div><strong>与人工判定一致率 {Math.round((grader.agreement ?? 0) * 100)}%（{grader.humanLabels} 条人工标注）</strong><p>{grader.agreement != null && grader.agreement >= 0.85 ? '可用于发布门禁。在实验报告里「人工改判」的 Case 会自动加入校准样本。' : '低于 85%，建议补充人工标注或细化评分细则后再用于门禁，目前仅作参考分。'}</p></div>
        </div>
        <div className="lab-calibration">
          <div className="faint" style={{ marginBottom: 6 }}>校准矩阵（人工 × 评委）</div>
          <table className="table"><thead><tr><th /><th>评委：通过</th><th>评委：未通过</th></tr></thead>
            <tbody><tr><td>人工：通过</td><td className="lab-cell-up">{Math.round((grader.humanLabels ?? 0) * (grader.agreement ?? 0) * 0.7)}</td><td>{Math.round((grader.humanLabels ?? 0) * (1 - (grader.agreement ?? 0)) * 0.4)}</td></tr>
              <tr><td>人工：未通过</td><td className="lab-cell-drop">{Math.round((grader.humanLabels ?? 0) * (1 - (grader.agreement ?? 0)) * 0.6)}</td><td className="lab-cell-up">{Math.round((grader.humanLabels ?? 0) * (grader.agreement ?? 0) * 0.3)}</td></tr></tbody>
          </table>
          <p className="faint" style={{ marginTop: 6 }}>左下角（红色）为「评委放过了人工认为不合格的回答」，对门禁风险最大，应优先复核。</p>
        </div>
      </> : null}
      {grader.kind === 'trajectory' ? <Field label="断言" hint="每行一条；基于 Trace 中记录的检索、工具、确认与转人工步骤判定">
        <textarea className="textarea" style={{ minHeight: 160 }} defaultValue={grader.assertions?.join('\n')} />
      </Field> : null}
      {grader.kind === 'rule' ? <p className="muted">内置评测器，规则在每条 Case 的判定标准中配置（必须包含、禁止出现、要求引用、与期望输出一致）。</p> : null}
    </Drawer>
  );
}

/* ============================== Skill 单测 ============================== */

export function SkillTestsView() {
  const toast = useToast();
  const [openId, setOpenId] = useState(SKILL_SUITES[0].id);
  const suite = SKILL_SUITES.find((item) => item.id === openId) ?? SKILL_SUITES[0];
  return (
    <div className="lab-view">
      <div className="lab-intro">
        <div className="grow"><h2>Skill 单测 <Dev s="partial" note="已有单次工具测试接口" /></h2><p>不经过模型，直接用参数调用工具并校验返回。用来区分「工具坏了」和「Agent 不会用工具」；有副作用的工具在评测中模拟执行。</p></div>
        <button className="btn" onClick={() => toast('已运行全部 Skill 单测')}><Play size={14} />全部运行</button>
      </div>
      <div className="lab-skill-layout">
        <aside className="card">
          {SKILL_SUITES.map((item) => {
            const passed = item.cases.filter((c) => c.pass).length;
            return <button key={item.id} className={`lab-skill-item ${item.id === suite.id ? 'active' : ''}`} onClick={() => setOpenId(item.id)}>
              <Wrench size={15} /><span className="grow"><strong>{item.tool}</strong><small>{item.kind} · {item.version}{item.sideEffect ? ' · 有副作用' : ''}</small></span>
              <Tag tone={passed === item.cases.length ? 'green' : 'red'}>{passed}/{item.cases.length}</Tag>
            </button>;
          })}
        </aside>
        <section className="card pad">
          <div className="row" style={{ marginBottom: 12 }}>
            <strong style={{ fontSize: 16 }}>{suite.tool}</strong><Tag>{suite.version}</Tag>{suite.sideEffect ? <Tag tone="orange">有副作用</Tag> : null}
            <span className="grow" /><span className="faint">最近运行：{suite.lastRun}</span>
            <button className="btn sm" onClick={() => toast(`已运行「${suite.tool}」的 ${suite.cases.length} 条单测`)}><Play size={13} />运行</button>
          </div>
          {suite.sideEffect ? <div className={`notice ${suite.mockMode ? 'ok' : 'warn'}`} style={{ marginBottom: 12 }}><ShieldCheck size={16} /><div><strong>模拟执行：{suite.mockMode ? '开启' : '关闭'}</strong><p>开启后，单测与对比实验都不会真实调用该工具；返回下表中每条用例的预设结果，并校验调用参数。</p></div></div> : null}
          <table className="table">
            <thead><tr><th>用例</th><th>调用参数</th><th>期望</th><th>结果</th><th>耗时</th></tr></thead>
            <tbody>{suite.cases.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.name}</strong></td>
                <td><code style={{ fontSize: 12 }}>{item.args}</code></td>
                <td className="faint">{item.expect}</td>
                <td>{item.pass ? <Tag tone="green"><CheckCircle2 size={12} />通过</Tag> : <Tag tone="red"><XCircle size={12} />失败</Tag>}{item.note ? <div className="faint" style={{ marginTop: 3, color: item.pass ? undefined : '#b42318' }}>{item.note}</div> : null}</td>
                <td className="faint">{item.ms >= 1000 ? `${(item.ms / 1000).toFixed(1)}s` : `${item.ms}ms`}</td>
              </tr>
            ))}</tbody>
          </table>
          <button className="btn sm" style={{ marginTop: 10 }}><Plus size={13} />添加用例</button>
        </section>
      </div>
    </div>
  );
}
