import { Check, KeyRound, Link2, ListFilter, Plus, RefreshCw, Search, ServerCog } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  apiFetch,
  errorMessage,
  formatDateTime,
  type ApiModelConfig,
  type ApiOpenRouterCatalog,
  type ApiOpenRouterCatalogModel,
} from '../api/client';
import { Badge, Button, Drawer, Notice, PageHeader } from '../components/ui';
import { useToast } from '../components/Toast';

type TypeFilter = '全部' | 'LLM' | 'Embedding' | 'Rerank' | 'OCR';
type CatalogType = 'llm' | 'embedding' | 'rerank' | 'ocr';
type CatalogProvider = 'openrouter' | 'aihubmix' | 'deepseek';
type Draft = {
  display_name: string;
  provider: 'openrouter' | 'aihubmix' | 'deepseek' | 'tongyi';
  model_type: 'llm' | 'embedding' | 'rerank' | 'ocr';
  model_name: string;
  base_url: string;
  api_key: string;
  is_enabled: boolean;
  rerank_url: string;
  dimensions: string;
  temperature: number;
};

type RerankPreset = {
  provider: Draft['provider'];
  display_name: string;
  model_name: string;
  description: string;
  recommended?: boolean;
};

const emptyDraft: Draft = { display_name: '', provider: 'openrouter', model_type: 'llm', model_name: '', base_url: '', api_key: '', is_enabled: true, rerank_url: '', dimensions: '', temperature: 0.2 };
const typeTabs: TypeFilter[] = ['全部', 'LLM', 'Embedding', 'Rerank', 'OCR'];
const providerLabels = { openrouter: 'OpenRouter', aihubmix: 'AIHubMix', deepseek: 'DeepSeek', tongyi: '通义', mock: '测试替身' };
const providerDefaults: Record<CatalogProvider, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  aihubmix: 'https://aihubmix.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
};
const typeLabels = { llm: 'LLM', embedding: 'Embedding', rerank: 'Rerank', ocr: 'OCR' };
const statusLabels = { connected: '已连接', untested: '待验证', error: '连接异常', mock: '测试替身' };
const catalogIdentity = (model: Pick<ApiOpenRouterCatalogModel, 'model_type' | 'id'>) => `${model.model_type}:${model.id}`;
const rerankPresets: RerankPreset[] = [
  { provider: 'aihubmix', display_name: 'Qwen3 Reranker 4B', model_name: 'qwen3-reranker-4b', description: '兼顾中文检索质量、速度和成本，适合作为企业知识库默认选择。', recommended: true },
  { provider: 'aihubmix', display_name: 'Qwen3 Reranker 8B', model_name: 'qwen3-reranker-8b', description: '更大规模的 Qwen3 重排模型，适合更重视召回精度的场景。' },
  { provider: 'aihubmix', display_name: 'Jina Reranker v3.5', model_name: 'jina-reranker-v3.5', description: '面向多语言与长文本检索的通用重排模型。' },
  { provider: 'aihubmix', display_name: 'Cohere Rerank v4 Fast', model_name: 'cohere-rerank-v4.0-fast', description: '偏低延迟的商业重排模型，适合在线问答。' },
  { provider: 'tongyi', display_name: '通义 GTE Rerank V2', model_name: 'gte-rerank-v2', description: '通过 DashScope 原生 Rerank 接口调用，适合中文企业知识库。' },
];
const ocrPresets: RerankPreset[] = [
  { provider: 'aihubmix', display_name: 'AIHubMix Qwen VL Max OCR', model_name: 'qwen-vl-max', description: '通过视觉语言模型提取图片、扫描件文字与表格。' },
  { provider: 'tongyi', display_name: '通义 Qwen VL Max OCR', model_name: 'qwen-vl-max', description: '使用 DashScope 兼容接口解析中文企业文档。', recommended: true },
];

export function ModelsPage() {
  const [models, setModels] = useState<ApiModelConfig[]>([]);
  const [filter, setFilter] = useState<TypeFilter>('全部');
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ApiModelConfig | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  const [openRouterOpen, setOpenRouterOpen] = useState(false);
  const [catalogProvider, setCatalogProvider] = useState<CatalogProvider>('openrouter');
  const [catalogStep, setCatalogStep] = useState<'connect' | 'select'>('connect');
  const [catalogApiKey, setCatalogApiKey] = useState('');
  const [catalogBaseUrl, setCatalogBaseUrl] = useState('https://openrouter.ai/api/v1');
  const [catalogSourceId, setCatalogSourceId] = useState('');
  const [catalogModels, setCatalogModels] = useState<ApiOpenRouterCatalogModel[]>([]);
  const [catalogFilter, setCatalogFilter] = useState<CatalogType>('llm');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogSelected, setCatalogSelected] = useState<string[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [connectionDetail, setConnectionDetail] = useState('');
  const [rerankPickerOpen, setRerankPickerOpen] = useState(false);
  const [ocrPickerOpen, setOcrPickerOpen] = useState(false);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      setModels(await apiFetch<ApiModelConfig[]>('/models'));
      setError('');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const rows = useMemo(() => models.filter((model) => {
    const matchesType = filter === '全部' || typeLabels[model.model_type] === filter;
    const haystack = `${model.display_name} ${model.model_name} ${providerLabels[model.provider]}`.toLowerCase();
    return matchesType && haystack.includes(search.toLowerCase());
  }), [filter, models, search]);

  const existingCatalogIds = useMemo(() => new Set(
    models.filter((model) => model.provider === catalogProvider).map((model) => `${model.model_type}:${model.model_name}`),
  ), [catalogProvider, models]);

  const filteredCatalog = useMemo(() => catalogModels.filter((model) => {
    const query = catalogSearch.trim().toLowerCase();
    return model.model_type === catalogFilter && (!query || `${model.name} ${model.id} ${model.description}`.toLowerCase().includes(query));
  }), [catalogFilter, catalogModels, catalogSearch]);

  const visibleCatalog = filteredCatalog.slice(0, 100);

  const openNew = () => {
    setSelected(null);
    setDraft(emptyDraft);
    setDrawerOpen(true);
  };

  const openEdit = (model: ApiModelConfig) => {
    setSelected(model);
    setDraft({ display_name: model.display_name, provider: model.provider === 'mock' ? 'openrouter' : model.provider, model_type: model.model_type, model_name: model.model_name, base_url: model.base_url, api_key: '', is_enabled: model.is_enabled, rerank_url: String(model.config.rerank_url ?? ''), dimensions: model.config.dimensions == null ? '' : String(model.config.dimensions), temperature: Number(model.config.temperature ?? 0.2) });
    setDrawerOpen(true);
  };

  const openProvider = (provider: CatalogProvider, initialFilter: CatalogType = 'llm') => {
    const source = models.find((model) => model.provider === provider);
    setCatalogProvider(provider);
    setCatalogStep('connect');
    setCatalogApiKey('');
    setCatalogBaseUrl(source?.base_url ?? providerDefaults[provider]);
    setCatalogSourceId(source?.id ?? '');
    setCatalogModels([]);
    setCatalogSelected([]);
    setCatalogFilter(initialFilter);
    setCatalogSearch('');
    setCatalogError('');
    setConnectionDetail('');
    setOpenRouterOpen(true);
  };

  const chooseRerankPreset = (preset?: RerankPreset) => {
    setSelected(null);
    setDraft({
      ...emptyDraft,
      provider: preset?.provider ?? 'aihubmix',
      model_type: 'rerank',
      display_name: preset?.display_name ?? '',
      model_name: preset?.model_name ?? '',
    });
    setOpenRouterOpen(false);
    setRerankPickerOpen(false);
    setDrawerOpen(true);
  };

  const chooseOcrPreset = (preset?: RerankPreset) => {
    setSelected(null);
    setDraft({
      ...emptyDraft,
      provider: preset?.provider ?? 'aihubmix',
      model_type: 'ocr',
      display_name: preset?.display_name ?? '',
      model_name: preset?.model_name ?? '',
    });
    setOcrPickerOpen(false);
    setDrawerOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const config: Record<string, unknown> = { ...(selected?.config ?? {}), temperature: draft.temperature };
      delete config.rerank_url;
      delete config.dimensions;
      if (draft.rerank_url) config.rerank_url = draft.rerank_url;
      if (draft.dimensions) config.dimensions = Number(draft.dimensions);
      if (selected) {
        await apiFetch(`/models/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ display_name: draft.display_name, model_name: draft.model_name, base_url: draft.base_url || undefined, api_key: draft.api_key || undefined, is_enabled: draft.is_enabled, config }) });
      } else {
        await apiFetch('/models', { method: 'POST', body: JSON.stringify({ display_name: draft.display_name, provider: draft.provider, model_type: draft.model_type, model_name: draft.model_name, base_url: draft.base_url || undefined, api_key: draft.api_key, is_enabled: draft.is_enabled, config }) });
      }
      showToast('模型配置已加密保存');
      setDrawerOpen(false);
      await load();
    } catch (caught) {
      showToast(errorMessage(caught), 'error');
    } finally {
      setSaving(false);
    }
  };

  const credentialPayload = () => catalogApiKey.trim()
    ? { api_key: catalogApiKey.trim(), base_url: catalogBaseUrl }
    : { source_model_id: catalogSourceId, base_url: catalogBaseUrl };

  const connectProvider = async () => {
    if (!catalogApiKey.trim() && !catalogSourceId) {
      setCatalogError(`请输入 ${providerLabels[catalogProvider]} API Key。`);
      return;
    }
    setConnecting(true);
    setCatalogError('');
    try {
      const result = await apiFetch<ApiOpenRouterCatalog>(`/models/providers/${catalogProvider}/catalog`, {
        method: 'POST',
        body: JSON.stringify(credentialPayload()),
      });
      setCatalogModels(result.models);
      setConnectionDetail(`${result.detail} · ${result.latency_ms}ms`);
      setCatalogStep('select');
      showToast(`${providerLabels[catalogProvider]} 认证成功，模型目录已加载`);
    } catch (caught) {
      const message = errorMessage(caught);
      setCatalogError(message);
      showToast(message, 'error');
    } finally {
      setConnecting(false);
    }
  };

  const toggleCatalogModel = (identity: string) => {
    setCatalogSelected((current) => current.includes(identity)
      ? current.filter((item) => item !== identity)
      : [...current, identity]);
  };

  const selectVisible = () => {
    const visible = visibleCatalog.map(catalogIdentity);
    setCatalogSelected((current) => Array.from(new Set([...current, ...visible])));
  };

  const importProviderModels = async () => {
    const selectedModels = catalogModels.filter((model) => catalogSelected.includes(catalogIdentity(model)));
    if (!selectedModels.length) return;
    setImporting(true);
    setCatalogError('');
    try {
      const saved = await apiFetch<ApiModelConfig[]>(`/models/providers/${catalogProvider}/import`, {
        method: 'POST',
        body: JSON.stringify({
          ...credentialPayload(),
          models: selectedModels.map((model) => ({
            model_name: model.id,
            display_name: model.name,
            model_type: model.model_type,
          })),
        }),
      });
      showToast(`已接入 ${saved.length} 个 ${providerLabels[catalogProvider]} 模型`);
      setOpenRouterOpen(false);
      await load();
    } catch (caught) {
      const message = errorMessage(caught);
      setCatalogError(message);
      showToast(message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const testConnection = async () => {
    if (!selected) return;
    setTesting(true);
    try {
      const result = await apiFetch<{ ok: boolean; detail: string }>(`/models/${selected.id}/test`, { method: 'POST' });
      showToast(`${result.ok ? '连接成功' : '连接失败'}：${result.detail}`, result.ok ? 'success' : 'error');
      await load();
    } catch (caught) {
      showToast(errorMessage(caught), 'error');
    } finally {
      setTesting(false);
    }
  };

  const canSave = Boolean(
    draft.display_name.trim()
    && draft.model_name.trim()
    && (selected || draft.api_key.trim()),
  );

  return (
    <main className="page page-enter">
      <PageHeader
        eyebrow="系统配置"
        title="模型服务"
        description="统一管理对话、向量化、重排与 OCR 模型；API Key 加密存储并只返回掩码。"
        actions={<><Button icon={<Plus size={17} />} onClick={openNew}>手动添加</Button><Button icon={<ListFilter size={17} />} onClick={() => setRerankPickerOpen(true)}>接入 Rerank</Button><Button icon={<ListFilter size={17} />} onClick={() => setOcrPickerOpen(true)}>接入 OCR</Button><Button icon={<Link2 size={17} />} onClick={() => openProvider('aihubmix')}>接入 AIHubMix</Button><Button icon={<Link2 size={17} />} onClick={() => openProvider('deepseek')}>接入 DeepSeek</Button><Button variant="primary" icon={<Link2 size={17} />} onClick={() => openProvider('openrouter')}>接入 OpenRouter</Button></>}
      />
      <Notice tone="info" title="按厂商加载模型目录">OpenRouter 与 AIHubMix 可批量选择目录中的多种能力；DeepSeek 当前提供对话模型。每次接入都会先验证服务可达性与 API Key。</Notice>
      {error ? <Notice tone="error" title="无法连接后端">{error}</Notice> : null}
      <div className="toolbar">
        <div className="tabs" role="tablist" aria-label="模型类型筛选">{typeTabs.map((tab) => <button className="tab" role="tab" aria-selected={filter === tab} key={tab} onClick={() => setFilter(tab)}>{tab}</button>)}</div>
        <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="搜索模型" placeholder="搜索模型或服务商" /></label>
      </div>
      <section className="card table-card">
        <table className="data-table"><thead><tr><th>模型</th><th>类型</th><th>服务商</th><th>状态</th><th>最近测试</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>
          {rows.map((model) => <tr key={model.id}><td><button className="table-primary" onClick={() => openEdit(model)}><span className="row-icon"><ServerCog size={17} /></span><span><strong>{model.display_name}</strong><small>{model.model_name} · {model.base_url}</small></span></button></td><td><Badge>{typeLabels[model.model_type]}</Badge></td><td>{providerLabels[model.provider]}</td><td><Badge tone={model.connection_status === 'connected' ? 'success' : model.connection_status === 'error' ? 'error' : 'warning'}>{statusLabels[model.connection_status]}</Badge></td><td>{formatDateTime(model.last_tested_at)}</td><td><Button variant="ghost" onClick={() => openEdit(model)}>编辑</Button></td></tr>)}
        </tbody></table>
        <div className="mobile-card-list">{rows.map((model) => <button className="mobile-data-card" key={model.id} onClick={() => openEdit(model)}><span><strong>{model.display_name}</strong><small>{providerLabels[model.provider]} · {typeLabels[model.model_type]}</small></span><Badge tone={model.connection_status === 'connected' ? 'success' : model.connection_status === 'error' ? 'error' : 'warning'}>{statusLabels[model.connection_status]}</Badge></button>)}</div>
        {!loading && rows.length === 0 ? <div className="empty-state"><ServerCog size={28} /><h2>尚未配置模型</h2><p>先连接模型厂商加载目录，或手动添加兼容服务。</p></div> : null}
      </section>

      <Drawer
        open={openRouterOpen}
        title={catalogStep === 'connect' ? `接入 ${providerLabels[catalogProvider]}` : `选择 ${providerLabels[catalogProvider]} 模型`}
        description={catalogStep === 'connect' ? '先验证连接，再选择需要接入的模型能力。' : `所选模型将复用当前 ${providerLabels[catalogProvider]} Endpoint 与 API Key。`}
        onClose={() => setOpenRouterOpen(false)}
        footer={catalogStep === 'connect'
          ? <><Button onClick={() => setOpenRouterOpen(false)}>取消</Button><Button variant="primary" icon={<RefreshCw size={16} className={connecting ? 'spin' : ''} />} disabled={connecting || (!catalogApiKey.trim() && !catalogSourceId)} onClick={() => void connectProvider()}>{connecting ? '验证中…' : '验证并加载模型'}</Button></>
          : <><Button onClick={() => { setCatalogStep('connect'); setCatalogError(''); }}>返回连接</Button><span className="drawer-selection-count">已选 {catalogSelected.length} 个</span><Button variant="primary" disabled={!catalogSelected.length || importing} onClick={() => void importProviderModels()}>{importing ? '接入中…' : '接入所选模型'}</Button></>}
      >
        {catalogStep === 'connect' ? (
          <div className="form-stack">
            {catalogSourceId ? <Notice tone="info" title={`已找到保存的 ${providerLabels[catalogProvider]} 连接`}>API Key 留空时使用已保存的加密密钥；如果认证失败，请在下方输入新密钥覆盖所选模型。</Notice> : null}
            {catalogError ? <Notice tone="error" title="连接验证失败">{catalogError}</Notice> : null}
            <label className="form-label">API Endpoint<input className="field" value={catalogBaseUrl} onChange={(event) => setCatalogBaseUrl(event.target.value)} /></label>
            <label className="form-label">{providerLabels[catalogProvider]} API Key<span className="field-with-icon"><KeyRound size={16} /><input className="field" type="password" value={catalogApiKey} onChange={(event) => setCatalogApiKey(event.target.value)} placeholder={catalogSourceId ? '留空使用已保存密钥；输入新值可替换' : '粘贴厂商 API Key'} autoComplete="new-password" /></span><small>只填写密钥本身，不要添加 Bearer、引号或空格。</small></label>
            <div className="provider-connect-summary"><span className="provider-connect-mark">{catalogProvider === 'openrouter' ? 'OR' : catalogProvider === 'aihubmix' ? 'AI' : 'DS'}</span><div><strong>验证内容</strong><small>API Key 认证、服务可达性，以及该厂商当前开放的模型目录。</small></div></div>
          </div>
        ) : (
          <div className="catalog-picker">
            <Notice tone="success" title={`${providerLabels[catalogProvider]} 已连接`}>{connectionDetail}</Notice>
            {catalogError ? <Notice tone="error" title="模型接入失败">{catalogError}</Notice> : null}
            <div className="catalog-toolbar">
              <div className="tabs" role="tablist" aria-label={`${providerLabels[catalogProvider]} 模型类型`}>
                <button className="tab" role="tab" aria-selected={catalogFilter === 'llm'} onClick={() => setCatalogFilter('llm')}>LLM</button>
                <button className="tab" role="tab" aria-selected={catalogFilter === 'embedding'} onClick={() => setCatalogFilter('embedding')}>Embedding</button>
                <button className="tab" role="tab" aria-selected={catalogFilter === 'rerank'} onClick={() => setCatalogFilter('rerank')}>Rerank</button>
                <button className="tab" role="tab" aria-selected={catalogFilter === 'ocr'} onClick={() => setCatalogFilter('ocr')}>OCR</button>
              </div>
              <label className="search-field"><Search size={16} /><input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} aria-label={`搜索 ${providerLabels[catalogProvider]} 模型`} placeholder="搜索模型名称或 ID" /></label><div className="catalog-toolbar-meta"><span>共 {filteredCatalog.length} 个</span><Button variant="ghost" onClick={selectVisible}>选择当前结果</Button></div>
            </div>
            <div className="catalog-list">
              {visibleCatalog.map((model) => {
                const identity = catalogIdentity(model);
                const alreadyAdded = existingCatalogIds.has(identity);
                return (
                  <label className={`catalog-item ${catalogSelected.includes(identity) ? 'catalog-item--selected' : ''}`} key={identity}>
                    <input type="checkbox" checked={catalogSelected.includes(identity)} onChange={() => toggleCatalogModel(identity)} />
                    <span className="catalog-item-main"><strong>{model.name}</strong><code>{model.id}</code><small>{model.description || model.modality}</small></span>
                    <span className="catalog-item-meta">{alreadyAdded ? <Badge tone="info">已添加</Badge> : null}{model.is_free ? <Badge tone="success">免费</Badge> : null}<small>{model.context_length ? `${model.context_length.toLocaleString()} tokens` : '上下文未知'}</small></span>
                  </label>
                );
              })}
              {filteredCatalog.length > 100 ? <p className="catalog-limit">当前显示前 100 个结果，请使用搜索定位其他模型。</p> : null}
              {!filteredCatalog.length ? <div className="catalog-empty">没有匹配的模型。</div> : null}
            </div>
          </div>
        )}
      </Drawer>

      <Drawer
        open={rerankPickerOpen}
        title="选择 Rerank 模型"
        description="选择预设后补充对应服务商 API Key，即可保存并测试连接。"
        onClose={() => setRerankPickerOpen(false)}
        footer={<><Button onClick={() => setRerankPickerOpen(false)}>取消</Button><Button onClick={() => chooseRerankPreset()}>自定义兼容接口</Button></>}
      >
        <div className="rerank-picker">
          <Notice tone="info" title="OpenRouter 可直接接入 Rerank">复用 OpenRouter Endpoint 与 API Key，从实时目录选择并批量接入 Rerank 模型。</Notice>
          <section className="rerank-provider-section">
            <header><div><strong>OpenRouter</strong><small>调用官方 /api/v1/rerank 接口</small></div><Button variant="ghost" onClick={() => { setRerankPickerOpen(false); openProvider('openrouter', 'rerank'); }}>选择模型</Button></header>
          </section>
          <section className="rerank-provider-section">
            <header><div><strong>AIHubMix</strong><small>统一使用 /v1/rerank 接口</small></div><Badge tone="info">4 个预设</Badge></header>
            <div className="rerank-preset-list">
              {rerankPresets.filter((preset) => preset.provider === 'aihubmix').map((preset) => (
                <button className="rerank-preset" key={preset.model_name} onClick={() => chooseRerankPreset(preset)}>
                  <span><strong>{preset.display_name}</strong><code>{preset.model_name}</code><small>{preset.description}</small></span>
                  {preset.recommended ? <Badge tone="success">推荐</Badge> : <span className="rerank-preset-arrow">选择</span>}
                </button>
              ))}
            </div>
          </section>
          <section className="rerank-provider-section">
            <header><div><strong>通义 DashScope</strong><small>使用阿里云原生文本重排接口</small></div><Badge tone="info">1 个预设</Badge></header>
            <div className="rerank-preset-list">
              {rerankPresets.filter((preset) => preset.provider === 'tongyi').map((preset) => (
                <button className="rerank-preset" key={preset.model_name} onClick={() => chooseRerankPreset(preset)}>
                  <span><strong>{preset.display_name}</strong><code>{preset.model_name}</code><small>{preset.description}</small></span>
                  <span className="rerank-preset-arrow">选择</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </Drawer>

      <Drawer
        open={ocrPickerOpen}
        title="接入 OCR 模型"
        description="OCR 使用云端视觉模型解析图片、扫描 PDF 和文档内图片，不下载本地模型。"
        onClose={() => setOcrPickerOpen(false)}
        footer={<><Button onClick={() => setOcrPickerOpen(false)}>取消</Button><Button onClick={() => chooseOcrPreset()}>自定义视觉模型</Button></>}
      >
        <div className="rerank-picker">
          <Notice tone="info" title="OpenRouter 视觉模型">连接 OpenRouter 后，可从官方目录中筛选支持图片输入的模型作为 OCR。</Notice>
          <section className="rerank-provider-section">
            <header><div><strong>OpenRouter</strong><small>从实时模型目录选择视觉模型</small></div><Button variant="ghost" onClick={() => { setOcrPickerOpen(false); openProvider('openrouter', 'ocr'); }}>选择模型</Button></header>
          </section>
          {(['aihubmix', 'tongyi'] as const).map((provider) => <section className="rerank-provider-section" key={provider}><header><div><strong>{providerLabels[provider]}</strong><small>OpenAI 兼容视觉接口</small></div><Badge tone="info">预设</Badge></header><div className="rerank-preset-list">{ocrPresets.filter((preset) => preset.provider === provider).map((preset) => <button className="rerank-preset" key={`${preset.provider}-${preset.model_name}`} onClick={() => chooseOcrPreset(preset)}><span><strong>{preset.display_name}</strong><code>{preset.model_name}</code><small>{preset.description}</small></span>{preset.recommended ? <Badge tone="success">推荐</Badge> : <span className="rerank-preset-arrow">选择</span>}</button>)}</div></section>)}
        </div>
      </Drawer>

      <Drawer open={drawerOpen} title={selected ? `配置 ${selected.display_name}` : draft.model_type === 'rerank' ? '接入 Rerank 模型' : draft.model_type === 'ocr' ? '接入 OCR 模型' : '手动添加模型'} description={selected ? '留空 API Key 将保留已有密钥。' : draft.model_type === 'rerank' || draft.model_type === 'ocr' ? '模型信息已预填，请补充对应服务商的 API Key。' : '适用于 AIHubMix、通义和自定义模型配置。'} onClose={() => setDrawerOpen(false)} footer={<><Button onClick={() => setDrawerOpen(false)}>取消</Button><Button variant="primary" icon={<Check size={17} />} disabled={!canSave || saving} onClick={save}>{saving ? '保存中…' : '保存配置'}</Button></>}>
        <form className="form-stack" onSubmit={(event) => event.preventDefault()}>
          <label className="form-label">服务商<select className="field" value={draft.provider} disabled={Boolean(selected)} onChange={(event) => setDraft({ ...draft, provider: event.target.value as Draft['provider'] })}><option value="openrouter">OpenRouter</option><option value="aihubmix">AIHubMix</option><option value="deepseek">DeepSeek</option><option value="tongyi">通义</option></select></label>
          <label className="form-label">模型类型<select className="field" value={draft.model_type} disabled={Boolean(selected)} onChange={(event) => setDraft({ ...draft, model_type: event.target.value as Draft['model_type'] })}><option value="llm">LLM</option><option value="embedding">Embedding</option><option value="rerank">Rerank</option><option value="ocr">OCR</option></select></label>
          <label className="form-label">显示名称<input className="field" value={draft.display_name} onChange={(event) => setDraft({ ...draft, display_name: event.target.value })} placeholder="例如：Qwen Plus" /></label>
          <label className="form-label">模型标识<input className="field" value={draft.model_name} onChange={(event) => setDraft({ ...draft, model_name: event.target.value })} placeholder={draft.model_type === 'rerank' ? '服务商提供的 Rerank model ID' : draft.model_type === 'ocr' ? '支持图片输入的视觉模型 ID' : '服务商要求的 model name'} /></label>
          <label className="form-label">API Endpoint<input className="field" value={draft.base_url} onChange={(event) => setDraft({ ...draft, base_url: event.target.value })} placeholder="留空使用服务商默认地址" /></label>
          <label className="form-label">API Key<span className="field-with-icon"><KeyRound size={16} /><input className="field" type="password" value={draft.api_key} onChange={(event) => setDraft({ ...draft, api_key: event.target.value })} placeholder={selected?.api_key_masked ?? '输入真实 API Key'} /></span></label>
          {draft.model_type === 'llm' ? <label className="form-label">温度<input className="field" type="number" min="0" max="2" step="0.1" value={draft.temperature} onChange={(event) => setDraft({ ...draft, temperature: Number(event.target.value) })} /></label> : null}
          {draft.model_type === 'embedding' ? <label className="form-label">向量维度（可选）<input className="field" inputMode="numeric" value={draft.dimensions} onChange={(event) => setDraft({ ...draft, dimensions: event.target.value })} placeholder="留空使用模型默认维度" /></label> : null}
          {draft.model_type === 'rerank' ? <label className="form-label">Rerank API 地址（可选）<input className="field" value={draft.rerank_url} onChange={(event) => setDraft({ ...draft, rerank_url: event.target.value })} placeholder="留空使用服务商默认 /rerank 地址" /></label> : null}
          <label className="check-card"><input type="checkbox" checked={draft.is_enabled} onChange={(event) => setDraft({ ...draft, is_enabled: event.target.checked })} /><span><strong>启用模型</strong><small>禁用后不会参与导入、检索或问答。</small></span></label>
          <Button type="button" onClick={testConnection} disabled={!selected || testing} icon={<RefreshCw size={16} className={testing ? 'spin' : ''} />}>{selected ? (testing ? '测试中…' : '测试连接') : '请先保存后测试'}</Button>
        </form>
      </Drawer>
    </main>
  );
}
