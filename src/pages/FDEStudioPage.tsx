import { ArrowRight, Bot, Check, ChevronRight, ClipboardCheck, Code2, Copy, FileJson, FlaskConical, Layers3, LoaderCircle, Play, Plus, Rocket, Save, Send, Sparkles, WandSparkles } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch, errorMessage, type ApiKnowledgeBase, type ApiModelOption } from '../api/client';
import { fdeApi, type AppManifest, type AppTemplate, type FDEApp, type RunResult, type ValidationIssue } from '../api/fde';
import { Badge, Button, Notice, PageHeader } from '../components/ui';
import { useToast } from '../components/Toast';

type StudioTab = 'design' | 'preview' | 'release';

function fromTemplate(template: AppTemplate, modelId: string, knowledgeIds: string[]): AppManifest {
  return {
    schema_version: 'fde.app/v1',
    name: template.name,
    description: template.description,
    template_key: template.key,
    system_prompt: template.system_prompt,
    llm_model_id: modelId || null,
    knowledge_base_ids: template.knowledge_bases.required ? knowledgeIds.slice(0, 1) : [],
    input_fields: template.input_fields,
    output: template.output,
    tools: template.tools,
    guardrails: template.guardrails,
    memory: template.memory,
    delivery: template.delivery,
  };
}

function defaultInputs(manifest: AppManifest | null) {
  return Object.fromEntries(manifest?.input_fields.map((field) => [field.key, field.default ?? (field.type === 'boolean' ? false : '')]) ?? []);
}

export function FDEStudioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [templates, setTemplates] = useState<AppTemplate[]>([]);
  const [models, setModels] = useState<ApiModelOption[]>([]);
  const [knowledge, setKnowledge] = useState<ApiKnowledgeBase[]>([]);
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
  const [jsonOpen, setJsonOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const { showToast } = useToast();

  useEffect(() => {
    Promise.all([fdeApi.templates(), apiFetch<ApiModelOption[]>('/model-options'), apiFetch<ApiKnowledgeBase[]>('/knowledge-bases')])
      .then(([loadedTemplates, loadedModels, loadedKnowledge]) => {
        setTemplates(loadedTemplates);
        setModels(loadedModels);
        setKnowledge(loadedKnowledge);
        const firstModel = loadedModels.find((item) => item.model_type === 'llm' && item.is_enabled && item.connection_status !== 'error');
        setModelId(firstModel?.id ?? '');
        const appId = searchParams.get('app');
        if (appId) return fdeApi.get(appId).then((loadedApp) => {
          setApp(loadedApp);
          setManifest(loadedApp.manifest);
          setTemplateKey(loadedApp.manifest.template_key);
          setModelId(loadedApp.manifest.llm_model_id ?? '');
          setInputs(defaultInputs(loadedApp.manifest));
          setBrief(loadedApp.description);
        });
        return undefined;
      })
      .catch((caught) => setError(errorMessage(caught)));
  }, [searchParams]);

  const llms = useMemo(() => models.filter((item) => item.model_type === 'llm' && item.is_enabled && item.connection_status !== 'error'), [models]);
  const selectedTemplate = templates.find((item) => item.key === templateKey);

  const updateManifest = (patch: Partial<AppManifest>) => {
    setManifest((current) => current ? { ...current, ...patch } : current);
    setApp((current) => current ? { ...current, status: 'draft' } : current);
  };

  const generate = async () => {
    if (!brief.trim()) return;
    setBusy('design');
    setError('');
    try {
      const response = await fdeApi.design({ brief, template_key: templateKey, llm_model_id: modelId || null });
      setManifest(response.manifest);
      setApp(null);
      setSearchParams({});
      setInputs(defaultInputs(response.manifest));
      setIssues(response.issues);
      setResult(null);
      setEvaluation(null);
      setTab('design');
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
  };

  const save = async () => {
    if (!manifest) return null;
    setBusy('save');
    setError('');
    try {
      const saved = app ? await fdeApi.save(app.id, manifest) : await fdeApi.create(manifest);
      setApp(saved);
      setManifest(saved.manifest);
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
      const version = await fdeApi.version(app.id);
      const published = await fdeApi.publish(app.id, version.id);
      setApp(published);
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
          <section className="card studio-contract"><Code2 size={18} /><div><strong>人机共用一套协议</strong><p>当前设计会保存为 <code>fde.app/v1</code>，AI 可通过 API 继续修改、评测和发布。</p></div></section>
        </aside>

        <section className="studio-workspace">
          {!manifest ? <div className="card studio-empty"><span><Bot size={28} /></span><h2>从需求到可交付应用</h2><p>生成后这里会出现结构化应用定义。你可以继续调整表单、提示词、知识和输出，再进行真实预览与发布。</p><div><span>动态输入</span><span>知识检索</span><span>输出契约</span><span>质量门禁</span></div></div> : <>
            <header className="studio-document-header"><div><Badge tone="info">{manifest.schema_version}</Badge><Badge tone={app?.status === 'published' ? 'success' : 'warning'}>{app?.status === 'published' ? '已发布' : app ? '草稿已保存' : '未保存草稿'}</Badge></div><Button icon={<Save size={16} />} disabled={busy === 'save'} onClick={save}>{busy === 'save' ? '保存中…' : '保存草稿'}</Button></header>
            <div className="studio-tabs" role="tablist" aria-label="应用设计视图">{([['design', '应用配置', ClipboardCheck], ['preview', '测试预览', FlaskConical], ['release', '评测与发布', Rocket]] as const).map(([value, label, Icon]) => <button role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} key={value} onClick={() => setTab(value)}><Icon size={16} />{label}</button>)}</div>
            {jsonOpen ? <pre className="manifest-view">{JSON.stringify(manifest, null, 2)}</pre> : null}

            {tab === 'design' ? <div className="studio-editor">
              <section className="card editor-section"><header><span>01</span><div><h2>应用身份与任务</h2><p>业务方能理解这款应用做什么、不能做什么。</p></div></header><div className="editor-grid"><label className="form-label">应用名称<input className="field" value={manifest.name} onChange={(event) => updateManifest({ name: event.target.value })} /></label><label className="form-label">输出格式<select className="field" value={manifest.output.format} onChange={(event) => updateManifest({ output: { ...manifest.output, format: event.target.value as AppManifest['output']['format'] } })}><option value="markdown">Markdown</option><option value="text">纯文本</option><option value="json">JSON</option></select></label></div><label className="form-label">应用说明<textarea className="field" value={manifest.description} onChange={(event) => updateManifest({ description: event.target.value })} /></label><label className="form-label">系统提示词<textarea className="field prompt-field" value={manifest.system_prompt} onChange={(event) => updateManifest({ system_prompt: event.target.value })} /></label></section>
              <section className="card editor-section"><header><span>02</span><div><h2>业务输入表单</h2><p>模板把自然语言需求转成可验证的结构化输入。</p></div></header><div className="input-schema-list">{manifest.input_fields.map((field) => <div key={field.key}><span><strong>{field.label}</strong><code>{field.key}</code></span><Badge>{field.type}{field.required ? ' · 必填' : ' · 选填'}</Badge></div>)}</div></section>
              <section className="card editor-section"><header><span>03</span><div><h2>知识与安全边界</h2><p>知识库是否必需由模板决定，生成类应用可以不绑定知识。</p></div></header>{knowledge.length ? knowledge.map((kb) => <label className="check-card" key={kb.id}><input type="checkbox" checked={manifest.knowledge_base_ids.includes(kb.id)} onChange={(event) => updateManifest({ knowledge_base_ids: event.target.checked ? [...manifest.knowledge_base_ids, kb.id] : manifest.knowledge_base_ids.filter((id) => id !== kb.id) })} /><span><strong>{kb.name}</strong><small>{kb.file_count} 个文件 · {kb.chunk_count} 个分块</small></span>{manifest.knowledge_base_ids.includes(kb.id) ? <Check size={16} /> : null}</label>) : <p>暂无知识库；内容生成和报告生成仍可使用模型与结构化输入。</p>}<div className="guardrail-summary"><span>无依据拒答：{manifest.guardrails.refuse_without_evidence ? '开启' : '关闭'}</span><span>引用要求：{manifest.guardrails.require_citations ? '必须' : '可选'}</span><span>人工转接：{manifest.guardrails.human_handoff ? '开启' : '关闭'}</span></div></section>
            </div> : null}

            {tab === 'preview' ? <div className="studio-preview-grid"><section className="card preview-form"><header className="section-header"><div><h2>填写真实业务输入</h2><p>预览只运行当前草稿，不会自动发布。</p></div></header><form className="form-stack" onSubmit={(event) => void preview(event)}>{manifest.input_fields.map((field) => <label className="form-label" key={field.key}>{field.label}{field.required ? <span className="required-mark">*</span> : null}{field.type === 'textarea' ? <textarea className="field" required={field.required} placeholder={field.placeholder} value={String(inputs[field.key] ?? '')} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.value }))} /> : field.type === 'select' ? <select className="field" value={String(inputs[field.key] ?? '')} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.value }))}>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : field.type === 'boolean' ? <input type="checkbox" checked={Boolean(inputs[field.key])} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.checked }))} /> : <input className="field" type={field.type === 'number' ? 'number' : 'text'} required={field.required} min={field.minimum ?? undefined} max={field.maximum ?? undefined} placeholder={field.placeholder} value={String(inputs[field.key] ?? '')} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: field.type === 'number' ? Number(event.target.value) : event.target.value }))} />}{field.description ? <small>{field.description}</small> : null}</label>)}<Button type="submit" variant="primary" icon={<Send size={16} />} disabled={busy === 'preview'}>{busy === 'preview' ? '正在运行…' : '运行草稿预览'}</Button></form></section><section className="card studio-result"><header className="section-header"><div><h2>运行结果</h2><p>真实显示模型、耗时和模拟来源。</p></div>{result ? <Badge tone={result.simulated ? 'warning' : 'success'}>{result.simulated ? '含测试替身' : '真实模型调用'}</Badge> : null}</header>{result ? <><div className="answer-text">{result.content}</div>{result.handoff ? <Notice tone="warning" title="已触发人工转接">请由业务人员继续处理当前请求。</Notice> : null}<div className="message-meta"><span>{result.tokens.total ?? '—'} Tokens</span><span>{(result.duration_ms / 1000).toFixed(2)}s</span></div><Button icon={<Copy size={15} />} onClick={() => void navigator.clipboard.writeText(result.content)}>复制结果</Button></> : <div className="empty-state"><Play size={24} /><h2>尚未运行</h2><p>填写左侧输入，验证当前应用是否真正解决业务任务。</p></div>}</section></div> : null}

            {tab === 'release' ? <div className="release-layout"><section className="card release-checklist"><header className="section-header"><div><h2>发布质量门禁</h2><p>配置有效、真实预览、二元评测全部通过后再交付。</p></div></header><div className="release-check"><span>1</span><div><strong>协议与资源校验</strong><p>{issues.length ? `${issues.length} 个待处理问题` : '模型、知识和 Manifest 校验通过'}</p></div><Badge tone={issues.length ? 'error' : 'success'}>{issues.length ? '待处理' : '通过'}</Badge></div>{issues.map((issue) => <div className="validation-issue" key={`${issue.path}-${issue.code}`}><code>{issue.path}</code><span>{issue.message}</span></div>)}<div className="release-check"><span>2</span><div><strong>业务评测</strong><p>使用当前表单输入，检查必须出现的内容和引用。</p></div>{evaluation ? <Badge tone={evaluation.failed ? 'error' : 'success'}>{evaluation.failed ? '未通过' : '通过'}</Badge> : <Badge>未运行</Badge>}</div><label className="form-label">期望结果包含的关键词<textarea className="field" value={expectedKeywords} onChange={(event) => setExpectedKeywords(event.target.value)} placeholder="多个关键词用逗号分隔；问答应用还会检查引用" /></label><Button icon={<FlaskConical size={16} />} disabled={busy === 'evaluate'} onClick={evaluate}>{busy === 'evaluate' ? '评测中…' : '保存并运行评测'}</Button>{evaluation?.results.map((item) => <div className="evaluation-result" key={item.name}><Badge tone={item.passed ? 'success' : 'error'}>{item.passed ? 'PASS' : 'FAIL'}</Badge><strong>{item.name}</strong>{item.reasons.map((reason) => <p key={reason}>{reason}</p>)}</div>)}<div className="publish-action"><div><strong>创建版本并发布</strong><p>发布会固化当前草稿，后续修改不会影响线上版本。</p></div><Button variant="primary" icon={<Rocket size={16} />} disabled={!app || busy === 'publish' || Boolean(issues.length)} onClick={publish}>{busy === 'publish' ? '发布中…' : '创建版本并发布'}</Button></div></section><section className="card version-panel"><header className="section-header"><div><h2>交付与版本</h2><p>业务端只运行已发布版本。</p></div></header>{app?.is_enabled ? <div className="delivery-link"><Badge tone="success">线上运行中</Badge><h3>{app.name}</h3><Link className="text-link" to={app.portal_path}>打开业务使用端 <ArrowRight size={15} /></Link></div> : <div className="empty-state"><Rocket size={24} /><h2>尚未发布</h2><p>完成质量门禁后生成第一个交付版本。</p></div>}<div className="version-list">{app?.versions.map((version) => <div key={version.id}><span><strong>v{version.version}</strong><small>{version.id === app.published_version_id ? '当前线上版本' : '历史版本'}</small></span>{version.id !== app.published_version_id ? <Button variant="ghost" disabled={busy === 'rollback'} onClick={() => void rollback(version.id)}>回滚</Button> : <Badge tone="success">当前</Badge>}</div>)}</div></section></div> : null}
          </>}
        </section>
      </div>
    </main>
  );
}
