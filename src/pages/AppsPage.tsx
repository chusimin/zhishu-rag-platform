import {
  AppWindow,
  Archive,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDashed,
  FileText,
  FlaskConical,
  LayoutTemplate,
  LoaderCircle,
  MessageSquare,
  Plus,
  Copy,
  RotateCcw,
  Rocket,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, errorMessage, formatDateTime, type ApiKnowledgeBase, type ApiModelOption } from '../api/client';
import { fdeApi, type AppManifest, type AppTemplate, type FDEApp } from '../api/fde';
import { Badge, Button, Modal, Notice, PageHeader } from '../components/ui';
import { useToast } from '../components/Toast';

type StatusFilter = 'all' | 'published' | 'draft' | 'offline' | 'archived';
type CreateMode = 'template' | 'blank' | 'ai';

const scenarioLabels: Record<string, string> = {
  qa: '知识问答',
  report: '报告生成',
  content: '内容创作',
  review: '知识审校',
  customer_service: '智能客服',
};

const scenarioIcons: Record<string, typeof Bot> = {
  qa: MessageSquare,
  report: FileText,
  content: WandSparkles,
  review: FlaskConical,
  customer_service: Bot,
};

const statusMeta: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' | 'info' }> = {
  published: { label: '已发布', tone: 'success' },
  ready: { label: '待发布', tone: 'info' },
  draft: { label: '草稿', tone: 'warning' },
  offline: { label: '已下线', tone: 'neutral' },
  archived: { label: '已归档', tone: 'neutral' },
};

function manifestFromTemplate(template: AppTemplate, modelId: string, knowledge: ApiKnowledgeBase[]): AppManifest {
  return {
    schema_version: 'fde.app/v2',
    type: 'simple',
    name: template.name,
    description: template.description,
    template_key: template.key,
    system_prompt: template.system_prompt,
    llm_model_id: modelId || null,
    model: { temperature: 0.2, max_tokens: 4096, thinking_mode: 'auto' },
    knowledge_base_ids: template.knowledge_bases.required ? knowledge.slice(0, 1).map((item) => item.id) : [],
    input_fields: template.input_fields,
    output: template.output,
    tools: template.tools,
    guardrails: template.guardrails,
    memory: template.memory,
    delivery: template.delivery,
    agent: { max_steps: 8, require_confirmation_for_side_effects: true, show_tool_steps: true, long_term_memory: false },
  };
}

function blankManifest(template: AppTemplate, modelId: string): AppManifest {
  return {
    ...manifestFromTemplate(template, modelId, []),
    name: '未命名应用',
    description: '从一个最小可运行应用开始配置。',
    template_key: 'content',
    system_prompt: '根据用户提供的信息完成任务；信息不足时明确说明，不编造事实。',
    input_fields: [{
      key: 'request',
      label: '任务要求',
      type: 'textarea',
      description: '说明希望应用完成的具体任务。',
      required: true,
      placeholder: '请输入任务要求',
      options: [],
    }],
    knowledge_base_ids: [],
  };
}

function CreateAppModal({
  open,
  templates,
  models,
  knowledge,
  onClose,
}: {
  open: boolean;
  templates: AppTemplate[];
  models: ApiModelOption[];
  knowledge: ApiKnowledgeBase[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const llms = useMemo(() => models.filter((item) => item.model_type === 'llm' && item.is_enabled && item.connection_status !== 'error'), [models]);
  const [mode, setMode] = useState<CreateMode>('template');
  const [templateKey, setTemplateKey] = useState('content');
  const [modelId, setModelId] = useState('');
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setModelId((current) => current || llms[0]?.id || '');
    setError('');
  }, [open, llms]);

  const selectedTemplate = templates.find((item) => item.key === templateKey) ?? templates[0];
  const create = async () => {
    if (!modelId) {
      setError('请先在“模型与工具”中配置一个可用的对话模型。');
      return;
    }
    if (!selectedTemplate) {
      setError('没有可用的应用模板。');
      return;
    }
    if (mode === 'template' && selectedTemplate.knowledge_bases.required && !knowledge.length) {
      setError(`「${selectedTemplate.name}」需要知识库，请先创建知识库或选择不强制知识库的模板。`);
      return;
    }
    if (mode === 'ai' && brief.trim().length < 4) {
      setError('请用一句完整的话说明应用要解决的业务任务。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let manifest: AppManifest;
      let simulated = false;
      if (mode === 'ai') {
        const designed = await fdeApi.design({ brief: brief.trim(), template_key: templateKey, llm_model_id: modelId });
        manifest = designed.manifest;
        simulated = designed.simulated;
      } else if (mode === 'blank') {
        const contentTemplate = templates.find((item) => item.key === 'content') ?? selectedTemplate;
        manifest = blankManifest(contentTemplate, modelId);
      } else {
        manifest = manifestFromTemplate(selectedTemplate, modelId, knowledge);
      }
      const created = await fdeApi.create(manifest);
      showToast(simulated ? '应用草稿已创建；设计内容来自测试替身，请继续验证' : '应用草稿已创建');
      navigate(`/studio?app=${created.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="新建应用"
      description="选择可追溯的起点，创建后进入应用工作区继续配置、预览和发布。"
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" icon={busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />} disabled={busy} onClick={() => void create()}>{busy ? '正在创建…' : '创建并继续配置'}</Button></>}
    >
      <div className="create-app-modes" role="tablist" aria-label="新建方式">
        {([
          ['template', '业务模板', LayoutTemplate],
          ['blank', '空白应用', Plus],
          ['ai', 'AI 帮我搭建', Sparkles],
        ] as const).map(([value, label, Icon]) => (
          <button key={value} type="button" role="tab" aria-selected={mode === value} className={mode === value ? 'active' : ''} onClick={() => setMode(value)}>
            <Icon size={17} /><span>{label}</span>
          </button>
        ))}
      </div>

      {error ? <Notice tone="error" title="无法创建应用">{error}</Notice> : null}
      {mode !== 'blank' ? (
        <div className="create-template-grid">
          {templates.map((template) => (
            <button type="button" key={template.key} className={template.key === templateKey ? 'active' : ''} onClick={() => setTemplateKey(template.key)}>
              <span className="create-template-icon"><AppWindow size={18} /></span>
              <span><strong>{template.name}</strong><small>{template.description}</small></span>
              {template.key === templateKey ? <CheckCircle2 size={17} /> : null}
            </button>
          ))}
        </div>
      ) : (
        <Notice title="最小可运行应用">创建一个含“任务要求”输入框的简易应用，再在工作区补充提示词、知识和输出格式。</Notice>
      )}

      {mode === 'ai' ? <label className="form-label">业务需求<textarea className="field create-brief" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="例如：为售后团队搭建一个回答保修政策、查询订单并在高风险投诉时转人工的助手。" /></label> : null}
      <label className="form-label">设计与运行模型<select className="field" value={modelId} onChange={(event) => setModelId(event.target.value)}><option value="">请选择可用模型</option>{llms.map((model) => <option key={model.id} value={model.id}>{model.display_name} · {model.provider}</option>)}</select></label>
      <p className="create-app-boundary"><CircleDashed size={14} />当前后端运行时支持简易应用与 Agent（授权 HTTP 工具、确认副作用、步骤追踪）。Chat Flow 按本次范围不开发。</p>
    </Modal>
  );
}

export function AppsPage() {
  const [apps, setApps] = useState<FDEApp[]>([]);
  const [templates, setTemplates] = useState<AppTemplate[]>([]);
  const [knowledge, setKnowledge] = useState<ApiKnowledgeBase[]>([]);
  const [models, setModels] = useState<ApiModelOption[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    Promise.all([
      fdeApi.list(),
      fdeApi.templates(),
      apiFetch<ApiKnowledgeBase[]>('/knowledge-bases'),
      apiFetch<ApiModelOption[]>('/model-options'),
    ])
      .then(([loadedApps, loadedTemplates, loadedKnowledge, loadedModels]) => {
        setApps(loadedApps);
        setTemplates(loadedTemplates);
        setKnowledge(loadedKnowledge);
        setModels(loadedModels);
      })
      .catch((caught) => setError(errorMessage(caught)))
      .finally(() => setLoading(false));
  }, []);

  const modelById = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);
  const knowledgeById = useMemo(() => new Map(knowledge.map((item) => [item.id, item])), [knowledge]);
  const counts = useMemo(() => ({
    all: apps.length,
    published: apps.filter((app) => app.status === 'published').length,
    draft: apps.filter((app) => app.status === 'draft' || app.status === 'ready').length,
    offline: apps.filter((app) => app.status === 'offline').length,
    archived: apps.filter((app) => app.status === 'archived').length,
  }), [apps]);
  const visible = apps.filter((app) => {
    const matchesSearch = `${app.name} ${app.description} ${scenarioLabels[app.scenario_type] ?? app.scenario_type}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = filter === 'all'
      || (filter === 'draft' ? app.status === 'draft' || app.status === 'ready' : app.status === filter);
    return matchesSearch && matchesStatus;
  });

  const mutateApp = async (action: 'duplicate' | 'archive' | 'restore' | 'delete', app: FDEApp) => {
    try {
      if (action === 'delete') {
        if (!window.confirm(`永久删除“${app.name}”？应用版本、评测和会话将一并删除，此操作不可撤销。`)) return;
        await fdeApi.delete(app.id);
        setApps((current) => current.filter((item) => item.id !== app.id));
        showToast('应用已永久删除');
        return;
      }
      const updated = action === 'duplicate' ? await fdeApi.duplicate(app.id) : action === 'archive' ? await fdeApi.archive(app.id) : await fdeApi.restore(app.id);
      if (action === 'duplicate') setApps((current) => [updated, ...current]);
      else setApps((current) => current.map((item) => item.id === updated.id ? updated : item));
      showToast(action === 'duplicate' ? '应用副本已创建' : action === 'archive' ? '应用已归档' : '应用已恢复为草稿');
    } catch (caught) {
      showToast(errorMessage(caught), 'error');
    }
  };

  return (
    <main className="page page-enter applications-page">
      <PageHeader
        eyebrow="APPLICATION DELIVERY"
        title="应用"
        description="搭建、调试和发布 AI 应用；业务端只运行已经固化并发布的版本。"
        actions={<Button variant="primary" icon={<Plus size={17} />} onClick={() => setCreateOpen(true)}>新建应用</Button>}
      />
      {error ? <Notice tone="error" title="无法读取应用">{error}</Notice> : null}
      <Notice title="能力边界">当前正式后端已经跑通简易应用与 Agent 的设计、真实预览、工具调用、评测、版本、发布和回滚。Chat Flow 按本次范围不开发。</Notice>

      <div className="applications-toolbar">
        <div className="tabs" role="tablist" aria-label="按发布状态筛选">
          {([
            ['all', '全部'],
            ['published', '已发布'],
            ['draft', '草稿'],
            ['offline', '已下线'],
            ['archived', '已归档'],
          ] as const).map(([value, label]) => <button type="button" role="tab" aria-selected={filter === value} className={`tab ${filter === value ? 'active' : ''}`} key={value} onClick={() => setFilter(value)}>{label}<span>{counts[value]}</span></button>)}
        </div>
        <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="搜索应用" placeholder="搜索名称、说明或场景" /></label>
      </div>

      {loading ? <section className="card applications-loading"><LoaderCircle className="spin" size={22} /><span>正在读取应用与交付状态…</span></section> : null}
      {!loading && visible.length ? <div className="app-card-grid application-grid">{visible.map((app) => {
        const Icon = scenarioIcons[app.scenario_type] ?? Bot;
        const status = statusMeta[app.status] ?? statusMeta.draft;
        const model = modelById.get(app.manifest.llm_model_id ?? '');
        const knowledgeNames = app.manifest.knowledge_base_ids.map((id) => knowledgeById.get(id)?.name).filter(Boolean);
        return (
          <article className="card app-card application-card" key={app.id}>
            <header>
              <span className="app-icon"><Icon size={22} /></span>
              <div><Badge tone="info">{scenarioLabels[app.scenario_type] ?? app.scenario_type}</Badge><Badge tone={status.tone}>{status.label}</Badge></div>
            </header>
            <div className="application-card-title"><div><h2>{app.name}</h2><p>{app.description || '尚未填写应用说明。'}</p></div>{app.published_version ? <span>v{app.published_version.version}</span> : null}</div>
            <div className="app-config-summary">
              <div><Settings2 size={15} /><span><strong>{model?.display_name ?? '未配置模型'}</strong><small>对话模型</small></span></div>
              <div><AppWindow size={15} /><span><strong>{knowledgeNames.join('、') || '无需知识库'}</strong><small>知识范围</small></span></div>
            </div>
            <footer>
              <span>{app.conversation_count ?? 0} 次运行 · 更新于 {formatDateTime(app.updated_at)}</span>
              <div className="application-card-actions">
                {app.status === 'published' && app.published_version ? <Button variant="ghost" icon={<Rocket size={14} />} onClick={() => navigate(app.portal_path)}>业务运行</Button> : null}
                {app.status !== 'archived' ? <Button variant="ghost" icon={<Copy size={14} />} onClick={() => void mutateApp('duplicate', app)}>复制</Button> : null}
                {app.status !== 'archived' ? <Button variant="ghost" icon={<Archive size={14} />} onClick={() => void mutateApp('archive', app)}>归档</Button> : <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={() => void mutateApp('restore', app)}>恢复</Button>}
                {app.status === 'archived' || app.status === 'offline' ? <Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => void mutateApp('delete', app)}>删除</Button> : null}
                {app.status !== 'archived' ? <Button icon={<ArrowRight size={14} />} onClick={() => navigate(`/studio?app=${app.id}`)}>设计与交付</Button> : null}
              </div>
            </footer>
          </article>
        );
      })}</div> : null}

      {!loading && !visible.length ? <section className="card empty-state applications-empty"><Bot size={28} /><h2>{apps.length ? '没有符合条件的应用' : '还没有应用'}</h2><p>{apps.length ? '调整搜索词或发布状态筛选。' : '从业务模板、空白配置或自然语言需求开始创建第一款应用。'}</p>{!apps.length ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>新建应用</Button> : null}</section> : null}

      <CreateAppModal open={createOpen} templates={templates} models={models} knowledge={knowledge} onClose={() => setCreateOpen(false)} />
    </main>
  );
}
