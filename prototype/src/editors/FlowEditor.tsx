import {
  addEdge, Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow,
  type Connection, type Edge,
} from '@xyflow/react';
import { Bug, CheckCircle2, Copy, Hourglass, LoaderCircle, Play, Plus, Search, Settings, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dev, Field, Slider, Switch, Tag, useToast } from '../components/ui';
import { KNOWLEDGE_BASES, MODELS, TOOLS, type AppItem } from '../data/mock';
import { DEF, NODE_DEFS, nodeTypes, type FlowData, type FlowNode, type NodeKind } from '../flow/defs';
import { graphFor, NODE_OUTPUT } from '../flow/graphs';
import { ListEditor, PromptBox } from './common';

const BRANCHING: NodeKind[] = ['classify', 'ifelse', 'choice'];
const INTERACTIVE: NodeKind[] = ['form', 'choice'];

function planLevels(nodes: FlowNode[], edges: Edge[]): string[][] {
  const byId = new Map(nodes.map((x) => [x.id, x]));
  const indeg = new Map<string, number>();
  const chosen = edges.filter((ed) => {
    const src = byId.get(ed.source);
    return !src || !BRANCHING.includes(src.data.kind) || ed.sourceHandle === 'b0';
  });
  const reach = new Set<string>(['start']);
  let grew = true;
  while (grew) {
    grew = false;
    for (const ed of chosen) if (reach.has(ed.source) && !reach.has(ed.target)) { reach.add(ed.target); grew = true; }
  }
  const live = chosen.filter((ed) => reach.has(ed.source) && reach.has(ed.target));
  for (const id of reach) indeg.set(id, 0);
  for (const ed of live) indeg.set(ed.target, (indeg.get(ed.target) ?? 0) + 1);
  const levels: string[][] = [];
  let frontier = [...reach].filter((id) => indeg.get(id) === 0);
  while (frontier.length) {
    levels.push(frontier);
    const next: string[] = [];
    for (const id of frontier) for (const ed of live.filter((x) => x.source === id)) {
      indeg.set(ed.target, (indeg.get(ed.target) ?? 0) - 1);
      if (indeg.get(ed.target) === 0) next.push(ed.target);
    }
    frontier = next;
  }
  return levels;
}

function NodeLibrary({ onAdd, onClose }: { onAdd: (k: NodeKind) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const cats = [...new Set(NODE_DEFS.filter((d) => d.kind !== 'sys').map((d) => d.cat))];
  return (
    <div className="card" style={{ width: 260, maxHeight: 'calc(100% - 24px)', overflow: 'auto', boxShadow: 'var(--shadow-lg)', padding: 12 }}>
      <div className="row" style={{ marginBottom: 8 }}><strong className="grow">节点库</strong><button className="btn ghost sm icon" aria-label="关闭节点库" onClick={onClose}><X size={14} /></button></div>
      <div className="search-box" style={{ marginBottom: 8 }}><Search size={14} /><input className="input sm" placeholder="搜索节点" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {cats.map((c) => {
        const list = NODE_DEFS.filter((d) => d.cat === c && d.kind !== 'sys' && (!q || d.name.includes(q)));
        if (!list.length) return null;
        return (
          <div key={c} style={{ marginBottom: 8 }}>
            <div className="faint" style={{ margin: '6px 4px' }}>{c}</div>
            {list.map((d) => (
              <div key={d.kind} draggable onDragStart={(e) => { e.dataTransfer.setData('application/zs-node', d.kind); e.dataTransfer.effectAllowed = 'move'; }}
                onClick={() => onAdd(d.kind)} className="sub-link" style={{ cursor: 'grab', alignItems: 'flex-start' }} title="点击添加或拖到画布">
                <span className="avatar-tile sm" style={{ background: d.color, width: 22, height: 22 }}><d.icon size={12} /></span>
                <div className="grow"><div style={{ fontSize: 13 }}>{d.name}<Dev s={d.dev} /></div><div className="faint" style={{ fontSize: 11 }}>{d.desc}</div></div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function VarRef({ value }: { value: string }) {
  return (
    <select className="select sm" defaultValue={value}>
      <option>{value}</option>
      <option>{'{{流程开始.用户问题}}'}</option>
      <option>{'{{收集报告需求.主题}}'}</option>
      <option>{'{{检索行业研究库.引用内容}}'}</option>
      <option>{'{{全局变量.用户部门}}'}</option>
    </select>
  );
}

function NodeConfig({ node, onChange, onDelete }: { node: FlowNode; onChange: (d: Partial<FlowData>) => void; onDelete: () => void }) {
  const def = DEF[node.data.kind];
  const k = node.data.kind;
  const [limit, setLimit] = useState(8000);
  const [score, setScore] = useState(0.4);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="row" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <span className="avatar-tile sm" style={{ background: def.color }}><def.icon size={14} /></span>
        <input className="input sm grow" style={{ fontWeight: 600, border: '1px solid transparent' }} value={node.data.title} onChange={(e) => onChange({ title: e.target.value })} aria-label="节点名称" />
        <Dev s={def.dev} />
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <p className="faint" style={{ marginBottom: 14 }}>{def.desc}</p>
        {k === 'sys' ? <>
          <Field label="开场白"><textarea className="textarea" style={{ minHeight: 60 }} defaultValue="告诉我报告主题、读者和篇幅，我会先给出大纲供你确认。" /></Field>
          <Field label="全局变量" hint="对话开始前由用户或 API 传入">
            <table className="table" style={{ fontSize: 12 }}><tbody><tr><td className="mono">user_dept</td><td>用户部门</td><td><Tag>系统注入</Tag></td></tr><tr><td className="mono">style</td><td>行文风格</td><td><Tag>下拉</Tag></td></tr></tbody></table>
          </Field>
          <div className="col" style={{ gap: 10 }}>
            <div className="row"><span className="grow">允许上传文件</span><Switch on onChange={() => undefined} label="上传" /></div>
            <div className="row"><span className="grow">猜你想问</span><Switch on onChange={() => undefined} label="猜你想问" /></div>
            <div className="row"><span className="grow">语音输入</span><Switch on={false} onChange={() => undefined} label="语音" /></div>
          </div>
        </> : null}
        {k === 'start' ? <Field label="输出"><div className="col"><Tag>用户问题 · string</Tag><Tag>上传文件 · file[]</Tag><Tag>对话历史 · messages</Tag></div></Field> : null}
        {k === 'form' ? <Field label="表单字段" hint="流程会暂停，等待用户提交">
          <table className="table" style={{ fontSize: 12 }}><thead><tr><th>字段</th><th>类型</th><th>必填</th></tr></thead><tbody>
            <tr><td>报告主题</td><td>单行文本</td><td>是</td></tr><tr><td>读者</td><td>下拉：管理层 / 业务部门 / 客户</td><td>是</td></tr><tr><td>篇幅</td><td>下拉：3000 / 6000 / 10000 字</td><td>是</td></tr><tr><td>联网补充</td><td>开关</td><td>否</td></tr>
          </tbody></table>
        </Field> : null}
        {k === 'kb' ? <>
          <Field label="知识库"><div className="row wrap">{KNOWLEDGE_BASES.slice(2, 4).map((kb) => <Tag key={kb.id} tone="blue">{kb.name}</Tag>)}<button className="btn sm"><Plus size={12} />选择</button></div></Field>
          <Field label="检索问题"><VarRef value="{{收集报告需求.主题}}" /></Field>
          <Field label="检索模式"><div className="seg"><button>语义</button><button>全文</button><button className="active">混合</button></div></Field>
          <Field label="引用上限" hint="tokens"><Slider value={limit} min={1000} max={20000} step={1000} onChange={setLimit} /></Field>
          <Field label="最低相关度"><Slider value={score} min={0} max={1} step={0.05} onChange={setScore} /></Field>
          <div className="row form-item"><span className="grow">结果重排</span><Switch on onChange={() => undefined} label="重排" /></div>
          <Field label="元数据过滤" hint="按导入时抽取的元数据"><input className="input sm" defaultValue="发布时间 ≥ 2025-01-01" /></Field>
        </> : null}
        {k === 'llm' || k === 'classify' || k === 'extract' || k === 'rewrite' || k === 'agent' ? (
          <Field label="模型"><select className="select sm">{MODELS.filter((m) => m.type === 'LLM').map((m) => <option key={m.name}>{m.name}</option>)}</select></Field>
        ) : null}
        {k === 'llm' ? <>
          <Field label="系统提示词"><PromptBox rows={7} vars={['主题', '读者', '篇幅']} value={'你是资深行业分析师。基于引用资料，为「{{主题}}」写一份面向「{{读者}}」的报告大纲：\n- 4–6 个一级章节，每章 2–4 个要点\n- 每个要点标注依据的资料编号\n- 输出 JSON：{"chapters":[{"title":"","points":[]}]}'} /></Field>
          <Field label="知识库引用"><VarRef value="{{检索行业研究库.引用内容}}" /></Field>
          <Field label="携带历史" hint="轮"><Slider value={6} min={0} max={20} onChange={() => undefined} /></Field>
          <div className="row"><span className="grow">流式输出给用户</span><Switch on={false} onChange={() => undefined} label="流式" /></div>
        </> : null}
        {k === 'classify' ? <>
          <Field label="分类依据"><VarRef value="{{提取合同要素.合同类型}}" /></Field>
          <Field label="分类" hint="每个分类对应一个输出分支"><ListEditor items={node.data.branches ?? []} placeholder="新增分类" /></Field>
          <Field label="背景知识"><textarea className="textarea" style={{ minHeight: 60 }} defaultValue="技术开发、维保、咨询类合同都归入「服务 / 技术合同」。" /></Field>
        </> : null}
        {k === 'extract' ? <Field label="提取字段">
          <table className="table" style={{ fontSize: 12 }}><thead><tr><th>字段</th><th>说明</th><th>类型</th></tr></thead><tbody>
            {[['合同类型', '采购/销售/服务/其他', 'string'], ['甲方', '', 'string'], ['乙方', '', 'string'], ['合同金额', '含税总价', 'number'], ['期限', '起止日期', 'string']].map(([a, b, c]) => <tr key={a}><td>{a}</td><td className="faint">{b}</td><td><Tag>{c}</Tag></td></tr>)}
          </tbody></table>
        </Field> : null}
        {k === 'ifelse' ? <Field label="条件">
          <div className="row"><VarRef value="{{逐条比对.高风险数量}}" /><select className="select sm" style={{ width: 80 }}><option>&gt;</option><option>=</option><option>包含</option></select><input className="input sm" style={{ width: 60 }} defaultValue="0" /></div>
          <button className="btn sm ghost" style={{ marginTop: 6 }}><Plus size={12} />添加条件（且 / 或）</button>
        </Field> : null}
        {k === 'choice' ? <>
          <Field label="展示给用户的内容"><VarRef value="{{生成大纲.回复}}" /></Field>
          <Field label="选项" hint="每个选项对应一个分支"><ListEditor items={node.data.branches ?? []} placeholder="新增选项" /></Field>
          <div className="row"><span className="grow">允许用户补充说明</span><Switch on onChange={() => undefined} label="补充说明" /></div>
        </> : null}
        {k === 'loop' ? <>
          <Field label="循环数组"><VarRef value="{{生成大纲.chapters}}" /></Field>
          <Field label="并行数"><Slider value={3} min={1} max={10} onChange={() => undefined} /></Field>
          <Field label="子流程"><div className="card pad" style={{ background: 'var(--bg-soft)', fontSize: 13 }}>知识库搜索（按章节标题）→ AI 对话（撰写本章，800–1500 字）<br /><button className="btn sm" style={{ marginTop: 8 }}>编辑子流程</button></div></Field>
        </> : null}
        {k === 'template' || k === 'answer' ? <Field label={k === 'answer' ? '回复内容' : '模板'}>
          <textarea className="textarea mono" style={{ minHeight: 120 }} defaultValue={k === 'answer' ? '{{合并全文与引用.结果}}\n\n📎 [下载 Word]({{导出 Word.文件链接}})' : '# {{主题}}\n\n{{#each 逐章撰写.结果}}\n## {{title}}\n{{content}}\n{{/each}}\n\n## 参考文献\n{{引用列表}}'} />
        </Field> : null}
        {k === 'code' ? <Field label="代码" hint="Python 3.11 · 沙箱 · 超时 10s">
          <textarea className="textarea mono" style={{ minHeight: 160, background: '#0f1729', color: '#d5def0' }} defaultValue={'def main(tasks, metrics):\n    done = sum(1 for t in tasks if t["status"] == "done")\n    delayed = [t for t in tasks if t["overdue"]]\n    return {\n        "completion": round(done / len(tasks), 2),\n        "delayed": len(delayed),\n    }'} />
        </Field> : null}
        {k === 'http' ? <>
          <Field label="请求"><div className="row"><select className="select sm" style={{ width: 90 }}><option>GET</option><option>POST</option></select><input className="input sm mono" defaultValue="https://pm.example.com/api/projects/{{项目}}/tasks" /></div></Field>
          <Field label="Headers"><input className="input sm mono" defaultValue="Authorization: Bearer {{密钥.PM_TOKEN}}" /></Field>
          <Field label="超时与重试"><div className="row"><input className="input sm" defaultValue="10s" /><input className="input sm" defaultValue="重试 2 次" /></div></Field>
        </> : null}
        {k === 'tool' || k === 'agent' ? <Field label="工具"><select className="select sm">{TOOLS.map((t) => <option key={t.id}>{t.name} · {t.kind}</option>)}</select></Field> : null}
        {k === 'export' ? <>
          <Field label="文档模板"><select className="select sm"><option>公司研究报告 v2（封面 + 目录 + 页眉）</option><option>通用 Word</option></select></Field>
          <Field label="格式"><div className="seg"><button className="active">Word</button><button>PDF</button><button>Markdown</button></div></Field>
        </> : null}
        {k === 'doc_parse' ? <>
          <Field label="文件"><VarRef value="{{流程开始.上传文件}}" /></Field>
          <div className="row form-item"><span className="grow">扫描件 OCR</span><Switch on onChange={() => undefined} label="OCR" /></div>
          <div className="row"><span className="grow">保留表格结构</span><Switch on onChange={() => undefined} label="表格" /></div>
        </> : null}
        <div className="divider" />
        <div className="faint" style={{ marginBottom: 6 }}>输出变量</div>
        <div className="row wrap" style={{ gap: 4 }}>{(k === 'kb' ? ['引用内容', '引用数量'] : k === 'llm' ? ['回复', 'tokens'] : k === 'extract' ? ['合同类型', '甲方', '金额'] : ['结果']).map((v) => <Tag key={v}>{v}</Tag>)}</div>
        <div className="row" style={{ marginTop: 10 }}><span className="grow">失败时</span><select className="select sm" style={{ width: 150 }}><option>终止流程并提示</option><option>重试 2 次</option><option>走异常分支</option></select></div>
      </div>
      {k !== 'start' && k !== 'sys' ? (
        <div className="row" style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          <button className="btn sm"><Copy size={13} />复制</button>
          <button className="btn sm danger" onClick={onDelete}><Trash2 size={13} />删除节点</button>
        </div>
      ) : null}
    </div>
  );
}

type Trace = { id: string; status: 'running' | 'success' | 'waiting'; ms?: number };

function DebugPanel({ app, nodes, trace, running, waitingKind, onStart, onResume, onClose, onPick, finished }: {
  app: AppItem; nodes: FlowNode[]; trace: Trace[]; running: boolean; waitingKind?: NodeKind; finished: boolean;
  onStart: () => void; onResume: () => void; onClose: () => void; onPick: (id: string) => void;
}) {
  const navigate = useNavigate();
  const byId = new Map(nodes.map((x) => [x.id, x]));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="row" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}><Bug size={16} color="var(--primary)" /><strong className="grow">调试运行</strong><Tag tone="orange">草稿</Tag><button className="btn ghost sm icon" aria-label="关闭调试" onClick={onClose}><X size={14} /></button></div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <Field label="用户问题"><textarea className="textarea" style={{ minHeight: 60 }} defaultValue={app.id === 'app-contract' ? '帮我审一下这份采购合同' : app.id === 'app-weekly' ? '生成储能二期项目本周周报' : '帮我写一份储能行业竞争格局报告'} /></Field>
        {app.id === 'app-contract' ? <div className="row" style={{ marginBottom: 12 }}><Tag tone="blue">📎 年度框架采购合同-华东.pdf</Tag></div> : null}
        <button className="btn primary" style={{ width: '100%' }} disabled={running && !finished} onClick={onStart}>{running && !finished ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}{finished ? '重新运行' : '运行'}</button>
        {trace.length ? <div className="section-title" style={{ fontSize: 13 }}>执行过程</div> : null}
        <div className="col" style={{ gap: 6 }}>
          {trace.map((t) => {
            const node = byId.get(t.id);
            if (!node) return null;
            const def = DEF[node.data.kind];
            return (
              <div key={t.id} className="chunk-card" style={{ padding: '8px 10px', cursor: 'pointer' }} onClick={() => onPick(t.id)}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="avatar-tile sm" style={{ background: def.color, width: 20, height: 20 }}><def.icon size={11} /></span>
                  <span className="grow" style={{ fontSize: 13 }}>{node.data.title}</span>
                  {t.status === 'running' ? <LoaderCircle size={14} className="spin" color="#3370ff" /> : t.status === 'waiting' ? <Hourglass size={14} color="#dd2590" /> : <><span className="faint">{t.ms}ms</span><CheckCircle2 size={14} color="#12b76a" /></>}
                </div>
                {t.status === 'success' && NODE_OUTPUT[node.data.kind] ? <div className="mono faint" style={{ marginTop: 4, whiteSpace: 'pre-wrap', fontSize: 11 }}>{app.id !== 'app-report' && (node.data.kind === 'start' || node.data.kind === 'form') ? '已完成' : NODE_OUTPUT[node.data.kind]}</div> : null}
              </div>
            );
          })}
        </div>
        {waitingKind === 'form' ? (
          <div className="card pad" style={{ marginTop: 12, borderColor: '#fcceee', background: 'var(--pink-50)' }}>
            <strong style={{ fontSize: 13 }}>流程等待用户填写表单</strong>
            <div className="col" style={{ gap: 8, marginTop: 10 }}>
              <input className="input sm" defaultValue={app.id === 'app-weekly' ? '储能二期 · 10-21 ~ 10-27' : '2026 年储能行业竞争格局'} />
              {app.id !== 'app-weekly' ? <div className="row"><select className="select sm"><option>公司管理层</option></select><select className="select sm"><option>约 6000 字</option></select></div> : null}
              <button className="btn primary sm" onClick={onResume}>提交</button>
            </div>
          </div>
        ) : null}
        {waitingKind === 'choice' ? (
          <div className="card pad" style={{ marginTop: 12, borderColor: '#fcceee', background: 'var(--pink-50)' }}>
            <strong style={{ fontSize: 13 }}>流程等待用户确认大纲</strong>
            <ol style={{ fontSize: 13, paddingLeft: 18, margin: '8px 0', color: 'var(--text-2)' }}><li>行业概况与 2026 年装机预测</li><li>竞争格局：集成商、电芯厂、新进入者</li><li>价格与毛利趋势</li><li>对公司的机会与建议</li></ol>
            <div className="row"><button className="btn primary sm" onClick={onResume}>确认，开始撰写</button><button className="btn sm">修改后重新生成</button></div>
          </div>
        ) : null}
        {finished ? (
          <div className="card pad" style={{ marginTop: 12, borderColor: '#d1fadf', background: 'var(--green-50)' }}>
            <div className="row"><CheckCircle2 size={16} color="#12b76a" /><strong className="grow">运行完成</strong><span className="faint">共 {trace.length} 个节点 · {(trace.reduce((a, t) => a + (t.ms ?? 0), 0) / 1000).toFixed(1)}s</span></div>
            <button className="btn sm" style={{ marginTop: 10 }} onClick={() => navigate(`/chat/${app.id}`)}>在业务端完整体验</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Canvas({ app }: { app: AppItem }) {
  const toast = useToast();
  const initial = useMemo(() => graphFor(app.id), [app.id]);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [libOpen, setLibOpen] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [debug, setDebug] = useState(false);
  const [trace, setTrace] = useState<Trace[]>([]);
  const [running, setRunning] = useState(false);
  const [level, setLevel] = useState(-1);
  const [waiting, setWaiting] = useState<NodeKind | undefined>();
  const [finished, setFinished] = useState(false);
  const levels = useRef<string[][]>([]);
  const wrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, setCenter } = useReactFlow();

  const patchNodes = useCallback((ids: string[], patch: Partial<FlowData>) => {
    setNodes((ns) => ns.map((x) => (ids.includes(x.id) ? { ...x, data: { ...x.data, ...patch } } : x)));
  }, [setNodes]);

  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, id: `${c.source}-${c.sourceHandle ?? 'o'}-${c.target}` }, es)), [setEdges]);

  const addNode = useCallback((kind: NodeKind, pos?: { x: number; y: number }) => {
    const def = DEF[kind];
    const rect = wrapper.current?.getBoundingClientRect();
    const position = pos ?? screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 800) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 600) / 2 });
    const id = `${kind}-${Date.now()}`;
    const branches = kind === 'classify' ? ['分类 1', '分类 2'] : kind === 'ifelse' ? ['条件成立', '否则'] : kind === 'choice' ? ['选项 1', '选项 2'] : undefined;
    setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), { id, type: 'flow', position, selected: true, data: { kind, title: def.name, lines: [def.desc], branches } }]);
    setSelected(id);
    setDebug(false);
  }, [screenToFlowPosition, setNodes]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData('application/zs-node') as NodeKind;
    if (kind) addNode(kind, screenToFlowPosition({ x: e.clientX - 120, y: e.clientY - 20 }));
  };

  const start = () => {
    levels.current = planLevels(nodes, edges);
    const live = new Set(levels.current.flat());
    setNodes((ns) => ns.map((x) => ({ ...x, data: { ...x.data, status: x.data.kind === 'sys' ? 'idle' : live.has(x.id) ? 'idle' : 'skipped', ms: undefined } })));
    setEdges((es) => es.map((x) => ({ ...x, animated: false, style: undefined })));
    setTrace([]);
    setFinished(false);
    setWaiting(undefined);
    setRunning(true);
    setLevel(0);
  };

  useEffect(() => {
    if (!running || level < 0 || waiting) return undefined;
    const ids = levels.current[level];
    if (!ids) { setFinished(true); return undefined; }
    patchNodes(ids, { status: 'running' });
    setTrace((t) => [...t, ...ids.map((id) => ({ id, status: 'running' as const }))]);
    setEdges((es) => es.map((x) => (ids.includes(x.target) && levels.current.slice(0, level).flat().includes(x.source) ? { ...x, animated: true, style: { stroke: '#3370ff', strokeWidth: 2 } } : x)));
    const timer = window.setTimeout(() => {
      const node = nodes.find((x) => ids.includes(x.id) && INTERACTIVE.includes(x.data.kind));
      if (node) {
        patchNodes([node.id], { status: 'waiting' });
        setTrace((t) => t.map((x) => (x.id === node.id ? { ...x, status: 'waiting' } : x)));
        setWaiting(node.data.kind);
        return;
      }
      const ms = Object.fromEntries(ids.map((id) => [id, 200 + Math.round(Math.random() * 1600)]));
      setNodes((ns) => ns.map((x) => (ids.includes(x.id) ? { ...x, data: { ...x.data, status: 'success', ms: ms[x.id] } } : x)));
      setTrace((t) => t.map((x) => (ids.includes(x.id) ? { ...x, status: 'success', ms: ms[x.id] } : x)));
      setLevel((l) => l + 1);
    }, 750);
    return () => window.clearTimeout(timer);
    // nodes 只用于查找交互节点类型，不作为依赖，避免状态更新导致重复调度
  }, [running, level, waiting, patchNodes, setEdges, setNodes]);

  const resume = () => {
    const ids = levels.current[level];
    setNodes((ns) => ns.map((x) => (ids.includes(x.id) ? { ...x, data: { ...x.data, status: 'success', ms: 4200 } } : x)));
    setTrace((t) => t.map((x) => (ids.includes(x.id) ? { ...x, status: 'success', ms: 4200 } : x)));
    setWaiting(undefined);
    setLevel((l) => l + 1);
  };

  const closeDebug = () => {
    setDebug(false);
    setRunning(false);
    setLevel(-1);
    setWaiting(undefined);
    setNodes((ns) => ns.map((x) => ({ ...x, data: { ...x.data, status: undefined, ms: undefined } })));
    setEdges((es) => es.map((x) => ({ ...x, animated: false, style: undefined })));
  };

  const selectedNode = nodes.find((x) => x.id === selected);

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div ref={wrapper} style={{ flex: 1, position: 'relative', background: '#f7f8fa' }} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={onDrop}>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onNodeClick={(_, nd) => { setSelected(nd.id); if (!running) setDebug(false); }} onPaneClick={() => setSelected(null)}
          defaultViewport={{ x: 330, y: 200, zoom: 0.72 }} minZoom={0.2} maxZoom={1.6} deleteKeyCode={['Backspace', 'Delete']}
          defaultEdgeOptions={{ style: { strokeWidth: 1.6, stroke: '#a4b0c4' } }}>
          <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#d0d5dd" />
          <MiniMap pannable zoomable style={{ width: 160, height: 100 }} nodeColor={(nd) => DEF[(nd.data as FlowData).kind].color} />
          <Controls showInteractive={false} position="bottom-center" orientation="horizontal" />
          <Panel position="top-left">
            {libOpen ? <NodeLibrary onAdd={(k) => addNode(k)} onClose={() => setLibOpen(false)} /> : <button className="btn" style={{ boxShadow: 'var(--shadow)' }} onClick={() => setLibOpen(true)}><Plus size={15} />添加节点</button>}
          </Panel>
          <Panel position="top-right">
            <div className="row">
              <span className="faint" style={{ background: '#fff', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>{nodes.length} 个节点 · {edges.length} 条连线</span>
              <button className="btn" style={{ boxShadow: 'var(--shadow)' }} onClick={() => { const s = nodes.find((x) => x.data.kind === 'sys'); if (s) { setSelected(s.id); setDebug(false); setCenter(s.position.x + 124, s.position.y + 40, { zoom: 1, duration: 400 }); } else toast('当前流程未配置系统节点'); }}><Settings size={14} />系统配置</button>
              <button className="btn primary" style={{ boxShadow: 'var(--shadow)' }} onClick={() => { setDebug(true); setSelected(null); }}><Bug size={14} />运行调试</button>
            </div>
          </Panel>
        </ReactFlow>
      </div>
      {debug || selectedNode ? (
        <aside style={{ width: 380, flex: 'none', borderLeft: '1px solid var(--border)', background: '#fff' }}>
          {debug ? (
            <DebugPanel app={app} nodes={nodes} trace={trace} running={running} finished={finished} waitingKind={waiting} onStart={start} onResume={resume} onClose={closeDebug}
              onPick={(id) => { const nd = nodes.find((x) => x.id === id); if (nd) setCenter(nd.position.x + 124, nd.position.y + 40, { zoom: 0.9, duration: 400 }); }} />
          ) : selectedNode ? (
            <NodeConfig key={selectedNode.id} node={selectedNode} onChange={(d) => patchNodes([selectedNode.id], d)}
              onDelete={() => { setNodes((ns) => ns.filter((x) => x.id !== selectedNode.id)); setEdges((es) => es.filter((x) => x.source !== selectedNode.id && x.target !== selectedNode.id)); setSelected(null); toast('节点已删除'); }} />
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}

export function FlowEditor({ app }: { app: AppItem }) {
  return <ReactFlowProvider><Canvas app={app} /></ReactFlowProvider>;
}
