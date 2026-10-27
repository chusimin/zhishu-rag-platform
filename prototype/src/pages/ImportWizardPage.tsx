import {
  AlertTriangle, ArrowLeft, Blocks, Check, CheckCircle2, FileSpreadsheet, FileText, Globe, Link2, LoaderCircle, Plug, Plus, Table2, Type, UploadCloud, X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CHUNK_METHODS, kbById, METHOD_NAME, MODELS, SAMPLE_DOC, SAMPLE_TABLE, type ChunkMethodKey } from '../data/mock';
import { approxTokens, chunkDocument, DEFAULT_PARAMS, type ChunkParams } from '../lib/chunker';
import { Dev, Field, Icon, Slider, Switch, Tag, useToast } from '../components/ui';

type Source = 'file' | 'web' | 'text' | 'qa' | 'feishu' | 'api';
type FileKind = 'doc' | 'table';

interface ImportFile { id: string; name: string; size: string; kind: FileKind; recommend: ChunkMethodKey; why: string }

const SAMPLE_FILES: ImportFile[] = [
  { id: 'f1', name: '售后服务政策 V2.1.docx', size: '86 KB', kind: 'doc', recommend: 'heading', why: '检测到 4 个章节标题、8 个条款' },
  { id: 'f2', name: '产品参数与价格表.xlsx', size: '24 KB', kind: 'table', recommend: 'table_row', why: '检测到表格结构，共 5 列' },
  { id: 'f3', name: '经销商常见问题汇编.pdf', size: '1.4 MB', kind: 'doc', recommend: 'qa', why: '检测到大量「问：/答：」句式' },
];

const SOURCES: { key: Source; name: string; icon: typeof FileText; dev: 'ready' | 'partial' | 'todo' }[] = [
  { key: 'file', name: '本地文件', icon: UploadCloud, dev: 'ready' },
  { key: 'web', name: '网页链接', icon: Globe, dev: 'todo' },
  { key: 'text', name: '自定义文本', icon: Type, dev: 'todo' },
  { key: 'qa', name: '问答对导入', icon: Table2, dev: 'todo' },
  { key: 'feishu', name: '飞书文档', icon: Blocks, dev: 'todo' },
  { key: 'api', name: 'API 导入', icon: Plug, dev: 'partial' },
];

const SEP_PRESETS = [
  { label: '空行', value: '\\n\\n' },
  { label: '换行', value: '\\n' },
  { label: '句号 。', value: '。' },
  { label: '「第X条」', value: 're:(?=第[一二三四五六七八九十百]+条)' },
  { label: '二级标题 ##', value: '## ' },
  { label: '分号 ；', value: '；' },
];

interface FileConfig { method: ChunkMethodKey; params: ChunkParams }

export function ImportWizardPage() {
  const { kbId = '' } = useParams();
  const kb = kbById(kbId) ?? kbById('kb-product')!;
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<Source>('file');
  const [files, setFiles] = useState<ImportFile[]>(SAMPLE_FILES);
  const [active, setActive] = useState(SAMPLE_FILES[0].id);
  const [configs, setConfigs] = useState<Record<string, FileConfig>>(() =>
    Object.fromEntries(SAMPLE_FILES.map((f) => [f.id, { method: f.recommend, params: { ...DEFAULT_PARAMS } }])));
  const [enhance, setEnhance] = useState({ question: true, summary: false, meta: true, ocr: true, cleanHeader: true });

  const file = files.find((f) => f.id === active) ?? files[0];
  const cfg = file ? configs[file.id] : undefined;

  const setCfg = (patch: Partial<FileConfig>) => file && setConfigs((c) => ({ ...c, [file.id]: { ...c[file.id], ...patch } }));
  const setParam = (patch: Partial<ChunkParams>) => cfg && setCfg({ params: { ...cfg.params, ...patch } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="topbar">
        <button className="btn ghost sm" onClick={() => navigate(`/knowledge/${kb.id}`)}><ArrowLeft size={15} />{kb.name}</button>
        <span className="title">导入数据</span>
        <span className="grow" />
        <div className="steps">
          {['选择数据源', '数据处理与预览', '确认导入'].map((s, i) => (
            <div key={s} className="row" style={{ gap: 8 }}>
              {i ? <span className="step-line" /> : null}
              <div className={`step ${step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''}`}><span className="n">{step > i + 1 ? <Check size={13} /> : i + 1}</span>{s}</div>
            </div>
          ))}
        </div>
        <span className="grow" />
        {step > 1 && step < 4 ? <button className="btn" onClick={() => setStep(step - 1)}>上一步</button> : null}
        {step === 1 ? <button className="btn primary" disabled={!files.length} onClick={() => setStep(2)}>下一步</button> : null}
        {step === 2 ? <button className="btn primary" onClick={() => setStep(3)}>下一步</button> : null}
        {step === 3 ? <button className="btn primary" onClick={() => setStep(4)}>开始导入</button> : null}
      </div>

      {step === 1 ? <SourceStep source={source} setSource={setSource} files={files} setFiles={setFiles} /> : null}
      {step === 2 && file && cfg ? (
        <ProcessStep files={files} file={file} cfg={cfg} configs={configs} setActive={setActive} setCfg={setCfg} setParam={setParam}
          applyAll={() => { setConfigs((c) => Object.fromEntries(files.map((f) => [f.id, f.kind === file.kind ? { ...cfg } : c[f.id]]))); toast('已应用到同类型的全部文件'); }}
          enhance={enhance} setEnhance={setEnhance} />
      ) : null}
      {step >= 3 ? <ConfirmStep files={files} configs={configs} enhance={enhance} running={step === 4} onDone={() => { toast('导入完成，3 个文件已可检索'); navigate(`/knowledge/${kb.id}`); }} /> : null}
    </div>
  );
}

/* ---------------- Step 1 ---------------- */

function SourceStep({ source, setSource, files, setFiles }: { source: Source; setSource: (s: Source) => void; files: ImportFile[]; setFiles: (f: ImportFile[]) => void }) {
  return (
    <div className="page" style={{ maxWidth: 980, margin: '0 auto', width: '100%' }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
        {SOURCES.map(({ key, name, icon: I, dev }) => (
          <button key={key} className={`method-card ${source === key ? 'active' : ''}`} style={{ flexDirection: 'column', alignItems: 'center', padding: 14 }} onClick={() => setSource(key)}>
            <I size={22} color="var(--primary)" /><h4>{name}</h4><Dev s={dev} />
          </button>
        ))}
      </div>
      <div style={{ marginTop: 20 }}>
        {source === 'file' ? <>
          <label className="upload-zone" onClick={() => setFiles(SAMPLE_FILES)}>
            <UploadCloud size={30} color="var(--primary)" />
            <strong style={{ color: 'var(--text-1)' }}>点击或拖拽文件到此处上传</strong>
            <span>支持 PDF、DOCX、PPTX、MD、TXT、HTML、XLSX、CSV、PNG/JPG，单文件 ≤ 100MB，单次 ≤ 50 个</span>
          </label>
          <div className="col" style={{ marginTop: 16, gap: 8 }}>
            {files.map((f) => (
              <div key={f.id} className="card row" style={{ padding: '10px 14px' }}>
                {f.kind === 'table' ? <FileSpreadsheet size={18} color="#12b76a" /> : <FileText size={18} color="#3370ff" />}
                <div className="grow"><div style={{ fontWeight: 500 }}>{f.name}</div><div className="faint">{f.size} · {f.why}</div></div>
                <Tag tone="green"><CheckCircle2 size={12} />上传完成</Tag>
                <button className="btn ghost sm icon" aria-label="移除" onClick={() => setFiles(files.filter((x) => x.id !== f.id))}><X size={14} /></button>
              </div>
            ))}
          </div>
        </> : null}
        {source === 'web' ? <div className="card pad">
          <Field label="网页地址" required hint="每行一个，最多 50 个"><textarea className="textarea" defaultValue={'https://help.example.com/docs/es-200\nhttps://help.example.com/docs/pv-5k'} /></Field>
          <div className="form-grid">
            <Field label="抓取范围"><select className="select"><option>仅当前页面</option><option>当前页及同目录子页面（深度 2）</option><option>整个站点（按 sitemap）</option></select></Field>
            <Field label="正文选择器" hint="可选"><input className="input" placeholder="例如 article .content" /></Field>
          </div>
          <div className="row"><span className="grow">定时同步<div className="faint">每天 02:00 检测页面变化并增量更新</div></span><Switch on onChange={() => undefined} label="定时同步" /></div>
        </div> : null}
        {source === 'text' ? <div className="card pad">
          <Field label="标题" required><input className="input" placeholder="例如：新品上市统一口径" /></Field>
          <Field label="内容" required><textarea className="textarea" style={{ minHeight: 220 }} placeholder="粘贴或输入文本，支持 Markdown" /></Field>
        </div> : null}
        {source === 'qa' ? <div className="card pad">
          <p className="muted" style={{ marginBottom: 12 }}>上传含「问题」「答案」两列的 CSV / Excel。每行直接作为一个问答分块，不再切分；可选第三列「相似问法」作为额外索引。</p>
          <div className="code-block">{'问题,答案,相似问法\n退货运费谁承担？,7 日内无理由退货由客户承担…,退货要钱吗|退货邮费\n储能柜保修多久？,整机 5 年，电芯 10 年或 6000 次…,质保几年'}</div>
          <button className="btn" style={{ marginTop: 12 }}><UploadCloud size={15} />选择文件</button><button className="btn ghost" style={{ marginTop: 12 }}>下载模板</button>
        </div> : null}
        {source === 'feishu' ? <div className="card pad">
          <Field label="飞书知识空间"><select className="select"><option>产品中心 / 帮助文档</option></select></Field>
          <Field label="同步范围"><div className="col">{['ES-200 产品说明', 'PV-5K 安装指南', '售后 FAQ（持续更新）'].map((d) => <label key={d} className="row"><input type="checkbox" defaultChecked />{d}</label>)}</div></Field>
          <p className="faint">文档变更后自动重新切块，保留原有自定义索引。</p>
        </div> : null}
        {source === 'api' ? <div className="card pad">
          <p className="muted" style={{ marginBottom: 12 }}>业务系统可通过 API 推送数据，切块参数与界面一致。</p>
          <div className="code-block">{`curl -X POST https://ai.example.com/api/v1/knowledge-bases/kb-product/collections \\
  -H "Authorization: Bearer $TOKEN" \\
  -F file=@售后服务政策.docx \\
  -F 'chunk={"method":"heading","heading_level":2,"max_size":500}' \\
  -F 'enhance={"question_index":true}'`}</div>
        </div> : null}
      </div>
    </div>
  );
}

/* ---------------- Step 2 ---------------- */

function ProcessStep({ files, file, cfg, configs, setActive, setCfg, setParam, applyAll, enhance, setEnhance }: {
  files: ImportFile[]; file: ImportFile; cfg: FileConfig; configs: Record<string, FileConfig>; setActive: (id: string) => void;
  setCfg: (p: Partial<FileConfig>) => void; setParam: (p: Partial<ChunkParams>) => void; applyAll: () => void;
  enhance: Record<'question' | 'summary' | 'meta' | 'ocr' | 'cleanHeader', boolean>; setEnhance: (e: Record<'question' | 'summary' | 'meta' | 'ocr' | 'cleanHeader', boolean>) => void;
}) {
  const [customSep, setCustomSep] = useState('');
  const text = file.kind === 'table' ? SAMPLE_TABLE : SAMPLE_DOC;
  const chunks = useMemo(() => chunkDocument(cfg.method, text, cfg.params), [cfg, text]);
  const lens = chunks.map((c) => c.content.length + (c.q?.length ?? 0));
  const avg = lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : 0;
  const max = lens.length ? Math.max(...lens) : 0;
  const tiny = lens.filter((l) => l < 40).length;
  const methodMeta = CHUNK_METHODS.find((m) => m.key === cfg.method)!;
  const p = cfg.params;
  const compatible = (k: ChunkMethodKey) => (file.kind === 'table' ? ['table_row', 'fixed', 'qa'].includes(k) : k !== 'table_row');
  const toggleSep = (v: string) => setParam({ separators: p.separators.includes(v) ? p.separators.filter((s) => s !== v) : [...p.separators, v] });

  const [flash, setFlash] = useState(false);
  useEffect(() => { setFlash(true); const t = window.setTimeout(() => setFlash(false), 250); return () => window.clearTimeout(t); }, [chunks]);

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div style={{ width: 460, flex: 'none', borderRight: '1px solid var(--border)', overflow: 'auto', padding: 20 }}>
        <div className="field-label">文件<span className="hint">每个文件可单独设置</span></div>
        <div className="col" style={{ gap: 6, marginBottom: 18 }}>
          {files.map((f) => (
            <button key={f.id} className={`sub-link ${f.id === file.id ? 'active' : ''}`} style={{ border: '1px solid var(--border)' }} onClick={() => setActive(f.id)}>
              {f.kind === 'table' ? <FileSpreadsheet size={16} /> : <FileText size={16} />}
              <span className="grow ellipsis">{f.name}</span>
              <Tag tone={f.id === file.id ? 'blue' : ''}>{METHOD_NAME[configs[f.id].method]}</Tag>
            </button>
          ))}
        </div>

        <div className="field-label">切块方式<span className="hint">推荐：{METHOD_NAME[file.recommend]}（{file.why}）</span></div>
        <div className="grid c2" style={{ gap: 8, marginBottom: 18 }}>
          {CHUNK_METHODS.map((m) => {
            const ok = compatible(m.key);
            return (
              <button key={m.key} disabled={!ok} title={ok ? m.desc : '不适用于当前文件类型'} className={`method-card ${cfg.method === m.key ? 'active' : ''}`} style={{ padding: 10, opacity: ok ? 1 : 0.4, cursor: ok ? 'pointer' : 'not-allowed' }} onClick={() => setCfg({ method: m.key })}>
                <span style={{ color: 'var(--primary)', marginTop: 1 }}><Icon name={m.icon} size={16} /></span>
                <div>
                  <h4 style={{ fontSize: 13 }}>{m.name}{m.key === file.recommend ? <Tag tone="green">推荐</Tag> : null}{m.needsLlm ? <Tag tone="purple">LLM</Tag> : null}</h4>
                  <p>{m.bestFor}</p>
                  <Dev s={m.backend} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="card pad" style={{ background: 'var(--bg-soft)' }}>
          <div className="row" style={{ marginBottom: 12 }}><strong className="grow">{methodMeta.name} · 参数</strong></div>
          <p className="faint" style={{ marginTop: -6, marginBottom: 12 }}>{methodMeta.desc}</p>
          {cfg.method === 'auto' ? <>
            <Field label="块大小" hint="字"><Slider value={p.size} min={100} max={1000} step={50} onChange={(v) => setParam({ size: v })} /></Field>
          </> : null}
          {cfg.method === 'heading' ? <>
            <Field label="按哪一级标题切分">
              <div className="seg">{([1, 2, 3] as const).map((l) => <button key={l} className={p.headingLevel === l ? 'active' : ''} onClick={() => setParam({ headingLevel: l })}>H{l} 及以上</button>)}</div>
            </Field>
            <Field label="单块超长时继续切分" hint="字"><Slider value={p.size} min={200} max={1500} step={50} onChange={(v) => setParam({ size: v })} /></Field>
          </> : null}
          {cfg.method === 'separator' ? <>
            <Field label="分隔符" hint="可多选，按任一切分">
              <div className="row wrap" style={{ gap: 6 }}>
                {SEP_PRESETS.map((s) => <button key={s.value} className={`tag ${p.separators.includes(s.value) ? 'blue' : ''}`} style={{ cursor: 'pointer', height: 26 }} onClick={() => toggleSep(s.value)}>{p.separators.includes(s.value) ? <Check size={12} /> : null}{s.label}</button>)}
                {p.separators.filter((s) => !SEP_PRESETS.some((x) => x.value === s)).map((s) => <button key={s} className="tag blue" style={{ height: 26 }} onClick={() => toggleSep(s)}>{s}<X size={11} /></button>)}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <input className="input sm" placeholder="自定义，如 ###、---，正则以 re: 开头" value={customSep} onChange={(e) => setCustomSep(e.target.value)} />
                <button className="btn sm" onClick={() => { if (customSep) { setParam({ separators: [...p.separators, customSep] }); setCustomSep(''); } }}><Plus size={13} />添加</button>
              </div>
            </Field>
            <Field label="单块最大长度" hint="字"><Slider value={p.size} min={100} max={1500} step={50} onChange={(v) => setParam({ size: v })} /></Field>
          </> : null}
          {cfg.method === 'fixed' ? <>
            <Field label="块大小" hint="字"><Slider value={p.size} min={50} max={1000} step={10} onChange={(v) => setParam({ size: v })} /></Field>
            <Field label="重叠长度" hint="字"><Slider value={p.overlap} min={0} max={200} step={10} onChange={(v) => setParam({ overlap: v })} /></Field>
          </> : null}
          {cfg.method === 'parent_child' ? <>
            <Field label="父块大小" hint="返回给模型的上下文"><Slider value={p.parentSize} min={150} max={2000} step={50} onChange={(v) => setParam({ parentSize: v })} /></Field>
            <Field label="子块大小" hint="用于向量匹配"><Slider value={p.childSize} min={40} max={500} step={10} onChange={(v) => setParam({ childSize: Math.min(v, p.parentSize - 50) })} /></Field>
          </> : null}
          {cfg.method === 'semantic' || cfg.method === 'qa' ? <>
            <Field label="处理模型"><select className="select">{MODELS.filter((m) => m.type === 'LLM').map((m) => <option key={m.name}>{m.name}</option>)}</select></Field>
            {cfg.method === 'qa' ? <Field label="拆分提示词"><textarea className="textarea" style={{ minHeight: 90, fontSize: 13 }} defaultValue={'从文档中提取客户可能会问的问题，并给出完全依据原文的答案。\n要求：问题口语化；答案不超过 120 字；不要编造原文没有的信息。'} /></Field> : null}
            <div className="row faint"><AlertTriangle size={13} color="#f79009" />预计消耗约 {cfg.method === 'qa' ? '18k' : '9k'} tokens，导入时间较长。语义分块会校验结果与原文逐字一致。</div>
          </> : null}
          {cfg.method === 'page' ? <p className="faint">每页一个分块，保留页码，召回时可定位到原文页。图片多的页面建议同时开启图片理解。</p> : null}
          {cfg.method === 'table_row' ? <>
            <Field label="每块行数"><Slider value={p.rowsPerChunk} min={1} max={5} onChange={(v) => setParam({ rowsPerChunk: v })} /></Field>
            <div className="row form-item"><span className="grow">表头作为每行上下文<div className="faint">生成「型号：ES-200；功率：100 kW」形式，召回更准</div></span><Switch on={p.headerAsContext} onChange={(v) => setParam({ headerAsContext: v })} label="表头上下文" /></div>
          </> : null}
          {['auto', 'heading'].includes(cfg.method) ? <div className="row"><span className="grow">每块注入标题路径<div className="faint">让孤立的条款保留「第二章 退换货」等上下文</div></span><Switch on={p.injectTitle} onChange={(v) => setParam({ injectTitle: v })} label="注入标题" /></div> : null}
          <button className="btn sm ghost" style={{ marginTop: 10, color: 'var(--primary)' }} onClick={applyAll}>应用到同类型的全部文件</button>
        </div>

        <div className="field-label" style={{ marginTop: 18 }}>处理增强</div>
        <div className="col" style={{ gap: 10 }}>
          {([
            ['question', '问题索引', '每块生成 3–5 个问法作为额外索引', 'todo'],
            ['summary', '摘要索引', '长分块增加一条摘要向量', 'todo'],
            ['meta', '元数据抽取', '时间、版本、主体、负责人', 'ready'],
            ['ocr', '图片理解', 'OCR 识别文字，图表生成描述', 'ready'],
            ['cleanHeader', '去除页眉页脚与页码', '避免重复噪音进入分块', 'todo'],
          ] as const).map(([k, name, desc, dev]) => (
            <div key={k} className="row"><span className="grow">{name}<Dev s={dev} /><div className="faint">{desc}</div></span><Switch on={enhance[k]} onChange={(v) => setEnhance({ ...enhance, [k]: v })} label={name} /></div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-soft)' }}>
        <div className="row" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <strong>分块预览</strong><Tag tone="blue">{methodMeta.name}</Tag>
          <span className="faint">{file.name}</span>
          <span className="grow" />
          <span className="faint">共 <strong style={{ color: 'var(--text-1)' }}>{chunks.length}</strong> 块 · 平均 {avg} 字 · 最长 {max} 字</span>
          <Dev s="todo" note="chunk-preview 接口" />
        </div>
        {tiny > 0 && cfg.method !== 'qa' ? <div className="row" style={{ padding: '8px 20px', background: 'var(--orange-50)', fontSize: 13, color: '#b54708' }}><AlertTriangle size={14} />有 {tiny} 个分块少于 40 字，语义信息可能不足，建议合并或调大块大小。</div> : null}
        <div style={{ flex: 1, overflow: 'auto', padding: 20, opacity: flash ? 0.55 : 1, transition: 'opacity .2s' }}>
          <div className="col" style={{ gap: 10 }}>
            {chunks.map((c, i) => (
              <div key={i} className="chunk-card">
                <header>
                  <span className="idx">#{i + 1}</span>
                  {c.title ? <span className="ellipsis grow">{c.title}</span> : <span className="grow" />}
                  <span>{c.content.length + (c.q?.length ?? 0)} 字 · ≈{approxTokens(c.content)} tokens</span>
                </header>
                {c.q ? <><div className="qa-q">Q：{c.q}</div><div className="qa-a">A：{c.content}</div></> : <div className="body">{c.content.replace(/\n{2,}/g, '\n')}</div>}
                {c.children ? (
                  <div style={{ marginTop: 8 }}>
                    <div className="faint">子块（用于检索，命中后返回上方完整父块）</div>
                    {c.children.map((ch, j) => <div key={j} className="child body" style={{ fontSize: 12 }}><span className="idx" style={{ marginRight: 6 }}>{i + 1}.{j + 1}</span>{ch}</div>)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Step 3 / 4 ---------------- */

const STAGES = ['解析', '切块', '索引增强', '向量化'];

function ConfirmStep({ files, configs, enhance, running, onDone }: { files: ImportFile[]; configs: Record<string, FileConfig>; enhance: Record<string, boolean>; running: boolean; onDone: () => void }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return undefined;
    const t = window.setInterval(() => setTick((v) => v + 1), 450);
    return () => window.clearInterval(t);
  }, [running]);
  const progressOf = (i: number) => Math.min(100, Math.max(0, (tick - i * 2) * 9));
  const allDone = running && files.every((_, i) => progressOf(i) >= 100);
  const enabled = Object.entries(enhance).filter(([, v]) => v).map(([k]) => ({ question: '问题索引', summary: '摘要索引', meta: '元数据', ocr: '图片理解', cleanHeader: '去页眉页脚' }[k]));

  return (
    <div className="page" style={{ maxWidth: 980, margin: '0 auto', width: '100%' }}>
      <div className="card">
        <table className="table">
          <thead><tr><th>文件</th><th>切块方式</th><th>预计分块</th><th>处理增强</th><th style={{ width: 220 }}>{running ? '进度' : '预计耗时'}</th></tr></thead>
          <tbody>
            {files.map((f, i) => {
              const c = configs[f.id];
              const n = chunkDocument(c.method, f.kind === 'table' ? SAMPLE_TABLE : SAMPLE_DOC, c.params).length;
              const pr = progressOf(i);
              const stage = STAGES[Math.min(3, Math.floor(pr / 25))];
              return (
                <tr key={f.id}>
                  <td><div className="row">{f.kind === 'table' ? <FileSpreadsheet size={16} color="#12b76a" /> : <FileText size={16} color="#3370ff" />}{f.name}</div></td>
                  <td><Tag tone="blue">{METHOD_NAME[c.method]}</Tag></td>
                  <td>{n}</td>
                  <td><div className="row wrap" style={{ gap: 4 }}>{enabled.map((e) => <Tag key={e}>{e}</Tag>)}</div></td>
                  <td>
                    {running ? (
                      pr >= 100 ? <Tag tone="green"><CheckCircle2 size={12} />完成</Tag> : (
                        <div><div className="row faint" style={{ marginBottom: 4 }}>{pr > 0 ? <LoaderCircle size={12} className="spin" /> : null}{pr > 0 ? `${stage} · ${pr}%` : '排队中'}</div><div className="progress"><i style={{ width: `${pr}%` }} /></div></div>
                      )
                    ) : <span className="faint">{c.method === 'qa' || c.method === 'semantic' ? '约 3 分钟' : '约 20 秒'}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!running ? (
        <div className="card pad" style={{ marginTop: 16 }}>
          <div className="row"><Link2 size={16} color="var(--primary)" /><strong>导入后的效果</strong></div>
          <ul className="muted" style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.9 }}>
            <li>新分块构建完成后才参与检索，引用本库的 2 个应用无需重新发布。</li>
            <li>预计调用文本理解模型约 21k tokens（问答对拆分 + 问题索引）。</li>
            <li>导入完成后可在「检索测试」中用真实问题验证。</li>
          </ul>
        </div>
      ) : null}
      {allDone ? <div className="row" style={{ justifyContent: 'center', marginTop: 24 }}><button className="btn primary" onClick={onDone}>返回数据集</button></div> : null}
    </div>
  );
}
