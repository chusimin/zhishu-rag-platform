import {
  ArrowLeft,
  Check,
  FileSpreadsheet,
  FileText,
  Globe,
  Link2,
  LoaderCircle,
  Plug,
  Table2,
  Type,
  UploadCloud,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  API_BASE_URL,
  apiFetch,
  errorMessage,
  type ApiChunkConfig,
  type ApiChunkPreview,
  type ApiImportJob,
  type ApiKnowledgeBase,
  type ApiKnowledgeFile,
} from '../api/client';
import { useToast } from '../components/Toast';
import { Badge, Button, Notice, PageHeader } from '../components/ui';

type Source = 'file' | 'web' | 'text' | 'qa' | 'feishu' | 'api';
type ChunkMethod = ApiKnowledgeBase['chunk_method'];

interface PendingFile {
  id: string;
  file: File;
  config: ApiChunkConfig;
  preview?: ApiChunkPreview;
  previewError?: string;
}

const methodMeta: Array<{ value: ChunkMethod; label: string; description: string }> = [
  { value: 'recursive', label: '结构递归', description: '按段落、句子逐级切分，适合一般文档' },
  { value: 'heading', label: '标题层级', description: '保留章节边界，适合制度与手册' },
  { value: 'separator', label: '自定义分隔符', description: '按指定符号切分，适合格式稳定的正文' },
  { value: 'fixed', label: '固定长度', description: '严格按字符长度切分' },
  { value: 'parent_child', label: '父子切块', description: '子块检索、父块返回，减少断章取义' },
  { value: 'semantic', label: '语义切块', description: '由已配置 LLM 识别主题边界' },
  { value: 'page', label: '按页切块', description: '保留页码，适合 PDF 和扫描资料' },
  { value: 'table_row', label: '表格按行', description: '保留表头并按行组合，适合 CSV/Excel' },
  { value: 'qa', label: '问答对', description: '将表格前两列直接转成问题与答案' },
];

const sourceMeta: Array<{ value: Source; label: string; icon: typeof UploadCloud; status: 'ready' | 'blocked' | 'api' }> = [
  { value: 'file', label: '本地文件', icon: UploadCloud, status: 'ready' },
  { value: 'web', label: '网页链接', icon: Globe, status: 'ready' },
  { value: 'text', label: '自定义文本', icon: Type, status: 'ready' },
  { value: 'qa', label: '问答对', icon: Table2, status: 'ready' },
  { value: 'feishu', label: '飞书文档', icon: Link2, status: 'blocked' },
  { value: 'api', label: 'API 推送', icon: Plug, status: 'api' },
];

function defaultConfig(kb: ApiKnowledgeBase, method?: ChunkMethod): ApiChunkConfig {
  return {
    method: method ?? kb.chunk_method,
    chunk_size: kb.chunk_size,
    chunk_overlap: kb.chunk_overlap,
    parent_chunk_size: kb.parent_chunk_size,
    child_chunk_size: kb.child_chunk_size,
    separators: ['\n\n', '\n', '。'],
    heading_level: 3,
    rows_per_chunk: 1,
  };
}

function recommendedMethod(file: File): ChunkMethod {
  const name = file.name.toLowerCase();
  if (/\.(csv|xlsx|xlsm)$/.test(name)) return 'table_row';
  if (/\.pdf$/.test(name)) return 'page';
  if (/\.(md|markdown|docx)$/.test(name)) return 'heading';
  return 'recursive';
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function ImportWizardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [kb, setKb] = useState<ApiKnowledgeBase | null>(null);
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<Source>('file');
  const [items, setItems] = useState<PendingFile[]>([]);
  const [activeId, setActiveId] = useState('');
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [webUrl, setWebUrl] = useState('');
  const [webTitle, setWebTitle] = useState('');

  useEffect(() => {
    if (!id) return;
    apiFetch<ApiKnowledgeBase>(`/knowledge-bases/${id}`)
      .then(setKb)
      .catch((caught) => showToast(errorMessage(caught), 'error'))
      .finally(() => setLoading(false));
  }, [id, showToast]);

  const active = items.find((item) => item.id === activeId) ?? items[0];
  const canContinue = source === 'web' ? Boolean(webUrl.trim()) : items.length > 0;
  const configInvalid = active
    ? active.config.chunk_overlap >= active.config.chunk_size
      || (active.config.method === 'parent_child' && active.config.child_chunk_size >= active.config.parent_chunk_size)
      || (active.config.method === 'semantic' && !kb?.semantic_llm_model_id)
    : false;

  const addFiles = (selected: File[], forcedMethod?: ChunkMethod) => {
    if (!kb) return;
    const additions = selected.map((file) => {
      const method = forcedMethod ?? recommendedMethod(file);
      return { id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`, file, config: defaultConfig(kb, method) };
    });
    setItems((current) => [...current, ...additions]);
    if (!activeId && additions[0]) setActiveId(additions[0].id);
  };

  const addText = () => {
    if (!textTitle.trim() || !textContent.trim()) return;
    const file = new File([`# ${textTitle.trim()}\n\n${textContent.trim()}\n`], `${textTitle.trim()}.md`, { type: 'text/markdown' });
    addFiles([file], 'heading');
    setTextTitle('');
    setTextContent('');
  };

  const patchConfig = (patch: Partial<ApiChunkConfig>) => {
    if (!active) return;
    setItems((current) => current.map((item) => item.id === active.id ? { ...item, config: { ...item.config, ...patch }, preview: undefined, previewError: undefined } : item));
  };

  const preview = async () => {
    if (!active || !id || configInvalid) return;
    setPreviewing(true);
    try {
      const form = new FormData();
      form.append('upload', active.file);
      form.append('config', JSON.stringify(active.config));
      const result = await apiFetch<ApiChunkPreview>(`/knowledge-bases/${id}/chunk-preview`, { method: 'POST', body: form });
      setItems((current) => current.map((item) => item.id === active.id ? { ...item, preview: result, previewError: undefined } : item));
    } catch (caught) {
      const message = errorMessage(caught);
      setItems((current) => current.map((item) => item.id === active.id ? { ...item, previewError: message } : item));
    } finally {
      setPreviewing(false);
    }
  };

  const startImport = async () => {
    if (!id || !kb) return;
    setImporting(true);
    const failures: string[] = [];
    let completed = 0;
    try {
      if (source === 'web') {
        await apiFetch<{ file: ApiKnowledgeFile; job: ApiImportJob }>(`/knowledge-bases/${id}/web-import`, {
          method: 'POST',
          body: JSON.stringify({ url: webUrl.trim(), title: webTitle.trim() || null, chunk_config: defaultConfig(kb, 'heading') }),
        });
        completed = 1;
      } else {
        for (const item of items) {
          try {
            const form = new FormData();
            form.append('upload', item.file);
            form.append('config', JSON.stringify(item.config));
            await apiFetch<{ file: ApiKnowledgeFile; job: ApiImportJob }>(`/knowledge-bases/${id}/files`, { method: 'POST', body: form });
            completed += 1;
          } catch (caught) {
            failures.push(`${item.file.name}：${errorMessage(caught)}`);
          }
        }
      }
      if (completed) showToast(`${completed} 个数据源已完成处理${failures.length ? `，${failures.length} 个失败` : ''}`);
      if (failures.length) showToast(failures.join('；'), 'error');
      if (completed) navigate(`/knowledge/${id}`);
    } catch (caught) {
      showToast(errorMessage(caught), 'error');
    } finally {
      setImporting(false);
    }
  };

  const apiExample = useMemo(() => `curl -X POST "${window.location.origin}${API_BASE_URL}/knowledge-bases/${id}/files" \\\n+  -H "Authorization: Bearer $TOKEN" \\\n+  -F "upload=@document.pdf" \\\n+  -F 'config={"method":"heading","heading_level":2,"chunk_size":800}'`, [id]);

  if (loading || !kb) return <main className="page"><div className="card empty-state"><LoaderCircle className="spin" /><h2>正在加载导入配置</h2></div></main>;

  return (
    <main className="page page-enter import-wizard-page">
      <PageHeader
        eyebrow={`知识库 / ${kb.name}`}
        title="导入数据"
        description="预览和正式导入使用同一套后端解析与切块逻辑；每个文件可独立配置。"
        actions={<Button icon={<ArrowLeft size={16} />} onClick={() => navigate(`/knowledge/${id}`)}>返回知识库</Button>}
      />

      <ol className="import-steps" aria-label="导入步骤">
        {['选择数据源', '处理与预览', '确认导入'].map((label, index) => <li key={label} className={step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''}><span>{step > index + 1 ? <Check size={14} /> : index + 1}</span>{label}</li>)}
      </ol>

      {step === 1 ? <section className="card import-source-card">
        <div className="source-grid">{sourceMeta.map(({ value, label, icon: Icon, status }) => <button key={value} className={`source-option ${source === value ? 'active' : ''}`} onClick={() => setSource(value)}><Icon size={22} /><strong>{label}</strong><Badge tone={status === 'ready' ? 'success' : status === 'api' ? 'info' : 'warning'}>{status === 'ready' ? '可用' : status === 'api' ? '接口' : '未连接'}</Badge></button>)}</div>

        {source === 'file' ? <SourceFiles items={items} addFiles={addFiles} remove={(itemId) => setItems((current) => current.filter((item) => item.id !== itemId))} /> : null}
        {source === 'qa' ? <div className="import-source-body"><Notice tone="info" title="问答对格式">上传 CSV 或 Excel；第一列为问题、第二列为答案、第三列可填写用“|”分隔的相似问法。每行会直接成为一个问答分块。</Notice><label className="upload-zone"><Table2 size={28} /><strong>选择问答表格</strong><span>支持 CSV、XLSX、XLSM</span><input type="file" multiple accept=".csv,.xlsx,.xlsm" onChange={(event) => addFiles(Array.from(event.target.files ?? []), 'qa')} /></label><SourceFileList items={items} remove={(itemId) => setItems((current) => current.filter((item) => item.id !== itemId))} /></div> : null}
        {source === 'text' ? <div className="import-source-body form-stack"><label className="form-label">标题<input className="field" value={textTitle} onChange={(event) => setTextTitle(event.target.value)} placeholder="例如：新品上市统一口径" /></label><label className="form-label">正文<textarea className="field import-textarea" value={textContent} onChange={(event) => setTextContent(event.target.value)} placeholder="支持 Markdown" /></label><Button icon={<FileText size={16} />} disabled={!textTitle.trim() || !textContent.trim()} onClick={addText}>加入待导入列表</Button><SourceFileList items={items} remove={(itemId) => setItems((current) => current.filter((item) => item.id !== itemId))} /></div> : null}
        {source === 'web' ? <div className="import-source-body form-stack"><Notice tone="info" title="安全抓取">后端只允许公网 HTTP/HTTPS 地址，不跟随重定向，并阻止环回、内网和保留地址。</Notice><label className="form-label">网页地址<input className="field" value={webUrl} onChange={(event) => setWebUrl(event.target.value)} placeholder="https://docs.example.com/article" /></label><label className="form-label">文档标题（可选）<input className="field" value={webTitle} onChange={(event) => setWebTitle(event.target.value)} placeholder="默认读取网页标题" /></label></div> : null}
        {source === 'feishu' ? <div className="import-source-body"><Notice tone="warning" title="尚未连接企业飞书">需要企业管理员提供飞书应用凭据和知识空间授权后才能同步。当前不会用示例数据伪装成功；其余导入方式可正常使用。</Notice></div> : null}
        {source === 'api' ? <div className="import-source-body"><Notice tone="info" title="API 推送已可用">使用具有 knowledge:write scope 的 Token 调用现有上传接口。响应会返回文件和构建任务状态。</Notice><pre className="code-block">{apiExample}</pre></div> : null}
      </section> : null}

      {step === 2 ? <section className="import-process-layout">
        {source === 'web' ? <div className="card import-web-confirm"><Globe size={32} /><h2>网页将在确认后抓取</h2><p>{webUrl}</p><Notice tone="info" title="抓取结果可追溯">导入文件会保留来源 URL，并进入与本地文件相同的解析、切块和向量化流程。</Notice></div> : <>
          <aside className="card import-file-rail"><h2>文件配置</h2>{items.map((item) => <button key={item.id} className={item.id === active?.id ? 'active' : ''} onClick={() => setActiveId(item.id)}><FileText size={16} /><span>{item.file.name}</span><small>{methodMeta.find((method) => method.value === item.config.method)?.label}</small></button>)}</aside>
          {active ? <div className="card import-config-panel">
            <header><div><h2>{active.file.name}</h2><p>{formatBytes(active.file.size)} · 配置会随文件保存</p></div><Button variant="primary" disabled={previewing || configInvalid} onClick={() => void preview()}>{previewing ? <LoaderCircle size={16} className="spin" /> : null}{previewing ? '预览中' : '生成真实预览'}</Button></header>
            <div className="method-grid">{methodMeta.map((method) => <button key={method.value} className={active.config.method === method.value ? 'active' : ''} disabled={method.value === 'semantic' && !kb.semantic_llm_model_id} onClick={() => patchConfig({ method: method.value })}><strong>{method.label}</strong><small>{method.description}</small></button>)}</div>
            <ChunkFields config={active.config} patch={patchConfig} />
            {configInvalid ? <Notice tone="error" title="配置无效">重叠长度必须小于块大小；父子切块中子块必须小于父块；语义切块需要先配置 LLM。</Notice> : null}
            {active.previewError ? <Notice tone="error" title="预览失败">{active.previewError}</Notice> : null}
            {active.preview ? <PreviewPanel preview={active.preview} /> : <div className="empty-state compact"><FileText size={24} /><h3>等待生成预览</h3><p>预览不会保存文件，也不会生成向量。</p></div>}
          </div> : null}
        </>}
      </section> : null}

      {step === 3 ? <section className="card import-confirm-card"><h2>确认导入</h2><p>开始后会真实写入对象存储，执行解析、元数据抽取、切块和向量化。</p>{source === 'web' ? <div className="confirm-row"><Globe size={18} /><span><strong>{webTitle || webUrl}</strong><small>{webUrl}</small></span><Badge tone="info">网页</Badge></div> : items.map((item) => <div className="confirm-row" key={item.id}><FileText size={18} /><span><strong>{item.file.name}</strong><small>{formatBytes(item.file.size)} · {methodMeta.find((method) => method.value === item.config.method)?.label} · {item.preview ? `${item.preview.total_chunks} 块预览` : '未预览'}</small></span><Badge tone={item.preview ? 'success' : 'warning'}>{item.preview ? '已预览' : '待处理'}</Badge></div>)}</section> : null}

      <footer className="import-footer">
        <span>{step === 1 ? '选择可用数据源；飞书需企业凭据后启用。' : step === 2 ? '建议逐文件预览后再导入。' : `将导入 ${source === 'web' ? 1 : items.length} 个数据源。`}</span>
        <div>{step > 1 ? <Button onClick={() => setStep(step - 1)}>上一步</Button> : null}{step === 1 ? <Button variant="primary" disabled={!canContinue || source === 'feishu' || source === 'api'} onClick={() => setStep(2)}>下一步</Button> : null}{step === 2 ? <Button variant="primary" disabled={items.some((item) => item.config.chunk_overlap >= item.config.chunk_size)} onClick={() => setStep(3)}>下一步</Button> : null}{step === 3 ? <Button variant="primary" disabled={importing} onClick={() => void startImport()}>{importing ? <LoaderCircle size={16} className="spin" /> : <UploadCloud size={16} />}{importing ? '正在导入' : '开始导入'}</Button> : null}</div>
      </footer>
    </main>
  );
}

function SourceFiles({ items, addFiles, remove }: { items: PendingFile[]; addFiles: (files: File[]) => void; remove: (id: string) => void }) {
  return <div className="import-source-body"><label className="upload-zone"><UploadCloud size={30} /><strong>点击或拖拽文件到此处</strong><span>支持 PDF、DOCX、Markdown、图片、XLSX/XLSM、CSV</span><input type="file" multiple accept=".pdf,.docx,.md,.markdown,.png,.jpg,.jpeg,.webp,.xlsx,.xlsm,.csv" onChange={(event) => addFiles(Array.from(event.target.files ?? []))} /></label><SourceFileList items={items} remove={remove} /></div>;
}

function SourceFileList({ items, remove }: { items: PendingFile[]; remove: (id: string) => void }) {
  return <div className="pending-files">{items.map((item) => { const TableIcon = /\.(csv|xlsx|xlsm)$/i.test(item.file.name) ? FileSpreadsheet : FileText; return <div key={item.id}><TableIcon size={18} /><span><strong>{item.file.name}</strong><small>{formatBytes(item.file.size)} · 推荐 {methodMeta.find((method) => method.value === item.config.method)?.label}</small></span><Button variant="ghost" aria-label={`移除 ${item.file.name}`} onClick={() => remove(item.id)}><X size={15} /></Button></div>; })}</div>;
}

function ChunkFields({ config, patch }: { config: ApiChunkConfig; patch: (value: Partial<ApiChunkConfig>) => void }) {
  return <div className="chunk-field-grid">
    {['recursive', 'heading', 'separator', 'fixed'].includes(config.method) ? <><label className="form-label">块大小<input className="field" type="number" min={50} max={12000} value={config.chunk_size} onChange={(event) => patch({ chunk_size: Number(event.target.value) })} /></label><label className="form-label">重叠字符<input className="field" type="number" min={0} max={1000} value={config.chunk_overlap} onChange={(event) => patch({ chunk_overlap: Number(event.target.value) })} /></label></> : null}
    {config.method === 'heading' ? <label className="form-label">标题层级<select className="field" value={config.heading_level} onChange={(event) => patch({ heading_level: Number(event.target.value) })}><option value={1}>H1</option><option value={2}>H1–H2</option><option value={3}>H1–H3</option><option value={4}>H1–H4</option></select></label> : null}
    {config.method === 'separator' ? <label className="form-label span-2">分隔符（每行一个）<textarea className="field" value={config.separators.join('\n')} onChange={(event) => patch({ separators: event.target.value.split('\n').filter(Boolean) })} /></label> : null}
    {config.method === 'parent_child' ? <><label className="form-label">父块大小<input className="field" type="number" value={config.parent_chunk_size} onChange={(event) => patch({ parent_chunk_size: Number(event.target.value) })} /></label><label className="form-label">子块大小<input className="field" type="number" value={config.child_chunk_size} onChange={(event) => patch({ child_chunk_size: Number(event.target.value) })} /></label></> : null}
    {config.method === 'table_row' ? <label className="form-label">每块行数<input className="field" type="number" min={1} max={20} value={config.rows_per_chunk} onChange={(event) => patch({ rows_per_chunk: Number(event.target.value) })} /></label> : null}
  </div>;
}

function PreviewPanel({ preview }: { preview: ApiChunkPreview }) {
  const average = preview.chunks.length ? Math.round(preview.chunks.reduce((sum, chunk) => sum + chunk.char_count, 0) / preview.chunks.length) : 0;
  return <div className="chunk-preview"><header><strong>真实切块预览</strong><span>{preview.total_chunks} 块 · 平均 {average} 字{preview.page_count ? ` · ${preview.page_count} 页` : ''}</span></header>{preview.warnings.map((warning) => <Notice key={warning} tone="warning" title="解析提示">{warning}</Notice>)}<div className="chunk-preview-list">{preview.chunks.map((chunk) => <article key={chunk.ordinal}><div><Badge tone="info">#{chunk.ordinal}</Badge><strong>{chunk.title}</strong><small>{chunk.char_count} 字</small></div><p>{chunk.content}</p></article>)}</div></div>;
}
