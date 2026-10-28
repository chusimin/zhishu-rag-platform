import { ArrowLeft, ArrowRight, Bot, Check, Clipboard, Clock3, Copy, Download, Headphones, LoaderCircle, Send, Sparkles, ThumbsDown, ThumbsUp, Wrench } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { fdeApi, type FDEApp, type RunResult } from '../api/fde';
import { MarkdownText } from '../components/MarkdownText';
import { Badge, Button, Notice } from '../components/ui';

function PortalBrand() {
  return <Link className="portal-brand" to="/portal"><span className="brand-mark">知</span><span><strong>知枢应用中心</strong><small>AI WORKSPACE</small></span></Link>;
}

export function PortalPage() {
  const { id } = useParams();
  return <div className="portal-shell"><header className="portal-header"><PortalBrand /><nav><Link to="/portal">全部应用</Link><Link to="/dashboard">管理控制台</Link></nav></header>{id ? <PortalRunner id={id} /> : <PortalDirectory />}</div>;
}

export function SharedPortalPage() {
  const { token } = useParams();
  return <div className="portal-shell"><header className="portal-header"><PortalBrand /><nav><span>安全分享链接</span></nav></header>{token ? <PortalRunner shareToken={token} /> : <main className="portal-main"><Notice tone="error" title="分享链接无效">缺少分享凭证。</Notice></main>}</div>;
}

function PortalDirectory() {
  const [apps, setApps] = useState<FDEApp[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    fdeApi.list()
      .then((loaded) => setApps(loaded.filter((app) => app.status === 'published' && Boolean(app.published_version))))
      .catch((caught) => setError(errorMessage(caught)));
  }, []);
  return <main className="portal-main"><section className="portal-intro"><Badge tone="info">业务应用目录</Badge><h1>选择应用，开始工作</h1><p>每个应用都经过配置验证与发布管理。你只需提供业务输入，无需理解模型和检索参数。</p></section>{error ? <Notice tone="error" title="无法读取应用">{error}</Notice> : null}<div className="portal-app-grid">{apps.map((app) => <Link className="portal-app-card" to={`/portal/apps/${app.id}`} key={app.id}><div className="portal-app-icon"><Bot size={23} /></div><Badge tone="success">已发布 v{app.published_version?.version}</Badge><h2>{app.name}</h2><p>{app.description || '由业务空间发布的 AI 应用'}</p><footer><span>{app.scenario_type === 'content' ? '内容生成' : app.scenario_type === 'report' ? '报告生成' : app.scenario_type === 'customer_service' ? '智能客服' : app.scenario_type === 'review' ? '内容审校' : '知识问答'}</span><ArrowRight size={18} /></footer></Link>)}</div>{!apps.length && !error ? <div className="card empty-state"><Bot size={28} /><h2>暂无已发布应用</h2><p>请先在 FDE 设计室完成应用评测与发布。</p></div> : null}</main>;
}

function PortalRunner({ id, shareToken }: { id?: string; shareToken?: string }) {
  const [app, setApp] = useState<FDEApp | null>(null);
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<1 | -1 | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const request = shareToken ? fdeApi.publicShare(shareToken) : id ? fdeApi.get(id) : Promise.reject(new Error('缺少应用标识'));
    request.then((loaded) => {
      if (loaded.status !== 'published' || !loaded.published_version) throw new Error('应用尚未发布，业务端不可运行草稿');
      setApp(loaded);
      setInputs(Object.fromEntries(loaded.manifest.input_fields.map((field) => [field.key, field.default ?? (field.type === 'boolean' ? false : '')])));
    }).catch((caught) => setError(errorMessage(caught)));
  }, [id, shareToken]);

  const run = async (event?: FormEvent, confirmedToolNames: string[] = []) => {
    event?.preventDefault();
    setBusy(true);
    setError('');
    setFeedback(null);
    try {
      const payload = { input_values: inputs, conversation_id: result?.conversation_id, confirmed_tool_names: confirmedToolNames };
      setResult(shareToken ? await fdeApi.runShare(shareToken, payload) : await fdeApi.run(id!, payload));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const sendFeedback = async (rating: 1 | -1) => {
    if (!result) return;
    try {
      await fdeApi.feedback(result.message_id, rating);
      setFeedback(rating);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const exportResult = () => {
    if (!result || !app || !app.manifest.delivery.allow_export) return;
    const format = app.manifest.output.format === 'text' ? 'txt' : app.manifest.output.format === 'json' ? 'json' : 'md';
    const content = format === 'json' && result.output_json != null
      ? JSON.stringify(result.output_json, null, 2)
      : result.content;
    const blob = new Blob([content], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${app.name.replace(/[/\\:*?"<>|]/g, '_')}-${new Date().toISOString().slice(0, 10)}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!app) return <main className="portal-main">{error ? <Notice tone="error" title="无法打开应用">{error}</Notice> : <div className="portal-loading"><LoaderCircle className="spin" size={24} />正在加载应用…</div>}</main>;
  const pendingConfirmations = result?.agent_steps.filter((step) => step.status === 'confirmation_required').map((step) => step.tool) ?? [];
  return <main className="portal-runner"><Link className="back-link" to="/portal"><ArrowLeft size={16} />全部应用</Link><section className="portal-runner-heading"><div><Badge tone="info">{app.manifest.template_key === 'content' ? '内容生成' : app.manifest.template_key === 'report' ? '报告生成' : app.manifest.template_key === 'customer_service' ? '智能客服' : app.manifest.template_key === 'review' ? '内容审校' : '知识问答'}</Badge><h1>{app.name}</h1><p>{app.description}</p></div><Badge tone="success"><Check size={14} />已发布 v{app.published_version?.version ?? '—'}</Badge></section><div className="portal-runner-grid"><section className="card portal-input-panel"><header><Sparkles size={18} /><div><h2>告诉我你的需求</h2><p>填写业务信息，应用会按发布规则生成结果。</p></div></header><form className="form-stack" onSubmit={(event) => void run(event)}>{app.manifest.input_fields.map((field) => <label className="form-label" key={field.key}>{field.label}{field.required ? <span className="required-mark">*</span> : null}{field.type === 'textarea' ? <textarea className="field" required={field.required} placeholder={field.placeholder} value={String(inputs[field.key] ?? '')} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.value }))} /> : field.type === 'select' ? <select className="field" value={String(inputs[field.key] ?? '')} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.value }))}>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : field.type === 'boolean' ? <input type="checkbox" checked={Boolean(inputs[field.key])} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.checked }))} /> : <input className="field" type={field.type === 'number' ? 'number' : 'text'} required={field.required} min={field.minimum ?? undefined} max={field.maximum ?? undefined} placeholder={field.placeholder} value={String(inputs[field.key] ?? '')} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: field.type === 'number' ? Number(event.target.value) : event.target.value }))} />}{field.description ? <small>{field.description}</small> : null}</label>)}<Button variant="primary" type="submit" icon={busy ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />} disabled={busy}>{busy ? '正在生成…' : result ? '再次生成' : '开始生成'}</Button></form></section><section className="card portal-output-panel" aria-live="polite" aria-busy={busy}>{busy ? <div className="portal-loading"><LoaderCircle className="spin" size={25} /><h2>正在处理你的需求</h2><p>正在执行已发布的应用流程，请稍候。</p></div> : result ? <><header className="portal-result-header"><div><Badge tone={result.simulated ? 'warning' : 'success'}>{result.simulated ? '含测试替身' : '生成完成'}</Badge><span><Clock3 size={14} />{(result.duration_ms / 1000).toFixed(2)}s</span></div><div className="portal-result-actions">{app.manifest.delivery.allow_copy ? <Button variant="ghost" icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={() => { void navigator.clipboard.writeText(result.content); setCopied(true); }}>{copied ? '已复制' : '复制'}</Button> : null}{app.manifest.delivery.allow_export ? <Button variant="ghost" icon={<Download size={15} />} onClick={exportResult}>导出</Button> : null}</div></header><MarkdownText content={result.content} />{pendingConfirmations.length ? <Notice tone="warning" title="需要确认外部操作"><div className="portal-confirm-action"><span>Agent 请求执行可能产生外部副作用的工具：{pendingConfirmations.join('、')}</span><Button variant="primary" disabled={busy} onClick={() => void run(undefined, pendingConfirmations)}>确认并继续</Button></div></Notice> : null}{app.manifest.agent.show_tool_steps && result.agent_steps.length ? <div className="agent-step-list portal-agent-steps"><h3><Wrench size={15} />工具执行过程</h3>{result.agent_steps.map((step) => <details key={`${step.step}-${step.tool}`}><summary><Badge tone={step.status === 'success' ? 'success' : step.status === 'confirmation_required' ? 'warning' : 'error'}>{step.status}</Badge>{step.tool}</summary><pre>{JSON.stringify(step.arguments, null, 2)}</pre><p>{step.result}</p></details>)}</div> : null}{result.handoff ? <Notice tone="warning" title="已转接人工"><Headphones size={16} />当前请求需要人工继续处理，上下文已保留。</Notice> : null}{app.manifest.delivery.show_citations && result.citations.length ? <div className="portal-citations"><h3>引用来源</h3>{result.citations.map((citation) => <details key={citation.chunk_id}><summary><Clipboard size={14} />{citation.filename}{citation.page_number ? ` · 第 ${citation.page_number} 页` : ''}</summary><p>{citation.content}</p></details>)}</div> : null}<footer className="portal-feedback"><span>这次结果对你有帮助吗？</span><div><Button variant="ghost" icon={<ThumbsUp size={15} />} onClick={() => void sendFeedback(1)}>{feedback === 1 ? '已反馈' : '有帮助'}</Button><Button variant="ghost" icon={<ThumbsDown size={15} />} onClick={() => void sendFeedback(-1)}>{feedback === -1 ? '已反馈' : '需改进'}</Button></div></footer></> : <div className="portal-output-empty"><span><Bot size={27} /></span><h2>结果会显示在这里</h2><p>填写左侧业务信息并开始生成。结果操作取决于应用发布配置。</p></div>}</section></div>{error ? <Notice tone="error" title="运行失败">{error}</Notice> : null}</main>;
}
