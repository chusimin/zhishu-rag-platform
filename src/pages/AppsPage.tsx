import { AppWindow, ArrowRight, Bot, MessagesSquare, Plus, Search, Settings2, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, errorMessage, formatDateTime, type ApiKnowledgeBase, type ApiModelOption, type ApiQAApp } from '../api/client';
import { Badge, Button, Notice, PageHeader } from '../components/ui';

const scenarioLabels: Record<string, string> = { qa: '知识问答', report: '报告生成', content: '内容生成', review: '内容审校', customer_service: '智能客服' };

export function AppsPage() {
  const [apps, setApps] = useState<ApiQAApp[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<ApiKnowledgeBase[]>([]);
  const [models, setModels] = useState<ApiModelOption[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([apiFetch<ApiQAApp[]>('/apps'), apiFetch<ApiKnowledgeBase[]>('/knowledge-bases'), apiFetch<ApiModelOption[]>('/model-options')])
      .then(([loadedApps, loadedKnowledge, loadedModels]) => {
        setApps(loadedApps);
        setKnowledgeBases(loadedKnowledge);
        setModels(loadedModels);
      })
      .catch((caught) => setError(errorMessage(caught)));
  }, []);
  const modelById = useMemo(() => new Map(models.map((model) => [model.id, model])), [models]);
  const kbById = useMemo(() => new Map(knowledgeBases.map((kb) => [kb.id, kb])), [knowledgeBases]);
  const visible = apps.filter((app) => `${app.name} ${app.description}`.toLowerCase().includes(search.toLowerCase()));

  return <main className="page page-enter"><PageHeader eyebrow="APPLICATIONS" title="应用中心" description="统一管理问答、内容、报告、审校与客服应用；从 AI 设计到版本发布都使用标准 FDE 协议。" actions={<Link className="button button--primary" to="/studio"><Sparkles size={17} />AI 设计新应用</Link>} />{error ? <Notice tone="error" title="无法读取应用">{error}</Notice> : null}<div className="toolbar"><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="搜索应用" placeholder="搜索名称或业务说明" /></label><div className="toolbar-spacer" /><Badge tone="info">{apps.filter((app) => app.is_enabled).length} 个已发布</Badge></div><div className="app-card-grid">{visible.map((app) => <article className="card app-card" key={app.id}><header><span className="app-icon"><Bot size={22} /></span><div><Badge tone="info">{scenarioLabels[app.scenario_type] ?? app.scenario_type}</Badge><Badge tone={app.is_enabled ? 'success' : 'warning'}>{app.is_enabled ? '已发布' : '草稿'}</Badge></div></header><h2>{app.name}</h2><p>{app.description || '尚未填写应用说明。'}</p><div className="app-config-summary"><div><Settings2 size={15} /><span><strong>{modelById.get(app.llm_model_id ?? '')?.display_name ?? '未配置'}</strong><small>对话模型</small></span></div><div><AppWindow size={15} /><span><strong>{app.knowledge_base_ids.map((item) => kbById.get(item)?.name).filter(Boolean).join('、') || '无需知识库'}</strong><small>知识范围</small></span></div></div><footer><span><MessagesSquare size={14} />{app.conversation_count} 个对话 · {formatDateTime(app.updated_at)}</span><Button variant="ghost" icon={<ArrowRight size={16} />} onClick={() => navigate(`/studio?app=${app.id}`)}>设计与交付</Button></footer></article>)}</div>{!visible.length ? <section className="card empty-state"><Bot size={28} /><h2>还没有应用</h2><p>从自然语言需求或标准模板开始，完成第一個可交付的 AI 应用。</p><Link className="button button--primary" to="/studio"><Plus size={16} />创建应用</Link></section> : null}</main>;
}
