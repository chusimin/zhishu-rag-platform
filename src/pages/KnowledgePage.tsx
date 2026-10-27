import { ArrowRight, Database, FilePlus2, Plus, Search, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, errorMessage, formatDateTime, type ApiKnowledgeBase, type ApiModelOption } from '../api/client';
import { Badge, Button, Modal, Notice, PageHeader } from '../components/ui';
import { useToast } from '../components/Toast';

export function KnowledgePage() {
  const [items, setItems] = useState<ApiKnowledgeBase[]>([]);
  const [models, setModels] = useState<ApiModelOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [embeddingId, setEmbeddingId] = useState('');
  const [rerankId, setRerankId] = useState('');
  const [ocrId, setOcrId] = useState('');
  const [chunkMethod, setChunkMethod] = useState<ApiKnowledgeBase['chunk_method']>('recursive');
  const [semanticLlmId, setSemanticLlmId] = useState('');
  const [metadataLlmId, setMetadataLlmId] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const load = async () => {
    try {
      const [knowledge, configuredModels] = await Promise.all([
        apiFetch<ApiKnowledgeBase[]>('/knowledge-bases'),
        apiFetch<ApiModelOption[]>('/model-options'),
      ]);
      setItems(knowledge);
      setModels(configuredModels);
      setEmbeddingId((current) => current || configuredModels.find((model) => model.model_type === 'embedding' && model.is_enabled && model.connection_status !== 'error')?.id || '');
      setRerankId((current) => current || configuredModels.find((model) => model.model_type === 'rerank' && model.is_enabled && model.connection_status !== 'error')?.id || '');
      setOcrId((current) => current || configuredModels.find((model) => model.model_type === 'ocr' && model.is_enabled && model.connection_status !== 'error')?.id || '');
      setSemanticLlmId((current) => current || configuredModels.find((model) => model.model_type === 'llm' && model.is_enabled && model.connection_status !== 'error')?.id || '');
      setMetadataLlmId((current) => current || configuredModels.find((model) => model.model_type === 'llm' && model.is_enabled && model.connection_status !== 'error')?.id || '');
      setError('');
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  useEffect(() => { void load(); }, []);

  const embeddings = models.filter((model) => model.model_type === 'embedding' && model.is_enabled && model.connection_status !== 'error');
  const rerankers = models.filter((model) => model.model_type === 'rerank' && model.is_enabled && model.connection_status !== 'error');
  const ocrModels = models.filter((model) => model.model_type === 'ocr' && model.is_enabled && model.connection_status !== 'error');
  const llms = models.filter((model) => model.model_type === 'llm' && model.is_enabled && model.connection_status !== 'error');
  const modelById = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);
  const visible = items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()));

  const createKnowledge = async () => {
    if (!name.trim() || !embeddingId) return;
    setSaving(true);
    try {
      const created = await apiFetch<ApiKnowledgeBase>('/knowledge-bases', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), description, embedding_model_id: embeddingId, rerank_model_id: rerankId || null, ocr_model_id: ocrId || null, chunk_method: chunkMethod, chunk_size: 800, chunk_overlap: 120, parent_chunk_size: 1600, child_chunk_size: 400, semantic_llm_model_id: chunkMethod === 'semantic' ? semanticLlmId : null, metadata_llm_model_id: metadataLlmId || null }),
      });
      setCreating(false);
      setName('');
      setDescription('');
      showToast('知识库已创建');
      await load();
      navigate(`/knowledge/${created.id}`);
    } catch (caught) {
      showToast(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page page-enter">
      <PageHeader eyebrow="知识资产" title="知识库" description="导入企业资料，跟踪解析与索引状态，并在上线前验证每一条召回结果。" actions={<Button variant="primary" icon={<Plus size={17} />} onClick={() => setCreating(true)}>新建知识库</Button>} />
      {error ? <Notice tone="error" title="无法读取知识库">{error}</Notice> : null}
      <div className="toolbar"><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="搜索知识库" placeholder="搜索知识库" /></label><div className="toolbar-spacer" /></div>
      <div className="kb-grid">
        {visible.map((item) => {
          const status = item.chunk_count > 0 ? '可用' : item.file_count > 0 ? '处理中' : '待导入';
          return <article className="card kb-card" key={item.id}><header><span className="kb-icon"><Database size={21} /></span><Badge tone={status === '可用' ? 'success' : 'warning'}>{status}</Badge></header><h2>{item.name}</h2><p>{item.description || '尚未填写知识库说明。'}</p><dl><div><dt>文件</dt><dd>{item.file_count}</dd></div><div><dt>分块</dt><dd>{item.chunk_count.toLocaleString()}</dd></div><div><dt>Embedding</dt><dd>{modelById.get(item.embedding_model_id ?? '')?.display_name ?? '未配置'}</dd></div></dl><footer><span>更新于 {formatDateTime(item.updated_at)}</span><Button variant="ghost" icon={<ArrowRight size={16} />} onClick={() => navigate(`/knowledge/${item.id}`)}>打开</Button></footer></article>;
        })}
      </div>
      {visible.length === 0 ? <section className="card empty-state"><Search size={28} /><h2>{search ? '没有匹配的知识库' : '尚未创建知识库'}</h2><p>{embeddings.length ? '新建知识库后即可导入资料。' : '请先由管理员配置可用的 Embedding 模型。'}</p></section> : null}
      <Modal open={creating} title="新建知识库" description="定义模型与分块参数后即可导入资料。" onClose={() => setCreating(false)} footer={<><Button onClick={() => setCreating(false)}>取消</Button><Button variant="primary" disabled={!name.trim() || !embeddingId || saving || (chunkMethod === 'semantic' && !semanticLlmId)} icon={<FilePlus2 size={17} />} onClick={createKnowledge}>{saving ? '创建中…' : '创建知识库'}</Button></>}>
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void createKnowledge(); }}>
          <label className="form-label">知识库名称<input autoFocus className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：客户服务知识库" /></label>
          <label className="form-label">知识库描述<textarea className="field" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="说明资料范围和主要使用场景" /></label>
          <label className="form-label">Embedding 模型<select className="field" value={embeddingId} onChange={(event) => setEmbeddingId(event.target.value)}><option value="">请选择</option>{embeddings.map((model) => <option value={model.id} key={model.id}>{model.display_name} · {model.provider}</option>)}</select><small>更换模型后需要重建全部索引。</small></label>
          <label className="form-label">Rerank 模型<select className="field" value={rerankId} onChange={(event) => setRerankId(event.target.value)}><option value="">暂不使用</option>{rerankers.map((model) => <option value={model.id} key={model.id}>{model.display_name} · {model.provider}</option>)}</select></label>
          <label className="form-label">OCR 模型<select className="field" value={ocrId} onChange={(event) => setOcrId(event.target.value)}><option value="">暂不使用</option>{ocrModels.map((model) => <option value={model.id} key={model.id}>{model.display_name} · {model.provider}</option>)}</select><small>图片、扫描 PDF 和文档内图片需要云端 OCR；纯文本资料可以不配置。</small></label>
          <label className="form-label">元数据抽取 LLM<select className="field" value={metadataLlmId} onChange={(event) => setMetadataLlmId(event.target.value)}><option value="">基础规则抽取</option>{llms.map((model) => <option value={model.id} key={model.id}>{model.display_name} · {model.provider}</option>)}</select><small>自动生成时间、版本、主体、负责人、关键词和可能问题，并写入向量索引。</small></label>
          <label className="form-label">切块方式<select className="field" value={chunkMethod} onChange={(event) => setChunkMethod(event.target.value as ApiKnowledgeBase['chunk_method'])}><option value="recursive">结构递归切分</option><option value="parent_child">父子切分（子块召回、父块返回）</option><option value="semantic">LLM 语义切分</option></select></label>
          {chunkMethod === 'semantic' ? <label className="form-label">语义切分 LLM<select className="field" value={semanticLlmId} onChange={(event) => setSemanticLlmId(event.target.value)}><option value="">请选择</option>{llms.map((model) => <option value={model.id} key={model.id}>{model.display_name} · {model.provider}</option>)}</select><small>构建索引时调用该模型理解主题边界；模型输出改写原文时任务会失败，不会静默写入。</small></label> : null}
          <div className="mini-setting"><Settings2 size={17} /><span><strong>{chunkMethod === 'parent_child' ? '父块 1600 · 子块 400' : chunkMethod === 'semantic' ? 'LLM 识别主题边界' : '结构优先 · 800 字符 · 120 字符重叠'}</strong><small>创建后可在知识库详情中调整并重建索引</small></span></div>
          {!embeddings.length ? <Notice tone="warning" title="缺少 Embedding 模型">请先由管理员在模型服务中完成配置。</Notice> : null}
          {!ocrModels.length ? <Notice tone="warning" title="尚未配置 OCR 模型">图片和扫描件会解析失败；请先由管理员在模型服务中接入 OCR。</Notice> : null}
        </form>
      </Modal>
    </main>
  );
}
