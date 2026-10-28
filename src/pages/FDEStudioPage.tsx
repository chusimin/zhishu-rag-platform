import { ArrowDown, ArrowRight, ArrowUp, Bot, Check, ChevronRight, ClipboardCheck, Code2, Copy, ExternalLink, FileJson, FlaskConical, Globe, Layers3, Link2, LoaderCircle, Play, Plus, Rocket, Save, Send, Sparkles, Trash2, WandSparkles, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch, errorMessage, type ApiKnowledgeBase, type ApiModelOption, type ApiToolConfig } from '../api/client';
import { fdeApi, type AppManifest, type AppShare, type AppTemplate, type FDEApp, type InputField, type RunResult, type ValidationIssue } from '../api/fde';
import { Badge, Button, Notice, PageHeader } from '../components/ui';
import { useToast } from '../components/Toast';

type StudioTab = 'design' | 'preview' | 'channels' | 'release';

const defaultModel = { temperature: 0.2, max_tokens: 4096, thinking_mode: 'auto' as const };
const defaultAgent = { max_steps: 8, require_confirmation_for_side_effects: true, show_tool_steps: true, long_term_memory: false };

function normalizeManifest(source: AppManifest): AppManifest {
  return { ...source, schema_version: 'fde.app/v2', type: source.type ?? 'simple', model: source.model ?? defaultModel, agent: source.agent ?? defaultAgent };
}

function fromTemplate(template: AppTemplate, modelId: string, knowledgeIds: string[]): AppManifest {
  return {
    schema_version: 'fde.app/v2',
    type: 'simple',
    name: template.name,
    description: template.description,
    template_key: template.key,
    system_prompt: template.system_prompt,
    llm_model_id: modelId || null,
    model: defaultModel,
    knowledge_base_ids: template.knowledge_bases.required ? knowledgeIds.slice(0, 1) : [],
    input_fields: template.input_fields,
    output: template.output,
    tools: template.tools,
    guardrails: template.guardrails,
    memory: template.memory,
    delivery: template.delivery,
    agent: defaultAgent,
  };
}

function InputFieldsEditor({ fields, onChange }: { fields: InputField[]; onChange: (fields: InputField[]) => void }) {
  const update = (index: number, patch: Partial<InputField>) => onChange(fields.map((field, itemIndex) => itemIndex === index ? { ...field, ...patch } : field));
  const move = (index: number, offset: number) => {
    const next = [...fields];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const add = () => {
    let ordinal = fields.length + 1;
    while (fields.some((field) => field.key === `field_${ordinal}`)) ordinal += 1;
    onChange([...fields, { key: `field_${ordinal}`, label: '新字段', type: 'text', description: '', required: false, placeholder: '', options: [] }]);
  };
  return <div className="schema-editor"><div className="schema-editor-head"><p>字段顺序就是业务端表单顺序，key 保存后用于提示词变量。</p><Button icon={<Plus size={14} />} onClick={add}>添加字段</Button></div>{fields.map((field, index) => <div className="schema-field" key={`${field.key}-${index}`}><div className="schema-field-actions"><strong>字段 {index + 1}</strong><Button variant="ghost" icon={<ArrowUp size={13} />} disabled={index === 0} onClick={() => move(index, -1)}>上移</Button><Button variant="ghost" icon={<ArrowDown size={13} />} disabled={index === fields.length - 1} onClick={() => move(index, 1)}>下移</Button><Button variant="ghost" icon={<Trash2 size={13} />} onClick={() => onChange(fields.filter((_, itemIndex) => itemIndex !== index))}>删除</Button></div><div className="editor-grid"><label className="form-label">变量 key<input className="field" value={field.key} onChange={(event) => update(index, { key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} /></label><label className="form-label">显示名称<input className="field" value={field.label} onChange={(event) => update(index, { label: event.target.value })} /></label><label className="form-label">类型<select className="field" value={field.type} onChange={(event) => { const type = event.target.value as InputField['type']; update(index, { type, options: type === 'select' ? (field.options.length ? field.options : ['选项一']) : [], minimum: type === 'number' ? field.minimum : null, maximum: type === 'number' ? field.maximum : null }); }}><option value="text">单行文本</option><option value="textarea">多行文本</option><option value="number">数字</option><option value="select">下拉选择</option><option value="boolean">开关</option></select></label><label className="form-label">占位提示<input className="field" value={field.placeholder ?? ''} onChange={(event) => update(index, { placeholder: event.target.value })} /></label></div><label className="form-label">字段说明<input className="field" value={field.description ?? ''} onChange={(event) => update(index, { description: event.target.value })} /></label>{field.type === 'select' ? <label className="form-label">选项（每行一个）<textarea className="field compact-textarea" value={field.options.join('\n')} onChange={(event) => update(index, { options: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })} /></label> : null}{field.type === 'number' ? <div className="inline-fields"><label className="form-label">最小值<input className="field" type="number" value={field.minimum ?? ''} onChange={(event) => update(index, { minimum: event.target.value === '' ? null : Number(event.target.value) })} /></label><label className="form-label">最大值<input className="field" type="number" value={field.maximum ?? ''} onChange={(event) => update(index, { maximum: event.target.value === '' ? null : Number(event.target.value) })} /></label></div> : null}<label className="check-card compact"><input type="checkbox" checked={field.required} onChange={(event) => update(index, { required: event.target.checked })} /><span><strong>必填字段</strong><small>业务端未填写时阻止运行。</small></span></label></div>)}</div>;
}

function defaultInputs(manifest: AppManifest | null) {
  return Object.fromEntries(manifest?.input_fields.map((field) => [field.key, field.default ?? (field.type === 'boolean' ? false : '')]) ?? []);
}

function versionDiffLabels(current: AppManifest, previous?: AppManifest) {
  if (!previous) return ['首个版本'];
  const sections: Array<[keyof AppManifest, string]> = [
    ['system_prompt', '提示词'], ['model', '模型参数'], ['input_fields', '输入表单'],
    ['knowledge_base_ids', '知识库'], ['tools', '工具'], ['guardrails', '安全规则'],
    ['memory', '记忆'], ['delivery', '交付设置'], ['agent', 'Agent 参数'],
  ];
  const changed = sections.filter(([key]) => JSON.stringify(current[key]) !== JSON.stringify(previous[key])).map(([, label]) => label);
  return changed.length ? changed : ['无配置差异'];
}

export function FDEStudioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [templates, setTemplates] = useState<AppTemplate[]>([]);
  const [models, setModels] = useState<ApiModelOption[]>([]);
  const [knowledge, setKnowledge] = useState<ApiKnowledgeBase[]>([]);
  const [availableTools, setAvailableTools] = useState<ApiToolConfig[]>([]);
  const [templateKey, setTemplateKey] = useState('content');
  const [modelId, setModelId] = useState('');
  const [brief, setBrief] = useState('为餐饮业务设计一个特色菜文案助手。输入菜品、食材口味和核心卖点，可以针对小红书或公众号生成不同语气的文案，不得虚构功效。');
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [app, setApp] = useState<FDEApp | null>(null);
  const [tab, setTab] = useState<StudioTab>('design');
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<RunResult | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [evaluation, setEvaluation] = useState<{ passed: number; failed: number; results: Array<{ name: string; passed: boolean; reasons: string[] }> } | null>(null);
  const [expectedKeywords, setExpectedKeywords] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [dirty, setDirty] = useState(false);
  const [autosaving, setAutosaving] = useState(false);
  const [shares, setShares] = useState<AppShare[]>([]);
  const [shareName, setShareName] = useState('业务分享');
  const [shareDays, setShareDays] = useState(30);
  const [shareMaxUses, setShareMaxUses] = useState('');
  const [newShareToken, setNewShareToken] = useState('');
  const [jsonOpen, setJsonOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    Promise.all([fdeApi.templates(), apiFetch<ApiModelOption[]>('/model-options'), apiFetch<ApiKnowledgeBase[]>('/knowledge-bases'), apiFetch<ApiToolConfig[]>('/tools')])
      .then(([loadedTemplates, loadedModels, loadedKnowledge, loadedTools]) => {
        setTemplates(loadedTemplates);
        setModels(loadedModels);
        setKnowledge(loadedKnowledge);
        setAvailableTools(loadedTools.filter((tool) => tool.is_enabled));
        const firstModel = loadedModels.find((item) => item.model_type === 'llm' && item.is_enabled && item.connection_status !== 'error');
        setModelId(firstModel?.id ?? '');
        const appId = searchParams.get('app');
        if (appId) return fdeApi.get(appId).then((loadedApp) => {
          setApp(loadedApp);
          const normalized = normalizeManifest(loadedApp.manifest);
          setManifest(normalized);
          setTemplateKey(loadedApp.manifest.template_key);
          setModelId(loadedApp.manifest.llm_model_id ?? '');
          setInputs(defaultInputs(normalized));
          setBrief(loadedApp.description);
          setDirty(false);
        });
        return undefined;
      })
      .catch((caught) => setError(errorMessage(caught)));
  }, [searchParams]);

  const llms = useMemo(() => models.filter((item) => item.model_type === 'llm' && item.is_enabled && item.connection_status !== 'error'), [models]);
  const selectedTemplate = templates.find((item) => item.key === templateKey);

  useEffect(() => {
    if (!app?.id) { setShares([]); return; }
    fdeApi.shares(app.id).then(setShares).catch((caught) => setError(errorMessage(caught)));
  }, [app?.id]);

  const updateManifest = (patch: Partial<AppManifest>) => {
    setManifest((current) => current ? { ...current, ...patch } : current);
    setApp((current) => current ? { ...current, status: 'draft' } : current);
    setDirty(true);
  };

  useEffect(() => {
    if (!dirty || !app || !manifest || busy) return undefined;
    const snapshot = JSON.stringify(manifest);
    const timer = window.setTimeout(() => {
      setAutosaving(true);
      fdeApi.save(app.id, manifest).then((saved) => {
        setApp(saved);
        setManifest((current) => {
          if (current && JSON.stringify(current) === snapshot) {
            setDirty(false);
            return normalizeManifest(saved.manifest);
          }
          return current;
        });
      }).catch((caught) => setError(errorMessage(caught))).finally(() => setAutosaving(false));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [app, busy, dirty, manifest]);

  const generate = async () => {
    if (!brief.trim()) return;
    setBusy('design');
    setError('');
    try {
      const response = await fdeApi.design({ brief, template_key: templateKey, llm_model_id: modelId || null });
      const normalized = normalizeManifest(response.manifest);
      setManifest(normalized);
      setApp(null);
      setSearchParams({});
      setInputs(defaultInputs(normalized));
      setIssues(response.issues);
      setResult(null);
      setEvaluation(null);
      setTab('design');
      setDirty(false);
      showToast(response.simulated ? '已用测试替身生成应用定义，请完成真实模型验证' : 'AI 应用定义已生成');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy('');
    }
  };

  const useTemplate = () => {
    if (!selectedTemplate) return;
    const next = fromTemplate(selectedTemplate, modelId, knowledge.map((item) => item.id));
    setManifest(next);
    setApp(null);
    setInputs(defaultInputs(next));
    setResult(null);
    setEvaluation(null);
    setDirty(false);
  };

  const save = async () => {
    if (!manifest) return null;
    setBusy('save');
    setError('');
    try {
      const saved = app ? await fdeApi.save(app.id, manifest) : await fdeApi.create(manifest);
      setApp(saved);
      setManifest(normalizeManifest(saved.manifest));
      setDirty(false);
      setSearchParams({ app: saved.id }, { replace: true });
      const validation = await fdeApi.validate(saved.id);
      setIssues(validation.issues);
      showToast('草稿已保存，发布版本不受影响');
      return saved;
    } catch (caught) {
      setError(errorMessage(caught));
      return null;
    } finally {
      setBusy('');
    }
  };

  const preview = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy('preview');
    setError('');
    try {
      const saved = await save();
      if (!saved) return;
      setResult(await fdeApi.preview(saved.id, { input_values: inputs }));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy('');
    }
  };

  const evaluate = async () => {
    if (!manifest) return;
    setBusy('evaluate');
    setError('');
    try {
      const saved = await save();
      if (!saved) return;
      await fdeApi.saveSuite(saved.id, '发布前业务验收', [{
        name: '当前业务输入验收',
        message: '',
        input_values: inputs,
        expected_keywords: expectedKeywords.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean),
        forbidden_keywords: [],
        require_citations: manifest.guardrails.require_citations,
      }]);
      const response = await fdeApi.evaluate(saved.id);
      setEvaluation({ passed: response.passed_count, failed: response.failed_count, results: response.results });
      showToast(response.failed_count ? '评测未通过，请查看原因' : '全部评测通过');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy('');
    }
  };

  const publish = async () => {
    if (!app) return;
    setBusy('publish');
    setError('');
    try {
      const version = await fdeApi.version(app.id, releaseNotes.trim());
      const published = await fdeApi.publish(app.id, version.id);
      setApp(published);
      setReleaseNotes('');
      showToast(`版本 v${version.version} 已发布`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy('');
    }
  };

  const rollback = async (versionId: string) => {
    if (!app) return;
    setBusy('rollback');
    try {
      setApp(await fdeApi.rollback(app.id, versionId));
      showToast('已回滚到所选版本');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy('');
    }
  };

  const createShare = async () => {
    if (!app) return;
    setBusy('share');
    try {
      const created = await fdeApi.createShare(app.id, { name: shareName.trim() || '业务分享', expires_in_days: shareDays, max_uses: shareMaxUses ? Number(shareMaxUses) : null });
      setShares((current) => [created, ...current]);
      setNewShareToken(created.token ?? '');
      showToast('免登录分享链接已创建，凭证只显示一次');
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(''); }
  };

  const revokeShare = async (shareId: string) => {
    if (!app) return;
    try {
      await fdeApi.revokeShare(app.id, shareId);
      setShares((current) => current.map((item) => item.id === shareId ? { ...item, is_enabled: false } : item));
      showToast('分享链接已撤销');
    } catch (caught) { setError(errorMessage(caught)); }
  };

  return (
    <main className="page page-enter studio-page">
      <PageHeader eyebrow="FDE DELIVERY STUDIO" title="AI 应用设计室" description="用自然语言或标准模板完成应用设计、验证、评测和发布；每一步都对应可编程的 FDE API。" actions={<><Link className="button button--secondary" to="/apps"><Layers3 size={16} />应用中心</Link>{manifest ? <Button icon={<FileJson size={16} />} onClick={() => setJsonOpen((current) => !current)}>查看协议</Button> : null}</>} />
      {error ? <Notice tone="error" title="当前步骤未完成">{error}</Notice> : null}
      <ol className="delivery-steps" aria-label="应用交付流程">
        {[['01', '需求与设计', '自然语言 + 标准模板'], ['02', '草稿与验证', '动态表单 + 真实预览'], ['03', '评测与发布', '二元验收 + 版本交付']].map(([number, title, detail], index) => <li className={(index === 0 && !manifest) || (index === 1 && manifest && tab !== 'release') || (index === 2 && tab === 'release') ? 'active' : ''} key={number}><span>{number}</span><div><strong>{title}</strong><small>{detail}</small></div>{index < 2 ? <ChevronRight size={16} /> : null}</li>)}
      </ol>
      <div className="studio-layout">
        <aside className="studio-brief">
          <section className="card studio-panel">
            <header className="studio-panel-header"><span><WandSparkles size={18} /></span><div><h2>定义业务需求</h2><p>说清楚用户、任务、输入和交付边界。</p></div></header>
            <label className="form-label">需求简报<textarea className="field brief-field" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="例如：为门店运营人员设计特色菜文案助手……" /></label>
            <div className="form-label">应用模板<div className="template-picker">{templates.map((template) => <button type="button" className={templateKey === template.key ? 'active' : ''} key={template.key} onClick={() => setTemplateKey(template.key)}><strong>{template.name}</strong><small>{template.knowledge_bases.required ? '需要知识库' : '知识库可选'}</small></button>)}</div></div>
            <label className="form-label">设计与运行模型<select className="field" value={modelId} onChange={(event) => setModelId(event.target.value)}><option value="">请选择模型</option>{llms.map((model) => <option key={model.id} value={model.id}>{model.display_name} · {model.provider}</option>)}</select></label>
            <Button variant="primary" icon={busy === 'design' ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />} disabled={!brief.trim() || !modelId || busy === 'design'} onClick={generate}>{busy === 'design' ? 'AI 正在设计…' : 'AI 生成应用定义'}</Button>
            <Button icon={<Plus size={16} />} onClick={useTemplate} disabled={!selectedTemplate}>直接使用标准模板</Button>
          </section>
          <section className="card studio-contract"><Code2 size={18} /><div><strong>人机共用一套协议</strong><p>当前设计会保存为 <code>fde.app/v2</code>，AI 可通过 API 继续修改、评测和发布。</p></div></section>
        </aside>

        <section className="studio-workspace">
          {!manifest ? <div className="card studio-empty"><span><Bot size={28} /></span><h2>从需求到可交付应用</h2><p>生成后这里会出现结构化应用定义。你可以继续调整表单、提示词、知识和输出，再进行真实预览与发布。</p><div><span>动态输入</span><span>知识检索</span><span>输出契约</span><span>质量门禁</span></div></div> : <>
            <header className="studio-document-header"><div><Badge tone="info">{manifest.schema_version}</Badge><Badge tone={dirty || autosaving ? 'warning' : app?.status === 'published' ? 'success' : 'info'}>{autosaving ? '自动保存中' : dirty ? '有未保存修改' : app?.status === 'published' ? '已发布' : app ? '草稿已保存' : '未保存草稿'}</Badge></div><Button icon={<Save size={16} />} disabled={busy === 'save' || autosaving} onClick={save}>{busy === 'save' ? '保存中…' : '保存草稿'}</Button></header>
            <div className="studio-tabs" role="tablist" aria-label="应用设计视图">{([['design', '应用配置', ClipboardCheck], ['preview', '测试预览', FlaskConical], ['channels', '发布渠道', Globe], ['release', '评测与发布', Rocket]] as const).map(([value, label, Icon]) => <button role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} key={value} onClick={() => setTab(value)}><Icon size={16} />{label}</button>)}</div>
            {jsonOpen ? <pre className="manifest-view">{JSON.stringify(manifest, null, 2)}</pre> : null}

            {tab === 'design' ? <div className="studio-editor">
              <section className="card editor-section">
                <header><span>01</span><div><h2>应用身份与模型</h2><p>简易应用直接生成结果；Agent 可在模型判断后调用已授权工具。</p></div></header>
                <div className="editor-grid"><label className="form-label">应用名称<input className="field" value={manifest.name} onChange={(event) => updateManifest({ name: event.target.value })} /></label><label className="form-label">应用类型<select className="field" value={manifest.type} onChange={(event) => { const type = event.target.value as AppManifest['type']; updateManifest({ type, schema_version: 'fde.app/v2', tools: type === 'simple' ? manifest.tools.filter((tool) => !tool.tool_id) : manifest.tools }); }}><option value="simple">简易应用</option><option value="agent">Agent</option></select></label><label className="form-label">运行模型<select className="field" value={manifest.llm_model_id ?? ''} onChange={(event) => updateManifest({ llm_model_id: event.target.value || null })}><option value="">请选择模型</option>{llms.map((model) => <option key={model.id} value={model.id}>{model.display_name} · {model.provider}</option>)}</select></label><label className="form-label">输出格式<select className="field" value={manifest.output.format} onChange={(event) => updateManifest({ output: { ...manifest.output, format: event.target.value as AppManifest['output']['format'] } })}><option value="markdown">Markdown</option><option value="text">纯文本</option><option value="json">JSON</option></select></label></div>
                <label className="form-label">应用说明<textarea className="field" value={manifest.description} onChange={(event) => updateManifest({ description: event.target.value })} /></label><label className="form-label">系统提示词<textarea className="field prompt-field" value={manifest.system_prompt} onChange={(event) => updateManifest({ system_prompt: event.target.value })} /></label>
                <div className="editor-grid"><label className="form-label">温度：{manifest.model.temperature.toFixed(1)}<input type="range" min="0" max="2" step="0.1" value={manifest.model.temperature} onChange={(event) => updateManifest({ model: { ...manifest.model, temperature: Number(event.target.value) } })} /></label><label className="form-label">最大输出 Tokens<input className="field" type="number" min="64" max="32768" value={manifest.model.max_tokens} onChange={(event) => updateManifest({ model: { ...manifest.model, max_tokens: Number(event.target.value) } })} /></label><label className="form-label">思考模式<select className="field" value={manifest.model.thinking_mode} onChange={(event) => updateManifest({ model: { ...manifest.model, thinking_mode: event.target.value as AppManifest['model']['thinking_mode'] } })}><option value="auto">自动</option><option value="enabled">开启</option><option value="disabled">关闭</option></select></label></div>
              </section>
              <section className="card editor-section"><header><span>02</span><div><h2>业务输入表单</h2><p>可以新增、删除、排序，并配置类型、选项和数值范围。</p></div></header><InputFieldsEditor fields={manifest.input_fields} onChange={(input_fields) => { updateManifest({ input_fields }); setInputs(defaultInputs({ ...manifest, input_fields })); }} /></section>
              <section className="card editor-section"><header><span>03</span><div><h2>知识、检索与安全</h2><p>配置知识来源、检索阈值和生成边界。</p></div></header>{knowledge.length ? knowledge.map((kb) => <label className="check-card" key={kb.id}><input type="checkbox" checked={manifest.knowledge_base_ids.includes(kb.id)} onChange={(event) => updateManifest({ knowledge_base_ids: event.target.checked ? [...manifest.knowledge_base_ids, kb.id] : manifest.knowledge_base_ids.filter((id) => id !== kb.id) })} /><span><strong>{kb.name}</strong><small>{kb.file_count} 个文件 · {kb.chunk_count} 个分块</small></span>{manifest.knowledge_base_ids.includes(kb.id) ? <Check size={16} /> : null}</label>) : <p>暂无知识库；内容生成应用仍可运行。</p>}
                {manifest.knowledge_base_ids.length ? <div className="editor-grid retrieval-settings"><label className="form-label">向量召回 Top K<input className="field" type="number" min="1" max="50" value={Number(manifest.tools.find((tool) => tool.name === 'knowledge_retrieval')?.config.top_k ?? 8)} onChange={(event) => { const current = manifest.tools.find((tool) => tool.name === 'knowledge_retrieval') ?? { name: 'knowledge_retrieval', enabled: true, config: {} }; updateManifest({ tools: [...manifest.tools.filter((tool) => tool.name !== 'knowledge_retrieval'), { ...current, config: { ...current.config, top_k: Number(event.target.value) } }] }); }} /></label><label className="form-label">Rerank 保留<input className="field" type="number" min="1" max="20" value={Number(manifest.tools.find((tool) => tool.name === 'knowledge_retrieval')?.config.rerank_top_n ?? 3)} onChange={(event) => { const current = manifest.tools.find((tool) => tool.name === 'knowledge_retrieval') ?? { name: 'knowledge_retrieval', enabled: true, config: {} }; updateManifest({ tools: [...manifest.tools.filter((tool) => tool.name !== 'knowledge_retrieval'), { ...current, config: { ...current.config, rerank_top_n: Number(event.target.value) } }] }); }} /></label><label className="form-label">最低相关度<input className="field" type="number" min="-1" max="1" step="0.05" value={Number(manifest.tools.find((tool) => tool.name === 'knowledge_retrieval')?.config.score_threshold ?? 0.35)} onChange={(event) => { const current = manifest.tools.find((tool) => tool.name === 'knowledge_retrieval') ?? { name: 'knowledge_retrieval', enabled: true, config: {} }; updateManifest({ tools: [...manifest.tools.filter((tool) => tool.name !== 'knowledge_retrieval'), { ...current, config: { ...current.config, score_threshold: Number(event.target.value) } }] }); }} /></label><label className="form-label">引用上下文上限<input className="field" type="number" min="100" max="50000" value={Number(manifest.tools.find((tool) => tool.name === 'knowledge_retrieval')?.config.max_context_chars ?? 12000)} onChange={(event) => { const current = manifest.tools.find((tool) => tool.name === 'knowledge_retrieval') ?? { name: 'knowledge_retrieval', enabled: true, config: {} }; updateManifest({ tools: [...manifest.tools.filter((tool) => tool.name !== 'knowledge_retrieval'), { ...current, config: { ...current.config, max_context_chars: Number(event.target.value) } }] }); }} /></label></div> : null}
                <div className="settings-checks"><label className="check-card"><input type="checkbox" checked={manifest.guardrails.require_citations} onChange={(event) => updateManifest({ guardrails: { ...manifest.guardrails, require_citations: event.target.checked } })} /><span><strong>回答附引用</strong><small>结果展示命中的原始分块。</small></span></label><label className="check-card"><input type="checkbox" checked={manifest.guardrails.refuse_without_evidence} onChange={(event) => updateManifest({ guardrails: { ...manifest.guardrails, refuse_without_evidence: event.target.checked } })} /><span><strong>无依据时拒答</strong><small>检索不到足够证据时不调用模型编造。</small></span></label><label className="check-card"><input type="checkbox" checked={manifest.guardrails.human_handoff} onChange={(event) => updateManifest({ guardrails: { ...manifest.guardrails, human_handoff: event.target.checked } })} /><span><strong>允许转人工</strong><small>高风险或无依据请求返回转接状态。</small></span></label><label className="check-card"><input type="checkbox" checked={manifest.memory.enabled} onChange={(event) => updateManifest({ memory: { ...manifest.memory, enabled: event.target.checked } })} /><span><strong>短期会话记忆</strong><small>最多保留 {manifest.memory.max_turns} 轮。</small></span></label></div><label className="form-label">禁止主题（每行一个）<textarea className="field compact-textarea" value={manifest.guardrails.blocked_topics.join('\n')} onChange={(event) => updateManifest({ guardrails: { ...manifest.guardrails, blocked_topics: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) } })} /></label>
              </section>
              {manifest.type === 'agent' ? <section className="card editor-section"><header><span>04</span><div><h2>Agent 工具与执行</h2><p>仅已授权工具会暴露给模型；具有副作用的工具默认要求确认。</p></div></header><div className="agent-tool-picker">{availableTools.map((tool) => { const enabled = manifest.tools.some((item) => item.tool_id === tool.id); const safeName = `tool_${tool.id.replace(/-/g, '_')}`.slice(0, 64); return <label className="check-card" key={tool.id}><input type="checkbox" checked={enabled} onChange={(event) => updateManifest({ tools: event.target.checked ? [...manifest.tools, { name: safeName, tool_id: tool.id, enabled: true, config: {} }] : manifest.tools.filter((item) => item.tool_id !== tool.id) })} /><span><strong>{tool.name}</strong><small>{tool.description || `${tool.config.method} ${tool.config.url}`}</small></span><Badge tone={tool.connection_status === 'connected' ? 'success' : 'warning'}>{tool.connection_status === 'connected' ? '已验证' : '未验证'}</Badge></label>; })}</div>{!availableTools.length ? <Notice title="还没有可用工具"><Link className="text-link" to="/tools">前往工具库创建并调试 HTTP 工具</Link></Notice> : null}<div className="editor-grid"><label className="form-label">最大推理步数<input className="field" type="number" min="1" max="20" value={manifest.agent.max_steps} onChange={(event) => updateManifest({ agent: { ...manifest.agent, max_steps: Number(event.target.value) } })} /></label><label className="check-card"><input type="checkbox" checked={manifest.agent.require_confirmation_for_side_effects} onChange={(event) => updateManifest({ agent: { ...manifest.agent, require_confirmation_for_side_effects: event.target.checked } })} /><span><strong>副作用操作要求确认</strong><small>创建工单、修改数据等工具不会静默执行。</small></span></label><label className="check-card"><input type="checkbox" checked={manifest.agent.show_tool_steps} onChange={(event) => updateManifest({ agent: { ...manifest.agent, show_tool_steps: event.target.checked } })} /><span><strong>展示工具步骤</strong><small>业务端显示工具名称和执行状态。</small></span></label></div><Notice tone="warning" title="长期记忆尚未开放">当前只保存会话内历史；跨会话画像与偏好不会被宣称为已实现。</Notice></section> : null}
              <section className="card editor-section"><header><span>{manifest.type === 'agent' ? '05' : '04'}</span><div><h2>交付设置</h2><p>配置业务端展示和允许的结果操作。</p></div></header><div className="settings-checks"><label className="check-card"><input type="checkbox" checked={manifest.delivery.show_citations} onChange={(event) => updateManifest({ delivery: { ...manifest.delivery, show_citations: event.target.checked } })} /><span><strong>显示引用</strong></span></label><label className="check-card"><input type="checkbox" checked={manifest.delivery.allow_copy} onChange={(event) => updateManifest({ delivery: { ...manifest.delivery, allow_copy: event.target.checked } })} /><span><strong>允许复制</strong></span></label><label className="check-card"><input type="checkbox" checked={manifest.delivery.allow_export} onChange={(event) => updateManifest({ delivery: { ...manifest.delivery, allow_export: event.target.checked } })} /><span><strong>允许导出</strong><small>当前导出为文本/Markdown 文件。</small></span></label></div></section>
            </div> : null}

            {tab === 'preview' ? <div className="studio-preview-grid"><section className="card preview-form"><header className="section-header"><div><h2>填写真实业务输入</h2><p>预览只运行当前草稿，不会自动发布。</p></div></header><form className="form-stack" onSubmit={(event) => void preview(event)}>{manifest.input_fields.map((field) => <label className="form-label" key={field.key}>{field.label}{field.required ? <span className="required-mark">*</span> : null}{field.type === 'textarea' ? <textarea className="field" required={field.required} placeholder={field.placeholder} value={String(inputs[field.key] ?? '')} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.value }))} /> : field.type === 'select' ? <select className="field" value={String(inputs[field.key] ?? '')} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.value }))}>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : field.type === 'boolean' ? <input type="checkbox" checked={Boolean(inputs[field.key])} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.checked }))} /> : <input className="field" type={field.type === 'number' ? 'number' : 'text'} required={field.required} min={field.minimum ?? undefined} max={field.maximum ?? undefined} placeholder={field.placeholder} value={String(inputs[field.key] ?? '')} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: field.type === 'number' ? Number(event.target.value) : event.target.value }))} />}{field.description ? <small>{field.description}</small> : null}</label>)}<Button type="submit" variant="primary" icon={<Send size={16} />} disabled={busy === 'preview'}>{busy === 'preview' ? '正在运行…' : '运行草稿预览'}</Button></form></section><section className="card studio-result"><header className="section-header"><div><h2>运行结果</h2><p>真实显示模型、耗时和模拟来源。</p></div>{result ? <Badge tone={result.simulated ? 'warning' : 'success'}>{result.simulated ? '含测试替身' : '真实模型调用'}</Badge> : null}</header>{result ? <><div className="answer-text">{result.content}</div>{result.agent_steps?.length ? <div className="agent-step-list"><h3><Wrench size={15} />工具执行过程</h3>{result.agent_steps.map((step, index) => <details key={`${step.tool}-${index}`}><summary><Badge tone={step.status === 'success' ? 'success' : step.status === 'confirmation_required' ? 'warning' : 'error'}>{step.status}</Badge>{step.tool}</summary><pre>{JSON.stringify(step.arguments, null, 2)}</pre><p>{step.result}</p></details>)}</div> : null}{result.handoff ? <Notice tone="warning" title="已触发人工转接">请由业务人员继续处理当前请求。</Notice> : null}<div className="message-meta"><span>{result.tokens.total ?? '—'} Tokens</span><span>{(result.duration_ms / 1000).toFixed(2)}s</span></div>{manifest.delivery.allow_copy ? <Button icon={<Copy size={15} />} onClick={() => void navigator.clipboard.writeText(result.content)}>复制结果</Button> : null}</> : <div className="empty-state"><Play size={24} /><h2>尚未运行</h2><p>填写左侧输入，验证当前应用是否真正解决业务任务。</p></div>}</section></div> : null}

            {tab === 'channels' ? <div className="channel-layout">
              <section className="card editor-section">
                <header><span>01</span><div><h2>企业工作台</h2><p>已发布应用自动出现在业务应用目录，登录用户按当前工作空间访问。</p></div><Badge tone={app?.is_enabled ? 'success' : 'warning'}>{app?.is_enabled ? '已启用' : '待发布'}</Badge></header>
                {app?.is_enabled ? <Link className="button button--secondary" to={app.portal_path}><ExternalLink size={15} />打开业务端</Link> : <Notice tone="warning" title="应用尚未发布">先通过评测与发布门禁，再创建公开渠道。</Notice>}
              </section>
              <section className="card editor-section">
                <header><span>02</span><div><h2>免登录分享与 iframe</h2><p>每条链接使用独立随机凭证，可设置有效期和最大运行次数；服务端只保存哈希。</p></div></header>
                <div className="channel-create-grid"><label className="form-label">链接名称<input className="field" value={shareName} onChange={(event) => setShareName(event.target.value)} /></label><label className="form-label">有效天数<input className="field" type="number" min="1" max="365" value={shareDays} onChange={(event) => setShareDays(Number(event.target.value))} /></label><label className="form-label">最大运行次数（空为不限）<input className="field" type="number" min="1" value={shareMaxUses} onChange={(event) => setShareMaxUses(event.target.value)} /></label><Button variant="primary" icon={<Link2 size={15} />} disabled={!app?.is_enabled || busy === 'share'} onClick={() => void createShare()}>{busy === 'share' ? '创建中…' : '创建分享链接'}</Button></div>
                {newShareToken ? <Notice tone="success" title="分享凭证只显示一次"><div className="channel-token"><code>{`${window.location.origin}/share/${newShareToken}`}</code><Button icon={<Copy size={14} />} onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/share/${newShareToken}`)}>复制链接</Button><Button icon={<Code2 size={14} />} onClick={() => void navigator.clipboard.writeText(`<iframe src="${window.location.origin}/share/${newShareToken}" width="100%" height="720" loading="lazy" referrerpolicy="no-referrer"></iframe>`)}>复制 iframe</Button><a className="button button--secondary" href={`/share/${newShareToken}`} target="_blank" rel="noreferrer"><ExternalLink size={14} />打开</a></div></Notice> : null}
                <div className="share-list">{shares.map((share) => <div key={share.id}><span><strong>{share.name}</strong><small>{share.expires_at ? `${new Date(share.expires_at).toLocaleString('zh-CN')} 到期` : '永久'} · 已运行 {share.use_count}{share.max_uses ? ` / ${share.max_uses}` : ''} 次</small></span><Badge tone={share.is_enabled ? 'success' : 'neutral'}>{share.is_enabled ? '有效' : '已撤销'}</Badge>{share.is_enabled ? <Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => void revokeShare(share.id)}>撤销</Button> : null}</div>)}</div>
              </section>
              <section className="card editor-section">
                <header><span>03</span><div><h2>企业消息渠道</h2><p>企业微信、飞书、钉钉和公众号需要各平台应用凭据、回调域名与管理员授权。</p></div><Badge tone="warning">未连接</Badge></header>
                <Notice tone="info" title="接入边界">当前不会保存虚构 Corp ID 或 Secret，也不会把未验证的机器人回调标记为已启用。获得真实企业配置后可继续接入。</Notice>
              </section>
            </div> : null}

            {tab === 'release' ? <div className="release-layout">
              <section className="card release-checklist">
                <header className="section-header"><div><h2>发布质量门禁</h2><p>配置有效、真实预览、二元评测全部通过后再交付。</p></div></header>
                <div className="release-check"><span>1</span><div><strong>协议与资源校验</strong><p>{issues.length ? `${issues.length} 个待处理问题` : '模型、知识和 Manifest 校验通过'}</p></div><Badge tone={issues.length ? 'error' : 'success'}>{issues.length ? '待处理' : '通过'}</Badge></div>
                {issues.map((issue) => <div className="validation-issue" key={`${issue.path}-${issue.code}`}><code>{issue.path}</code><span>{issue.message}</span></div>)}
                <div className="release-check"><span>2</span><div><strong>业务评测</strong><p>使用当前表单输入，检查必须出现的内容和引用。</p></div>{evaluation ? <Badge tone={evaluation.failed ? 'error' : 'success'}>{evaluation.failed ? '未通过' : '通过'}</Badge> : <Badge>未运行</Badge>}</div>
                <label className="form-label">期望结果包含的关键词<textarea className="field" value={expectedKeywords} onChange={(event) => setExpectedKeywords(event.target.value)} placeholder="多个关键词用逗号分隔；问答应用还会检查引用" /></label>
                <Button icon={<FlaskConical size={16} />} disabled={busy === 'evaluate'} onClick={evaluate}>{busy === 'evaluate' ? '评测中…' : '保存并运行评测'}</Button>
                {evaluation?.results.map((item) => <div className="evaluation-result" key={item.name}><Badge tone={item.passed ? 'success' : 'error'}>{item.passed ? 'PASS' : 'FAIL'}</Badge><strong>{item.name}</strong>{item.reasons.map((reason) => <p key={reason}>{reason}</p>)}</div>)}
                <label className="form-label release-notes">版本说明<textarea className="field" value={releaseNotes} onChange={(event) => setReleaseNotes(event.target.value)} placeholder="说明本次发布解决了什么问题、变更了哪些能力" /></label>
                <div className="publish-action"><div><strong>创建版本并发布</strong><p>发布会固化当前草稿和版本说明，后续修改不会影响线上版本。</p></div><Button variant="primary" icon={<Rocket size={16} />} disabled={!app || busy === 'publish' || Boolean(issues.length)} onClick={publish}>{busy === 'publish' ? '发布中…' : '创建版本并发布'}</Button></div>
              </section>
              <section className="card version-panel">
                <header className="section-header"><div><h2>交付与版本</h2><p>业务端只运行已发布版本；下方显示相邻版本的配置差异。</p></div></header>
                {app?.is_enabled ? <div className="delivery-link"><Badge tone="success">线上运行中</Badge><h3>{app.name}</h3><Link className="text-link" to={app.portal_path}>打开业务使用端 <ArrowRight size={15} /></Link></div> : <div className="empty-state"><Rocket size={24} /><h2>尚未发布</h2><p>完成质量门禁后生成第一个交付版本。</p></div>}
                <div className="version-list">{app?.versions.map((version, index) => <div className="version-entry" key={version.id}><span><strong>v{version.version}</strong><small>{version.id === app.published_version_id ? '当前线上版本' : '历史版本'}</small>{version.release_notes ? <small className="version-notes">{version.release_notes}</small> : null}<small className="version-diff">变更：{versionDiffLabels(version.manifest, app.versions[index + 1]?.manifest).join('、')}</small></span>{version.id !== app.published_version_id ? <Button variant="ghost" disabled={busy === 'rollback'} onClick={() => void rollback(version.id)}>回滚</Button> : <Badge tone="success">当前</Badge>}</div>)}</div>
              </section>
            </div> : null}
          </>}
        </section>
      </div>
    </main>
  );
}
