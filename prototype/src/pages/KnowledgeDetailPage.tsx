import {
  AlertCircle, ArrowLeft, Blocks, ChevronRight, FileText, FlaskConical, Globe, Hash, LoaderCircle, MoreHorizontal, Plus, RefreshCw,
  Search, Settings2, Sparkles, Table2, Trash2, Type, Upload, Wand2,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  appById, CHUNK_METHODS, CHUNKS, COLLECTIONS, KB_TYPE_META, kbById, METHOD_NAME, MODELS, type ChunkItem, type ChunkMethodKey, type Collection,
} from '../data/mock';
import { Dev, Drawer, Field, Icon, Modal, Slider, Switch, Tag, useToast } from '../components/ui';
import { HealthTag } from './KnowledgeListPage';

const SOURCE_ICON: Record<Collection['source'], ReactNode> = {
  file: <FileText size={17} color="#3370ff" />,
  web: <Globe size={17} color="#12b76a" />,
  text: <Type size={17} color="#7a5af8" />,
  qa_csv: <Table2 size={17} color="#0e9384" />,
  feishu: <Blocks size={17} color="#3370ff" />,
};

export function KnowledgeDetailPage() {
  const { kbId = '' } = useParams();
  const kb = kbById(kbId) ?? kbById('kb-product')!;
  const base = `/knowledge/${kb.id}`;
  return (
    <div className="sub-layout">
      <aside className="sub-side">
        <Link className="back" to="/knowledge"><ArrowLeft size={14} />全部知识库</Link>
        <div className="row" style={{ padding: '0 6px 14px', alignItems: 'flex-start' }}>
          <span className="avatar-tile" style={{ background: kb.color }}><Icon name="Database" size={18} /></span>
          <div className="grow"><strong className="ellipsis" style={{ display: 'block' }}>{kb.name}</strong><span className="faint">{KB_TYPE_META[kb.type].name}</span></div>
        </div>
        <NavLink end to={base} className={({ isActive }) => `sub-link ${isActive ? 'active' : ''}`}><FileText size={16} />数据集</NavLink>
        <NavLink to={`${base}/search`} className={({ isActive }) => `sub-link ${isActive ? 'active' : ''}`}><FlaskConical size={16} />检索测试</NavLink>
        <NavLink to={`${base}/settings`} className={({ isActive }) => `sub-link ${isActive ? 'active' : ''}`}><Settings2 size={16} />配置</NavLink>
        <div className="divider" />
        <dl className="kv" style={{ padding: '0 6px', gridTemplateColumns: '64px 1fr' }}>
          <dt>文件</dt><dd>{kb.collections}</dd>
          <dt>分块</dt><dd>{kb.chunks.toLocaleString()}</dd>
          <dt>索引模型</dt><dd>{kb.embedding}</dd>
          <dt>状态</dt><dd><HealthTag health={kb.health} /></dd>
        </dl>
        <div className="divider" />
        <div className="faint" style={{ padding: '0 6px 6px' }}>引用本库的应用</div>
        {kb.usedBy.map((id) => { const a = appById(id)!; return <Link key={id} to={`/apps/${id}`} className="sub-link" style={{ fontSize: 13 }}><Icon name={a.icon} size={15} />{a.name}</Link>; })}
      </aside>
      <section className="sub-main">
        <Routes>
          <Route index element={<CollectionsView kbId={kb.id} />} />
          <Route path="collection/:cid" element={<ChunksView kbId={kb.id} />} />
          <Route path="search" element={<SearchTestView />} />
          <Route path="settings" element={<SettingsView kbId={kb.id} />} />
        </Routes>
      </section>
    </div>
  );
}

/* ------------------------------ 数据集 ------------------------------ */

function StatusCell({ c }: { c: Collection }) {
  if (c.status === 'ready') return <Tag tone="green">已就绪</Tag>;
  if (c.status === 'queued') return <Tag>排队中</Tag>;
  if (c.status === 'indexing') return (
    <div style={{ width: 120 }}><div className="row faint" style={{ marginBottom: 4 }}><LoaderCircle size={12} className="spin" />索引中 {c.progress}%</div><div className="progress"><i style={{ width: `${c.progress}%` }} /></div></div>
  );
  return <div><Tag tone="red"><AlertCircle size={12} />失败</Tag><div className="faint" style={{ marginTop: 4, maxWidth: 200 }}>{c.error}</div></div>;
}

function CollectionsView({ kbId }: { kbId: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | Collection['status']>('all');
  const [rechunk, setRechunk] = useState<Collection | null>(null);
  const [method, setMethod] = useState<ChunkMethodKey>('auto');
  const rows = COLLECTIONS.filter((c) => (filter === 'all' || c.status === filter) && (!q || c.name.includes(q)));

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow"><h1>数据集</h1><p>每个文件独立设置切块方式，可随时重新切块，不影响其他文件。</p></div>
        <button className="btn" onClick={() => toast('已开始同步：检测到 3 个文件有更新')}><RefreshCw size={15} />同步更新</button>
        <button className="btn primary" onClick={() => navigate(`/knowledge/${kbId}/import`)}><Upload size={15} />导入数据</button>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="seg">
          {([['all', '全部'], ['ready', '已就绪'], ['indexing', '索引中'], ['failed', '失败']] as const).map(([k, label]) => (
            <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{label}{k === 'failed' ? <Tag tone="red">1</Tag> : null}</button>
          ))}
        </div>
        <span className="grow" />
        <div className="search-box" style={{ width: 240 }}><Search size={15} /><input className="input sm" placeholder="搜索文件名" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <table className="table">
        <thead><tr><th>名称</th><th>切块方式 <Dev s="partial" note="需按文件存储" /></th><th>分块数</th><th>状态</th><th>更新时间</th><th style={{ width: 120 }}>操作</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="clickable" onClick={() => c.status === 'ready' && navigate(`/knowledge/${kbId}/collection/${c.id}`)}>
              <td>
                <div className="row">{SOURCE_ICON[c.source]}<div><div style={{ fontWeight: 500 }}>{c.name}</div><div className="row faint" style={{ gap: 6 }}><span>{c.size}</span>{c.tags.map((t) => <Tag key={t}>{t}</Tag>)}</div></div></div>
              </td>
              <td><Tag tone="blue">{METHOD_NAME[c.method]}</Tag></td>
              <td>{c.chunks || '—'}</td>
              <td><StatusCell c={c} /></td>
              <td className="faint">{c.updatedAt}</td>
              <td onClick={(e) => e.stopPropagation()}>
                <div className="row" style={{ gap: 2 }}>
                  {c.status === 'failed'
                    ? <button className="btn sm" onClick={() => toast('已使用 Qwen-VL-Max 重新解析')}>OCR 重试</button>
                    : <button className="btn sm ghost" onClick={() => { setRechunk(c); setMethod(c.method); }}>重新切块</button>}
                  <button className="btn ghost sm icon" aria-label="更多"><MoreHorizontal size={15} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={!!rechunk} title={`重新切块：${rechunk?.name ?? ''}`} onClose={() => setRechunk(null)} wide
        footer={<><button className="btn" onClick={() => setRechunk(null)}>取消</button><button className="btn" onClick={() => navigate(`/knowledge/${kbId}/import?file=${rechunk?.id}`)}>调整参数并预览</button><button className="btn primary" onClick={() => { setRechunk(null); toast(`已按「${METHOD_NAME[method]}」重新切块，完成后自动替换旧索引`); }}>确认重新切块</button></>}>
        <p className="muted" style={{ marginBottom: 12 }}>新索引构建完成前，旧分块继续提供检索，应用不会中断。</p>
        <div className="grid c3" style={{ gap: 10 }}>
          {CHUNK_METHODS.map((m) => (
            <button key={m.key} className={`method-card ${method === m.key ? 'active' : ''}`} onClick={() => setMethod(m.key)}>
              <span style={{ color: 'var(--primary)' }}><Icon name={m.icon} /></span>
              <div><h4>{m.name}{m.needsLlm ? <Tag tone="purple">LLM</Tag> : null}</h4><p>{m.bestFor}</p></div>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------ 分块管理 ------------------------------ */

const INDEX_LABEL: Record<ChunkItem['indexes'][number]['type'], { name: string; tone: string }> = {
  default: { name: '默认', tone: '' },
  question: { name: '问题', tone: 'blue' },
  summary: { name: '摘要', tone: 'purple' },
  custom: { name: '自定义', tone: 'teal' },
};

function ChunksView({ kbId }: { kbId: string }) {
  const { cid } = useParams();
  const toast = useToast();
  const col = COLLECTIONS.find((c) => c.id === cid) ?? COLLECTIONS[0];
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<ChunkItem | null>(null);
  const [newIndex, setNewIndex] = useState('');
  const list = CHUNKS.filter((c) => !q || c.content.includes(q) || c.title.includes(q));

  return (
    <div className="page">
      <div className="row faint" style={{ marginBottom: 8 }}><Link to={`/knowledge/${kbId}`}>数据集</Link><ChevronRight size={13} /><span>{col.name}</span></div>
      <div className="page-head">
        <div className="grow">
          <h1 className="row">{SOURCE_ICON[col.source]}{col.name}</h1>
          <div className="row" style={{ marginTop: 8 }}>
            <Tag tone="blue">{METHOD_NAME[col.method]}</Tag><Tag>标题层级 H1–H3</Tag><Tag>超长继续切分 · 500 字</Tag><Tag tone="purple">问题索引增强</Tag><span className="faint">共 {col.chunks} 块 · {col.size}</span>
          </div>
        </div>
        <button className="btn" onClick={() => toast('已打开原文预览')}><FileText size={15} />查看原文</button>
        <button className="btn"><Plus size={15} />新增分块</button>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <div className="search-box grow" style={{ maxWidth: 360 }}><Search size={15} /><input className="input sm" placeholder="搜索分块内容" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <span className="grow" />
        <span className="faint">按被引用次数排序可发现高频知识</span>
      </div>
      <div className="grid c2" style={{ gap: 12 }}>
        {list.map((c) => (
          <div key={c.id} className="chunk-card" style={{ cursor: 'pointer' }} onClick={() => setEditing(c)}>
            <header><span className="idx">#{c.index}</span><span className="ellipsis grow">{c.title}</span><span>{c.tokens} tokens</span></header>
            <div className="body clamp-3">{c.content}</div>
            <div className="row" style={{ marginTop: 10, fontSize: 12 }}>
              <span className="faint"><Hash size={12} style={{ verticalAlign: -2 }} /> {c.indexes.length} 个索引</span>
              {c.indexes.filter((i) => i.type !== 'default').slice(0, 2).map((i) => <Tag key={i.text} tone={INDEX_LABEL[i.type].tone}>{i.text}</Tag>)}
              <span className="grow" />
              <span className="faint">被引用 {c.hits} 次</span>
            </div>
          </div>
        ))}
      </div>

      <Drawer open={!!editing} title={`编辑分块 #${editing?.index ?? ''}`} onClose={() => setEditing(null)}
        footer={<><button className="btn danger"><Trash2 size={14} />删除</button><span className="grow" /><button className="btn" onClick={() => setEditing(null)}>取消</button><button className="btn primary" onClick={() => { setEditing(null); toast('分块已保存，向量已更新'); }}>保存</button></>}>
        {editing ? <>
          <Field label="标题路径"><input className="input" defaultValue={editing.title} /></Field>
          <Field label="分块内容" hint={`${editing.content.length} 字`}><textarea className="textarea" style={{ minHeight: 180 }} defaultValue={editing.content} /></Field>
          <Field label={<>检索索引<Dev s="todo" note="一块多向量" /></>} hint="每条索引单独向量化，命中任一条即召回本块">
            <div className="col">
              {editing.indexes.map((i) => (
                <div key={i.text} className="row" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
                  <Tag tone={INDEX_LABEL[i.type].tone}>{INDEX_LABEL[i.type].name}</Tag><span className="grow">{i.text}</span>
                  {i.type !== 'default' ? <button className="btn ghost sm icon" aria-label="删除索引"><Trash2 size={14} /></button> : null}
                </div>
              ))}
              <div className="row">
                <input className="input" placeholder="添加一个用户可能的问法，例如「开不了机」" value={newIndex} onChange={(e) => setNewIndex(e.target.value)} />
                <button className="btn" onClick={() => { setNewIndex(''); toast('已添加自定义索引'); }}>添加</button>
              </div>
              <button className="btn ghost" style={{ alignSelf: 'flex-start', color: 'var(--purple)' }} onClick={() => toast('AI 已生成 3 个问题索引')}><Wand2 size={15} />AI 生成问题索引</button>
            </div>
          </Field>
        </> : null}
      </Drawer>
    </div>
  );
}

/* ------------------------------ 检索测试 ------------------------------ */

type Mode = 'semantic' | 'fulltext' | 'hybrid';

const RESULTS: Record<Mode, { chunk: string; scores: Record<string, number> }[]> = {
  semantic: [
    { chunk: 'k3', scores: { 语义: 0.71 } },
    { chunk: 'k4', scores: { 语义: 0.68 } },
    { chunk: 'k2', scores: { 语义: 0.52 } },
  ],
  fulltext: [
    { chunk: 'k4', scores: { 全文: 14.2 } },
  ],
  hybrid: [
    { chunk: 'k4', scores: { 语义: 0.68, 全文: 14.2, RRF: 0.032, Rerank: 0.94 } },
    { chunk: 'k3', scores: { 语义: 0.71, RRF: 0.016, Rerank: 0.41 } },
  ],
};

function highlight(text: string, words: string[]) {
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return text.split(re).map((part, i) => (words.includes(part) ? <mark key={i} style={{ background: '#fef0c7', padding: '0 2px', borderRadius: 3 }}>{part}</mark> : part));
}

function SearchTestView() {
  const [query, setQuery] = useState('储能柜报 E07 是什么问题？');
  const [mode, setMode] = useState<Mode>('hybrid');
  const [rerank, setRerank] = useState(true);
  const [rewrite, setRewrite] = useState(true);
  const [limit, setLimit] = useState(3000);
  const [minScore, setMinScore] = useState(0.4);
  const [ran, setRan] = useState<Mode>('hybrid');
  const [loading, setLoading] = useState(false);
  const results = RESULTS[ran];

  const run = () => { setLoading(true); window.setTimeout(() => { setRan(mode); setLoading(false); }, 600); };

  return (
    <div className="page" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ width: 380, flex: 'none' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>检索测试</h1>
        <p className="muted" style={{ margin: '4px 0 16px' }}>用真实问题验证召回效果，参数可直接同步到应用的知识库节点。</p>
        <div className="card pad">
          <textarea className="textarea" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Field label={<>检索模式<Dev s="partial" note="仅语义" /></>}>
            <div className="seg" style={{ width: '100%' }}>
              {([['semantic', '语义检索'], ['fulltext', '全文检索'], ['hybrid', '混合检索']] as const).map(([k, l]) => <button key={k} style={{ flex: 1 }} className={mode === k ? 'active' : ''} onClick={() => setMode(k)}>{l}</button>)}
            </div>
            <p className="faint" style={{ marginTop: 6 }}>{mode === 'semantic' ? '按语义相似度召回，擅长同义表达。' : mode === 'fulltext' ? '按关键词匹配，擅长编号、型号、条款号。' : '语义 + 全文并行召回，RRF 融合排序，推荐。'}</p>
          </Field>
          <div className="row form-item"><span className="grow">结果重排（Rerank）<Dev s="ready" /></span><Switch on={rerank} onChange={setRerank} label="结果重排" /></div>
          <div className="row form-item"><span className="grow">问题优化（结合上下文补全指代）<Dev s="todo" /></span><Switch on={rewrite} onChange={setRewrite} label="问题优化" /></div>
          <Field label="引用上限" hint="tokens"><Slider value={limit} min={500} max={12000} step={500} onChange={setLimit} /></Field>
          <Field label="最低相关度"><Slider value={minScore} min={0} max={1} step={0.05} onChange={setMinScore} /></Field>
          <button className="btn primary" style={{ width: '100%' }} onClick={run} disabled={loading}>{loading ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}测试</button>
        </div>
        <div className="section-title" style={{ fontSize: 13 }}>测试历史</div>
        {['储能柜报 E07 是什么问题？', '退货运费谁承担', 'ES-200 最多并机几台'].map((h) => (
          <button key={h} className="sub-link" onClick={() => setQuery(h)}><Search size={13} className="muted" />{h}</button>
        ))}
      </div>
      <div className="grow">
        <div className="row" style={{ marginBottom: 12, marginTop: 4 }}>
          <strong>召回结果</strong>
          <Tag>{ran === 'semantic' ? '语义检索' : ran === 'fulltext' ? '全文检索' : '混合检索'}</Tag>
          <span className="faint">{results.length} 条 · 耗时 {ran === 'hybrid' ? 286 : 142} ms</span>
          <span className="grow" />
          {rewrite ? <span className="faint">优化后问题：「ES-200 储能柜 E07 故障代码含义与处理方法」</span> : null}
        </div>
        {ran === 'semantic' ? <div className="card pad" style={{ background: 'var(--orange-50)', borderColor: '#fef0c7', marginBottom: 12, fontSize: 13 }}>纯语义检索把「首次开机」排在了「E07 故障代码」前面：编号类问题建议使用混合检索。</div> : null}
        <div className="col" style={{ gap: 12, opacity: loading ? 0.4 : 1 }}>
          {results.map((r, i) => {
            const c = CHUNKS.find((x) => x.id === r.chunk)!;
            return (
              <div key={r.chunk} className="chunk-card">
                <header>
                  <span className="idx">TOP {i + 1}</span>
                  {Object.entries(r.scores).map(([k, v]) => <Tag key={k} tone={k === 'Rerank' ? 'green' : k === 'RRF' ? 'purple' : 'blue'}>{k} <span className="score">{v}</span></Tag>)}
                  <span className="grow" />
                  <span className="ellipsis">智能储能柜 ES-200 用户手册 V3.2.pdf</span>
                </header>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>{c.title}</div>
                <div className="body">{highlight(c.content, ['E07', '储能柜'])}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ 配置 ------------------------------ */

function SettingsView({ kbId }: { kbId: string }) {
  const kb = kbById(kbId)!;
  const toast = useToast();
  const [method, setMethod] = useState<ChunkMethodKey>('auto');
  const [qIndex, setQIndex] = useState(true);
  const [summary, setSummary] = useState(false);
  const [meta, setMeta] = useState(true);
  const [ocr, setOcr] = useState(true);
  const llms = useMemo(() => MODELS.filter((m) => m.type === 'LLM'), []);
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head"><div className="grow"><h1>配置</h1><p>新导入文件的默认设置；已导入文件保留各自的切块方式。</p></div><button className="btn primary" onClick={() => toast('配置已保存')}>保存</button></div>

      <div className="card pad">
        <div className="section-title" style={{ marginTop: 0 }}>基础信息</div>
        <div className="form-grid">
          <Field label="名称"><input className="input" defaultValue={kb.name} /></Field>
          <Field label="管理员"><input className="input" defaultValue={`${kb.owner} · 周敏`} /></Field>
        </div>
        <Field label="简介"><textarea className="textarea" style={{ minHeight: 60 }} defaultValue={kb.desc} /></Field>
      </div>

      <div className="card pad" style={{ marginTop: 16 }}>
        <div className="section-title" style={{ marginTop: 0 }}>模型</div>
        <div className="form-grid">
          <Field label="索引模型" hint="变更需全库重建"><select className="select" defaultValue={kb.embedding}><option>{kb.embedding}</option></select></Field>
          <Field label="文本理解模型"><select className="select">{llms.map((m) => <option key={m.name}>{m.name}</option>)}</select></Field>
          <Field label="图片理解模型"><select className="select"><option>Qwen-VL-Max</option><option>不处理</option></select></Field>
          <Field label="重排模型"><select className="select"><option>bge-reranker-v2-m3</option><option>不使用</option></select></Field>
        </div>
      </div>

      <div className="card pad" style={{ marginTop: 16 }}>
        <div className="section-title" style={{ marginTop: 0 }}>默认处理方式</div>
        <Field label="默认切块方式" hint="导入时会按文件类型推荐，可逐个修改">
          <select className="select" value={method} onChange={(e) => setMethod(e.target.value as ChunkMethodKey)}>{CHUNK_METHODS.map((m) => <option key={m.key} value={m.key}>{m.name} — {m.bestFor}</option>)}</select>
        </Field>
        <div className="col" style={{ gap: 12 }}>
          <div className="row"><span className="grow"><Sparkles size={14} color="var(--purple)" /> 自动生成问题索引<div className="faint">每块生成 3–5 个用户可能的问法，提升口语化问题的召回</div></span><Switch on={qIndex} onChange={setQIndex} label="问题索引" /></div>
          <div className="row"><span className="grow">自动生成摘要索引<div className="faint">长分块额外增加一条摘要向量</div></span><Switch on={summary} onChange={setSummary} label="摘要索引" /></div>
          <div className="row"><span className="grow">元数据抽取<Dev s="ready" /><div className="faint">抽取时间、版本、主体、负责人，可在检索时过滤</div></span><Switch on={meta} onChange={setMeta} label="元数据抽取" /></div>
          <div className="row"><span className="grow">图片 OCR 与描述<Dev s="ready" /><div className="faint">扫描件与图片页自动识别文字，图表生成文字描述</div></span><Switch on={ocr} onChange={setOcr} label="图片处理" /></div>
        </div>
      </div>

      <div className="card pad" style={{ marginTop: 16 }}>
        <div className="section-title" style={{ marginTop: 0 }}>权限</div>
        <div className="row wrap">
          <Tag tone="blue">客服中心（可编辑）</Tag><Tag>市场部（只读）</Tag><Tag>全员（仅通过应用使用）</Tag>
          <button className="btn sm"><Plus size={13} />添加协作者</button>
        </div>
      </div>

      <div className="card pad" style={{ marginTop: 16, borderColor: '#fee4e2' }}>
        <div className="row"><div className="grow"><strong>删除知识库</strong><div className="faint">将同时删除 {kb.collections} 个文件和全部索引，引用它的 {kb.usedBy.length} 个应用会失去该知识来源。</div></div><button className="btn danger"><Trash2 size={14} />删除</button></div>
      </div>
    </div>
  );
}
