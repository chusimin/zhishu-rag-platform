import { AlertTriangle, Check, CheckCircle2, FileImage, FileSpreadsheet, FileText, LoaderCircle, Plus, RefreshCw, Settings2, Tags, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch, errorMessage, formatDateTime, type ApiImportJob, type ApiKnowledgeBase, type ApiKnowledgeFile, type ApiModelOption } from '../api/client';
import { KnowledgeNav } from '../components/KnowledgeNav';
import { useToast } from '../components/Toast';
import { Badge, Button, Drawer, Modal, Notice, PageHeader } from '../components/ui';

const statusLabels: Record<string, string> = { queued: '排队中', uploading: '校验中', parsing: '解析中', chunking: '分块中', indexing: '索引中', completed: '已索引', failed: '处理失败' };
const stageLabels: Record<string, string> = { file_validation: '文件校验', content_parsing: '内容解析', metadata_extraction: '元数据抽取', metadata_preserved: '人工元数据', chunking: '结构分块', embedding: '向量索引', completed: '构建完成', failed: '构建失败' };
const activeStatuses = new Set(['queued', 'uploading', 'parsing', 'chunking', 'indexing']);

function iconFor(extension: string) {
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) return FileImage;
  if (['.xlsx', '.xlsm', '.csv'].includes(extension)) return FileSpreadsheet;
  return FileText;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function splitMetadataList(value: string) {
  return value.split(/[\n,，、]+/).map((item) => item.trim()).filter(Boolean);
}

export function KnowledgeDetailPage() {
  const { id = '' } = useParams();
  const [kb, setKb] = useState<ApiKnowledgeBase | null>(null);
  const [files, setFiles] = useState<ApiKnowledgeFile[]>([]);
  const [jobs, setJobs] = useState<ApiImportJob[]>([]);
  const [models, setModels] = useState<ApiModelOption[]>([]);
  const [ocrId, setOcrId] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chunkMethod, setChunkMethod] = useState<ApiKnowledgeBase['chunk_method']>('recursive');
  const [chunkSize, setChunkSize] = useState(800);
  const [chunkOverlap, setChunkOverlap] = useState(120);
  const [parentChunkSize, setParentChunkSize] = useState(1600);
  const [childChunkSize, setChildChunkSize] = useState(400);
  const [semanticLlmId, setSemanticLlmId] = useState('');
  const [metadataLlmId, setMetadataLlmId] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [metadataFile, setMetadataFile] = useState<ApiKnowledgeFile | null>(null);
  const [metadataTime, setMetadataTime] = useState('');
  const [metadataVersion, setMetadataVersion] = useState('');
  const [metadataSubjects, setMetadataSubjects] = useState('');
  const [metadataOwner, setMetadataOwner] = useState('');
  const [metadataKeywords, setMetadataKeywords] = useState('');
  const [metadataQuestions, setMetadataQuestions] = useState('');
  const [savingMetadata, setSavingMetadata] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [knowledge, importedFiles, importJobs, configuredModels] = await Promise.all([
        apiFetch<ApiKnowledgeBase>(`/knowledge-bases/${id}`),
        apiFetch<ApiKnowledgeFile[]>(`/knowledge-bases/${id}/files`),
        apiFetch<ApiImportJob[]>(`/knowledge-bases/${id}/import-jobs`),
        apiFetch<ApiModelOption[]>('/model-options'),
      ]);
      setKb(knowledge);
      setFiles(importedFiles);
      setJobs(importJobs);
      setModels(configuredModels);
      setOcrId(knowledge.ocr_model_id ?? '');
      setChunkMethod(knowledge.chunk_method);
      setChunkSize(knowledge.chunk_size);
      setChunkOverlap(knowledge.chunk_overlap);
      setParentChunkSize(knowledge.parent_chunk_size);
      setChildChunkSize(knowledge.child_chunk_size);
      setSemanticLlmId(knowledge.semantic_llm_model_id ?? '');
      setMetadataLlmId(knowledge.metadata_llm_model_id ?? '');
      setError('');
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const activeJobs = jobs.filter((job) => activeStatuses.has(job.status));
  useEffect(() => {
    if (!activeJobs.length) return;
    const timer = window.setTimeout(async () => {
      try {
        const refreshed = await Promise.all(activeJobs.map((job) => apiFetch<ApiImportJob>(`/knowledge-bases/import-jobs/${job.id}`)));
        setJobs((current) => current.map((job) => refreshed.find((item) => item.id === job.id) ?? job));
        if (refreshed.every((job) => !activeStatuses.has(job.status))) await load();
      } catch (caught) {
        setError(errorMessage(caught));
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [activeJobs.map((job) => `${job.id}:${job.status}`).join('|'), load]);

  const startImport = async () => {
    if (!selectedFiles.length || !id) return;
    setUploading(true);
    try {
      if (ocrId !== (kb?.ocr_model_id ?? '')) {
        const updated = await apiFetch<ApiKnowledgeBase>(`/knowledge-bases/${id}`, { method: 'PATCH', body: JSON.stringify({ ocr_model_id: ocrId || null }) });
        setKb(updated);
      }
      const created: ApiImportJob[] = [];
      const failures: string[] = [];
      for (const file of selectedFiles) {
        try {
          const form = new FormData();
          form.append('upload', file);
          const response = await apiFetch<{ file: ApiKnowledgeFile; job: ApiImportJob }>(`/knowledge-bases/${id}/files`, { method: 'POST', body: form });
          created.push(response.job);
        } catch (caught) {
          failures.push(`${file.name}：${errorMessage(caught)}`);
        }
      }
      if (created.length) {
        setJobs((current) => [...created, ...current]);
        setSelectedFiles([]);
        setImportOpen(false);
        setTaskOpen(true);
        showToast(`${created.length} 个文件已提交构建${failures.length ? `，${failures.length} 个失败` : ''}`);
        await load();
      }
      if (failures.length) showToast(failures.join('；'), 'error');
    } catch (caught) {
      showToast(errorMessage(caught));
    } finally {
      setUploading(false);
    }
  };

  const rebuild = async () => {
    if (!id) return;
    try {
      const created = await apiFetch<ApiImportJob[]>(`/knowledge-bases/${id}/rebuild`, { method: 'POST' });
      setJobs((current) => [...created, ...current]);
      setTaskOpen(true);
      showToast('重建任务已提交');
    } catch (caught) {
      showToast(errorMessage(caught));
    }
  };

  const saveChunkSettings = async () => {
    if (!id) return;
    setSavingSettings(true);
    try {
      const updated = await apiFetch<ApiKnowledgeBase>(`/knowledge-bases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          chunk_method: chunkMethod,
          chunk_size: chunkSize,
          chunk_overlap: chunkOverlap,
          parent_chunk_size: parentChunkSize,
          child_chunk_size: childChunkSize,
          semantic_llm_model_id: chunkMethod === 'semantic' ? semanticLlmId : null,
          metadata_llm_model_id: metadataLlmId || null,
        }),
      });
      setKb(updated);
      setSettingsOpen(false);
      showToast('索引配置已保存，请重建索引后生效');
    } catch (caught) {
      showToast(errorMessage(caught));
    } finally {
      setSavingSettings(false);
    }
  };

  const openMetadata = (file: ApiKnowledgeFile) => {
    const metadata = file.document_metadata ?? {};
    setMetadataFile(file);
    setMetadataTime(metadata.document_time ?? '');
    setMetadataVersion(metadata.version ?? '');
    setMetadataSubjects((metadata.subjects ?? []).join('、'));
    setMetadataOwner(metadata.owner ?? '');
    setMetadataKeywords((metadata.keywords ?? []).join('、'));
    setMetadataQuestions((metadata.likely_questions ?? []).join('\n'));
  };

  const saveMetadata = async () => {
    if (!id || !metadataFile) return;
    setSavingMetadata(true);
    try {
      await apiFetch<ApiKnowledgeFile>(`/knowledge-bases/${id}/files/${metadataFile.id}/metadata`, {
        method: 'PATCH',
        body: JSON.stringify({
          document_time: metadataTime.trim() || null,
          version: metadataVersion.trim() || null,
          subjects: splitMetadataList(metadataSubjects),
          owner: metadataOwner.trim() || null,
          keywords: splitMetadataList(metadataKeywords),
          likely_questions: splitMetadataList(metadataQuestions),
        }),
      });
      setMetadataFile(null);
      showToast('元数据已保存，相关分块已标记为待重建');
      await load();
    } catch (caught) {
      showToast(errorMessage(caught));
    } finally {
      setSavingMetadata(false);
    }
  };

  const displayJobs = activeJobs.length ? activeJobs : jobs.slice(0, 1);
  const displayJob = displayJobs[0];
  const averageProgress = displayJobs.length ? Math.round(displayJobs.reduce((sum, job) => sum + job.progress, 0) / displayJobs.length) : 0;
  const failedFiles = files.filter((file) => file.status === 'failed');
  const embeddingName = useMemo(() => models.find((model) => model.id === kb?.embedding_model_id)?.display_name ?? '未配置', [kb, models]);
  const ocrName = useMemo(() => models.find((model) => model.id === kb?.ocr_model_id)?.display_name ?? '未配置', [kb, models]);
  const metadataModelName = useMemo(() => models.find((model) => model.id === kb?.metadata_llm_model_id)?.display_name ?? '基础规则', [kb, models]);
  const ocrModels = models.filter((model) => model.model_type === 'ocr' && model.is_enabled && model.connection_status !== 'error');
  const llms = models.filter((model) => model.model_type === 'llm' && model.is_enabled && model.connection_status !== 'error');
  const imageSelected = selectedFiles.some((file) => ['.png', '.jpg', '.jpeg', '.webp'].some((extension) => file.name.toLowerCase().endsWith(extension)));

  if (!kb) return <main className="page page-enter">{error ? <Notice tone="error" title="无法加载知识库">{error}</Notice> : <div className="card empty-state"><LoaderCircle className="spin" /><h2>正在加载知识库</h2></div>}</main>;

  return (
    <div className="workspace-with-resource">
      <KnowledgeNav id={kb.id} name={kb.name} />
      <main className="page page-enter resource-page">
        <PageHeader eyebrow="知识库 / 文件与任务" title={kb.name} description={kb.description || '尚未填写知识库说明。'} actions={<><Button icon={<Settings2 size={16} />} onClick={() => setSettingsOpen(true)}>索引设置</Button><Button icon={<RefreshCw size={16} />} onClick={() => { setTaskOpen(true); void load(); }}>查看构建任务</Button><Button variant="primary" icon={<Plus size={17} />} onClick={() => setImportOpen(true)}>导入文件</Button></>} />
        {error ? <Notice tone="error" title="后端请求失败">{error}</Notice> : null}
        <div className="detail-summary"><div><span>文件</span><strong>{kb.file_count}</strong></div><div><span>可用分块</span><strong>{kb.chunk_count.toLocaleString()}</strong></div><div><span>切块方式</span><strong>{kb.chunk_method === 'parent_child' ? '父子切分' : kb.chunk_method === 'semantic' ? '语义切分' : '结构递归'}</strong></div><div><span>向量模型</span><strong>{embeddingName}</strong></div><div><span>元数据抽取</span><strong>{metadataModelName}</strong></div><div><span>OCR 模型</span><strong>{ocrName}</strong></div><div><span>最后更新</span><strong>{formatDateTime(kb.updated_at)}</strong></div></div>
        {failedFiles.length ? <Notice tone="warning" title={`${failedFiles.length} 个文件需要处理`}>{failedFiles.map((file) => `${file.filename}：${file.error_message ?? '处理失败'}`).join('；')}</Notice> : null}
        <section className="card table-card">
          <div className="table-heading"><div><h2>已导入文件</h2><p>支持 DOCX、PDF、Markdown、图片、XLSX/XLSM 和 CSV</p></div><Button icon={<RefreshCw size={15} />} onClick={rebuild} disabled={!files.length}>重建全部索引</Button></div>
          <table className="data-table"><thead><tr><th>文件</th><th>处理状态</th><th>分块</th><th>元数据</th><th>更新时间</th><th>错误</th></tr></thead><tbody>{files.map((file) => { const Icon = iconFor(file.extension); const metadataReady = Boolean(file.document_metadata?.extraction_status); return <tr key={file.id}><td><div className="file-cell"><span className="row-icon"><Icon size={17} /></span><span><strong>{file.filename}</strong><small>{file.extension.toUpperCase()} · {formatBytes(file.size_bytes)}{file.page_count ? ` · ${file.page_count} 页` : ''}</small></span></div></td><td><Badge tone={file.status === 'completed' ? 'success' : file.status === 'failed' ? 'error' : 'warning'}>{statusLabels[file.status] ?? file.status}</Badge></td><td>{file.chunk_count || '—'}</td><td><Button variant="ghost" icon={<Tags size={15} />} disabled={!metadataReady} onClick={() => openMetadata(file)}>{metadataReady ? '查看 / 编辑' : '待抽取'}</Button></td><td>{formatDateTime(file.updated_at)}</td><td>{file.error_message ?? '—'}</td></tr>; })}</tbody></table>
          <div className="mobile-card-list">{files.map((file) => <div className="mobile-file-card" key={file.id}><div><strong>{file.filename}</strong><small>{formatBytes(file.size_bytes)} · {file.chunk_count ? `${file.chunk_count} 个分块` : '未生成分块'}</small></div><Button variant="ghost" icon={<Tags size={15} />} disabled={!file.document_metadata?.extraction_status} onClick={() => openMetadata(file)}>元数据</Button></div>)}</div>
          {!files.length ? <div className="empty-state"><UploadCloud size={28} /><h2>还没有知识文件</h2><p>导入第一份资料以开始构建索引。</p></div> : null}
        </section>

        <Modal open={settingsOpen} title="索引增强设置" description="调整后现有向量会标记为待重建，重建完成后新策略才会生效。" onClose={() => setSettingsOpen(false)} footer={<><Button onClick={() => setSettingsOpen(false)}>取消</Button><Button variant="primary" disabled={savingSettings || chunkOverlap >= chunkSize || childChunkSize >= parentChunkSize || (chunkMethod === 'semantic' && !semanticLlmId)} onClick={() => void saveChunkSettings()}>{savingSettings ? '保存中…' : '保存设置'}</Button></>}>
          <div className="form-stack">
            <label className="form-label">元数据抽取 LLM<select className="field" value={metadataLlmId} onChange={(event) => setMetadataLlmId(event.target.value)}><option value="">基础规则抽取</option>{llms.map((model) => <option value={model.id} key={model.id}>{model.display_name} · {model.provider}</option>)}</select><small>构建时自动抽取时间、版本、主体、负责人、关键词和可能问题，并加入每个分块的向量化输入。</small></label>
            <Notice tone="info" title="元数据用于召回增强">原始正文不会被改写；模型抽取失败会让构建任务明确失败，不会把空结果伪装成成功。</Notice>
            <label className="form-label">切块方式<select className="field" value={chunkMethod} onChange={(event) => setChunkMethod(event.target.value as ApiKnowledgeBase['chunk_method'])}><option value="recursive">结构递归切分</option><option value="parent_child">父子切分</option><option value="semantic">LLM 语义切分</option></select></label>
            {chunkMethod === 'recursive' ? <div className="inline-fields"><label className="form-label">块大小<input className="field" type="number" min="100" max="4000" value={chunkSize} onChange={(event) => setChunkSize(Number(event.target.value))} /></label><label className="form-label">重叠字符<input className="field" type="number" min="0" max="1000" value={chunkOverlap} onChange={(event) => setChunkOverlap(Number(event.target.value))} /></label></div> : null}
            {chunkMethod === 'parent_child' ? <><div className="inline-fields"><label className="form-label">父块大小<input className="field" type="number" min="200" max="12000" value={parentChunkSize} onChange={(event) => setParentChunkSize(Number(event.target.value))} /></label><label className="form-label">子块大小<input className="field" type="number" min="80" max="4000" value={childChunkSize} onChange={(event) => setChildChunkSize(Number(event.target.value))} /></label></div><Notice tone="info" title="召回小块，返回完整上下文">子块用于向量匹配；命中后将父块提供给 Rerank 和 LLM，减少断章取义。</Notice></> : null}
            {chunkMethod === 'semantic' ? <><label className="form-label">语义切分 LLM<select className="field" value={semanticLlmId} onChange={(event) => setSemanticLlmId(event.target.value)}><option value="">请选择</option>{llms.map((model) => <option value={model.id} key={model.id}>{model.display_name} · {model.provider}</option>)}</select></label><label className="form-label">单次安全输入上限<input className="field" type="number" min="2000" max="8000" value={parentChunkSize} onChange={(event) => setParentChunkSize(Number(event.target.value))} /></label><Notice tone="warning" title="会产生额外 LLM 调用">系统要求模型只返回原文分段；如果模型改写内容或返回无效 JSON，本次构建会明确失败。</Notice></> : null}
          </div>
        </Modal>

        <Modal open={importOpen} title="导入知识文件" description="文件会依次执行解析、元数据抽取、分块和向量化。" onClose={() => setImportOpen(false)} footer={<><Button onClick={() => setImportOpen(false)}>取消</Button><Button variant="primary" icon={<UploadCloud size={17} />} disabled={!selectedFiles.length || uploading || (imageSelected && !ocrId)} onClick={startImport}>{uploading ? '上传中…' : `开始导入${selectedFiles.length ? `（${selectedFiles.length}）` : ''}`}</Button></>}>
          <Notice tone={ocrId ? 'success' : 'warning'} title={ocrId ? '已选择云端 OCR' : '图片内容需要云端 OCR'}>{ocrId ? `将使用 ${models.find((model) => model.id === ocrId)?.display_name ?? '所选模型'} 解析图片与扫描页。` : '系统不会下载本地 OCR 模型；请选择 OCR，否则图片和扫描型 PDF 可能解析失败。'}</Notice>
          <label className="form-label">OCR 模型<select className="field" value={ocrId} onChange={(event) => setOcrId(event.target.value)}><option value="">暂不使用</option>{ocrModels.map((model) => <option value={model.id} key={model.id}>{model.display_name} · {model.provider}</option>)}</select><small>该选择会保存到当前知识库，并用于后续导入和重建。</small></label>
          {!ocrModels.length ? <Notice tone="error" title="没有可用 OCR 模型">请先到“模型服务”接入并启用 OCR 模型。</Notice> : null}
          <label className={`upload-zone ${dragActive ? 'upload-zone--active' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragActive(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }} onDrop={(event) => { event.preventDefault(); setDragActive(false); setSelectedFiles(Array.from(event.dataTransfer.files)); }}><UploadCloud size={28} /><strong>{dragActive ? '松开以添加文件' : '拖放文件到这里，或点击选择'}</strong><span>DOCX、PDF、MD、PNG/JPG/WEBP、XLSX/XLSM、CSV · 单文件上限由后端配置</span><input type="file" multiple accept=".docx,.pdf,.md,.markdown,.png,.jpg,.jpeg,.webp,.xlsx,.xlsm,.csv" onChange={(event) => { setSelectedFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label>
          {selectedFiles.length ? <div className="sample-files"><header><strong>已选择 {selectedFiles.length} 个文件</strong></header>{selectedFiles.map((file) => <div key={`${file.name}-${file.size}`}><FileText size={17} /><span><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span><Check size={17} /></div>)}</div> : null}
        </Modal>

        <Drawer open={Boolean(metadataFile)} title="文档元数据" description={metadataFile?.filename ?? ''} onClose={() => setMetadataFile(null)} footer={<><Button onClick={() => setMetadataFile(null)}>取消</Button><Button variant="primary" disabled={savingMetadata} onClick={() => void saveMetadata()}>{savingMetadata ? '保存中…' : '保存元数据'}</Button></>}>
          {metadataFile ? <div className="form-stack metadata-editor">
            <Notice tone={metadataFile.document_metadata.extraction_method === 'llm' ? 'success' : 'info'} title={metadataFile.document_metadata.extraction_method === 'llm' ? 'LLM 自动抽取' : metadataFile.document_metadata.extraction_method === 'manual' ? '人工修订' : '基础规则抽取'}>保存修改后，该文件的现有向量会失效；点击“重建全部索引”后，修订内容才会进入检索。</Notice>
            <div className="inline-fields"><label className="form-label">时间<input className="field" value={metadataTime} onChange={(event) => setMetadataTime(event.target.value)} placeholder="例如：2026-10-26" /></label><label className="form-label">版本<input className="field" value={metadataVersion} onChange={(event) => setMetadataVersion(event.target.value)} placeholder="例如：V1.2" /></label></div>
            <label className="form-label">主体信息<input className="field" value={metadataSubjects} onChange={(event) => setMetadataSubjects(event.target.value)} placeholder="企业、产品、制度对象或项目，用顿号分隔" /></label>
            <label className="form-label">负责人 / 责任部门<input className="field" value={metadataOwner} onChange={(event) => setMetadataOwner(event.target.value)} placeholder="例如：人力资源部 / 张三" /></label>
            <label className="form-label">检索关键词<textarea className="field compact-textarea" value={metadataKeywords} onChange={(event) => setMetadataKeywords(event.target.value)} placeholder="关键词之间用逗号、顿号或换行分隔" /></label>
            <label className="form-label">可能被问到的问题<textarea className="field metadata-questions" value={metadataQuestions} onChange={(event) => setMetadataQuestions(event.target.value)} placeholder="每行一个可由本文回答的问题" /></label>
            <div className="metadata-audit"><span>抽取时间</span><strong>{metadataFile.document_metadata.extracted_at ? formatDateTime(metadataFile.document_metadata.extracted_at) : '—'}</strong><span>抽取模型</span><strong>{models.find((model) => model.id === metadataFile.document_metadata.model_id)?.display_name ?? '基础规则 / 人工'}</strong></div>
          </div> : null}
        </Drawer>

        <Drawer open={taskOpen} title="构建任务" description={displayJob ? `任务 ${displayJob.id}` : '暂无构建任务'} onClose={() => setTaskOpen(false)} footer={<Button variant="primary" onClick={() => setTaskOpen(false)}>关闭</Button>}>
          {displayJob ? <><div className="task-summary"><span>{displayJob.status === 'completed' ? <CheckCircle2 size={20} /> : displayJob.status === 'failed' ? <AlertTriangle size={20} /> : <LoaderCircle size={20} className="spin" />}</span><div><strong>{displayJob.status === 'completed' ? '知识索引构建完成' : displayJob.status === 'failed' ? '构建失败' : '正在构建知识索引'}</strong><p>{displayJobs.length} 个任务 · 当前阶段 {stageLabels[displayJob.current_stage] ?? displayJob.current_stage}</p></div><em>{averageProgress}%</em></div><div className="progress-track"><div className="progress-value" style={{ width: `${averageProgress}%` }} /></div><ol className="stage-list">{displayJob.stage_details.map((item, index) => <li className={`stage-item stage-item--${item.status === 'active' ? 'active' : item.status === 'success' ? 'done' : item.status === 'error' ? 'active' : 'pending'}`} key={`${item.name}-${index}`}><span>{item.status === 'success' ? <Check size={16} /> : item.status === 'active' ? <LoaderCircle size={16} className="spin" /> : item.status === 'error' ? <AlertTriangle size={16} /> : index + 1}</span><div><strong>{stageLabels[item.name] ?? item.name}</strong><small>{item.detail}</small></div></li>)}</ol>{displayJob.error_message ? <Notice tone="error" title="任务失败">{displayJob.error_message}</Notice> : null}</> : <Notice tone="info" title="暂无任务">导入文件或点击重建后，可在这里查看实时进度。</Notice>}
        </Drawer>
      </main>
    </div>
  );
}
