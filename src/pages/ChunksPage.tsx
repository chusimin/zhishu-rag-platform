import { Check, FileText, LoaderCircle, Pencil, RefreshCw, Scissors, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch, errorMessage, type ApiChunk, type ApiImportJob, type ApiKnowledgeBase, type ApiKnowledgeFile } from '../api/client';
import { KnowledgeNav } from '../components/KnowledgeNav';
import { useToast } from '../components/Toast';
import { Badge, Button, Drawer, Notice, PageHeader } from '../components/ui';

export function ChunksPage() {
  const { id = '' } = useParams();
  const [kb, setKb] = useState<ApiKnowledgeBase | null>(null);
  const [files, setFiles] = useState<ApiKnowledgeFile[]>([]);
  const [chunks, setChunks] = useState<ApiChunk[]>([]);
  const [fileId, setFileId] = useState('');
  const [selected, setSelected] = useState<ApiChunk | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [chunkSize, setChunkSize] = useState(800);
  const [overlap, setOverlap] = useState(120);
  const [error, setError] = useState('');
  const { showToast } = useToast();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [knowledge, importedFiles, loadedChunks] = await Promise.all([
        apiFetch<ApiKnowledgeBase>(`/knowledge-bases/${id}`),
        apiFetch<ApiKnowledgeFile[]>(`/knowledge-bases/${id}/files`),
        apiFetch<ApiChunk[]>(`/knowledge-bases/${id}/chunks`),
      ]);
      setKb(knowledge);
      setFiles(importedFiles);
      setChunks(loadedChunks);
      setFileId((current) => current || importedFiles[0]?.id || '');
      setSelected((current) => loadedChunks.find((chunk) => chunk.id === current?.id) ?? loadedChunks[0] ?? null);
      setChunkSize(knowledge.chunk_size);
      setOverlap(knowledge.chunk_overlap);
      setError('');
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const visibleChunks = useMemo(() => fileId ? chunks.filter((chunk) => chunk.file_id === fileId) : chunks, [chunks, fileId]);
  const selectedFile = files.find((file) => file.id === fileId);

  const selectDocument = (nextFileId: string) => {
    setFileId(nextFileId);
    setSelected(chunks.find((chunk) => chunk.file_id === nextFileId) ?? null);
  };

  const openEditor = (chunk: ApiChunk) => {
    setSelected(chunk);
    setDraftTitle(chunk.title);
    setDraft(chunk.content);
    setEditing(true);
  };

  const saveChunk = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await apiFetch<ApiChunk>(`/knowledge-bases/${id}/chunks/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ title: draftTitle, content: draft }) });
      setChunks((current) => current.map((chunk) => chunk.id === updated.id ? updated : chunk));
      setSelected(updated);
      setEditing(false);
      showToast('分块已保存；向量已失效，请重建索引');
    } catch (caught) {
      showToast(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const rebuild = async () => {
    setRebuilding(true);
    try {
      if (kb && (chunkSize !== kb.chunk_size || overlap !== kb.chunk_overlap)) {
        await apiFetch(`/knowledge-bases/${id}`, { method: 'PATCH', body: JSON.stringify({ chunk_size: chunkSize, chunk_overlap: overlap }) });
      }
      const jobs = await apiFetch<ApiImportJob[]>(`/knowledge-bases/${id}/rebuild`, { method: 'POST' });
      showToast(`已提交 ${jobs.length} 个重建任务`);
      await load();
    } catch (caught) {
      showToast(errorMessage(caught));
    } finally {
      setRebuilding(false);
    }
  };

  if (!kb) return <main className="page page-enter">{error ? <Notice tone="error" title="无法加载分块">{error}</Notice> : <div className="card empty-state"><LoaderCircle className="spin" /><h2>正在加载分块</h2></div>}</main>;

  return (
    <div className="workspace-with-resource">
      <KnowledgeNav id={kb.id} name={kb.name} />
      <main className="page page-enter resource-page chunk-page">
        <PageHeader eyebrow="知识库 / 分块预览" title="分块预览与编辑" description="检查文档结构、上下文边界和索引状态；人工修改后需要重新生成向量。" actions={<Button variant="primary" icon={<RefreshCw size={16} className={rebuilding ? 'spin' : ''} />} disabled={rebuilding || !files.length} onClick={rebuild}>{rebuilding ? '提交中…' : '重建索引'}</Button>} />
        {error ? <Notice tone="error" title="后端请求失败">{error}</Notice> : null}
        {chunks.some((chunk) => !chunk.indexed) ? <Notice tone="warning" title="存在未索引分块">人工编辑会清除旧向量；请点击“重建索引”恢复检索能力。</Notice> : <Notice tone="info" title="所有分块均已索引">点击任意分块可以查看内容并进行人工修订。</Notice>}
        <label className="form-label document-picker">选择文档<select className="field" value={fileId} onChange={(event) => selectDocument(event.target.value)} disabled={!files.length}>{files.map((file) => <option value={file.id} key={file.id}>{file.filename} · {file.chunk_count} 分块</option>)}</select></label>
        <div className="chunk-workspace">
          <aside className="card document-list"><header><h2>文档</h2><span>{files.length}</span></header>{files.map((file) => <button className={`document-item ${file.id === fileId ? 'active' : ''}`} key={file.id} onClick={() => selectDocument(file.id)}><FileText size={17} /><span><strong>{file.filename}</strong><small>{file.page_count ? `${file.page_count} 页 · ` : ''}{file.chunk_count} 分块</small></span></button>)}</aside>
          <section className="card chunk-canvas"><header className="chunk-canvas-head"><div><strong>{selectedFile?.filename ?? '请选择文档'}</strong><span>{visibleChunks.length} 个分块</span></div></header><div className="chunk-list">{visibleChunks.map((chunk) => <article className={`chunk-block ${selected?.id === chunk.id ? 'chunk-block--selected' : ''}`} key={chunk.id} onClick={() => setSelected(chunk)}><header><div><Badge tone={chunk.indexed ? 'success' : 'warning'}>分块 {chunk.ordinal}</Badge><span className="mono">{chunk.id.slice(0, 8)}</span>{!chunk.indexed ? <Badge tone="warning">待重建</Badge> : null}</div><Button variant="ghost" icon={<Pencil size={15} />} onClick={(event) => { event.stopPropagation(); openEditor(chunk); }}>编辑</Button></header><h3>{chunk.title}</h3><p>{chunk.content}</p><footer>{chunk.page_number ? `第 ${chunk.page_number} 页 · ` : ''}{chunk.char_count} 字符 · {String(chunk.metadata_json.source_type ?? '结构分块')}</footer></article>)}</div>{!visibleChunks.length ? <div className="empty-state"><Scissors size={26} /><h2>该文档尚无分块</h2><p>请检查导入任务状态。</p></div> : null}</section>
          <aside className="card chunk-settings"><header><Settings2 size={17} /><h2>分块参数</h2></header><label className="form-label">策略<select className="field" disabled><option>LangChain 结构优先</option></select></label><label className="form-label">目标长度<input className="field" type="number" min="100" max="4000" value={chunkSize} onChange={(event) => setChunkSize(Number(event.target.value))} /><small>允许 100–4,000 字符</small></label><label className="form-label">重叠长度<input className="field" type="number" min="0" max="1000" value={overlap} onChange={(event) => setOverlap(Number(event.target.value))} /></label><div className="setting-summary"><Scissors size={17} /><div><strong>{chunks.length} 个分块</strong><small>修改参数后需重建全部文件</small></div></div><Button onClick={rebuild} disabled={rebuilding || overlap >= chunkSize}>保存参数并重建</Button></aside>
        </div>
        <Drawer open={editing} title={selected ? `编辑分块 ${selected.id.slice(0, 8)}` : '编辑分块'} description={selected?.page_number ? `来自第 ${selected.page_number} 页` : undefined} onClose={() => setEditing(false)} footer={<><Button onClick={() => setEditing(false)}>取消</Button><Button variant="primary" icon={<Check size={16} />} disabled={!draft.trim() || saving} onClick={saveChunk}>{saving ? '保存中…' : '保存修改'}</Button></>}>
          <form className="form-stack" onSubmit={(event) => event.preventDefault()}><label className="form-label">分块标题<input className="field" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} /></label><label className="form-label">内容<textarea className="field chunk-editor" value={draft} onChange={(event) => setDraft(event.target.value)} /></label><div className="editor-meta"><span>{draft.length} 字符</span><span>{selected?.indexed ? '当前已索引' : '当前未索引'}</span></div><Notice tone="warning" title="保存后需要重建索引">旧向量会立即失效，避免用户检索到与文本不一致的内容。</Notice></form>
        </Drawer>
      </main>
    </div>
  );
}
