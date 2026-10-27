import { ArrowLeft, ArrowRight, Bot, Check, Clipboard, Clock3, Copy, Headphones, LoaderCircle, Send, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch, errorMessage, type ApiQAApp } from '../api/client';
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

function PortalDirectory() {
  const [apps, setApps] = useState<ApiQAApp[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { apiFetch<ApiQAApp[]>('/apps').then(setApps).catch((caught) => setError(errorMessage(caught))); }, []);
  return <main className="portal-main"><section className="portal-intro"><Badge tone="info">业务应用目录</Badge><h1>选择应用，开始工作</h1><p>每个应用都经过配置验证与发布管理。你只需提供业务输入，无需理解模型和检索参数。</p></section>{error ? <Notice tone="error" title="无法读取应用">{error}</Notice> : null}<div className="portal-app-grid">{apps.map((app) => <Link className="portal-app-card" to={`/portal/apps/${app.id}`} key={app.id}><div className="portal-app-icon"><Bot size={23} /></div><Badge tone={app.is_enabled ? 'success' : 'warning'}>{app.is_enabled ? '已发布' : '预览'}</Badge><h2>{app.name}</h2><p>{app.description || '由业务空间发布的 AI 应用'}</p><footer><span>{app.scenario_type === 'content' ? '内容生成' : app.scenario_type === 'report' ? '报告生成' : app.scenario_type === 'customer_service' ? '智能客服' : app.scenario_type === 'review' ? '内容审校' : '知识问答'}</span><ArrowRight size={18} /></footer></Link>)}</div>{!apps.length && !error ? <div className="card empty-state"><Bot size={28} /><h2>暂无已发布应用</h2><p>请先在 FDE 设计室完成应用评测与发布。</p></div> : null}</main>;
}

function PortalRunner({ id }: { id: string }) {
  const [app, setApp] = useState<FDEApp | null>(null);
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<1 | -1 | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fdeApi.get(id).then((loaded) => {
      setApp(loaded);
      setInputs(Object.fromEntries(loaded.manifest.input_fields.map((field) => [field.key, field.default ?? (field.type === 'boolean' ? false : '')])));
    }).catch((caught) => setError(errorMessage(caught)));
  }, [id]);

  const run = async (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setError('');
    setFeedback(null);
    try {
      setResult(await fdeApi.run(id, { input_values: inputs, conversation_id: result?.conversation_id }));
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

  if (!app) return <main className="portal-main">{error ? <Notice tone="error" title="无法打开应用">{error}</Notice> : <div className="portal-loading"><LoaderCircle className="spin" size={24} />正在加载应用…</div>}</main>;
  return <main className="portal-runner"><Link className="back-link" to="/portal"><ArrowLeft size={16} />全部应用</Link><section className="portal-runner-heading"><div><Badge tone="info">{app.manifest.template_key === 'content' ? '内容生成' : app.manifest.template_key === 'report' ? '报告生成' : app.manifest.template_key === 'customer_service' ? '智能客服' : app.manifest.template_key === 'review' ? '内容审校' : '知识问答'}</Badge><h1>{app.name}</h1><p>{app.description}</p></div><Badge tone="success"><Check size={14} />已发布 v{app.published_version?.version ?? '—'}</Badge></section><div className="portal-runner-grid"><section className="card portal-input-panel"><header><Sparkles size={18} /><div><h2>告诉我你的需求</h2><p>填写业务信息，应用会按发布规则生成结果。</p></div></header><form className="form-stack" onSubmit={(event) => void run(event)}>{app.manifest.input_fields.map((field) => <label className="form-label" key={field.key}>{field.label}{field.required ? <span className="required-mark">*</span> : null}{field.type === 'textarea' ? <textarea className="field" required={field.required} placeholder={field.placeholder} value={String(inputs[field.key] ?? '')} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.value }))} /> : field.type === 'select' ? <select className="field" value={String(inputs[field.key] ?? '')} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.value }))}>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : field.type === 'boolean' ? <input type="checkbox" checked={Boolean(inputs[field.key])} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.checked }))} /> : <input className="field" type={field.type === 'number' ? 'number' : 'text'} required={field.required} min={field.minimum ?? undefined} max={field.maximum ?? undefined} placeholder={field.placeholder} value={String(inputs[field.key] ?? '')} onChange={(event) => setInputs((current) => ({ ...current, [field.key]: field.type === 'number' ? Number(event.target.value) : event.target.value }))} />}{field.description ? <small>{field.description}</small> : null}</label>)}<Button variant="primary" type="submit" icon={busy ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />} disabled={busy}>{busy ? '正在生成…' : result ? '再次生成' : '开始生成'}</Button></form></section><section className="card portal-output-panel" aria-live="polite" aria-busy={busy}>{busy ? <div className="portal-loading"><LoaderCircle className="spin" size={25} /><h2>正在处理你的需求</h2><p>正在执行已发布的应用流程，请稍候。</p></div> : result ? <><header className="portal-result-header"><div><Badge tone={result.simulated ? 'warning' : 'success'}>{result.simulated ? '含测试替身' : '生成完成'}</Badge><span><Clock3 size={14} />{(result.duration_ms / 1000).toFixed(2)}s</span></div><Button variant="ghost" icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={() => { void navigator.clipboard.writeText(result.content); setCopied(true); }}>{copied ? '已复制' : '复制'}</Button></header><MarkdownText content={result.content} />{result.handoff ? <Notice tone="warning" title="已转接人工"><Headphones size={16} />当前请求需要人工继续处理，上下文已保留。</Notice> : null}{result.citations.length ? <div className="portal-citations"><h3>引用来源</h3>{result.citations.map((citation) => <details key={citation.chunk_id}><summary><Clipboard size={14} />{citation.filename}{citation.page_number ? ` · 第 ${citation.page_number} 页` : ''}</summary><p>{citation.content}</p></details>)}</div> : null}<footer className="portal-feedback"><span>这次结果对你有帮助吗？</span><div><Button variant="ghost" icon={<ThumbsUp size={15} />} onClick={() => void sendFeedback(1)}>{feedback === 1 ? '已反馈' : '有帮助'}</Button><Button variant="ghost" icon={<ThumbsDown size={15} />} onClick={() => void sendFeedback(-1)}>{feedback === -1 ? '已反馈' : '需改进'}</Button></div></footer></> : <div className="portal-output-empty"><span><Bot size={27} /></span><h2>结果会显示在这里</h2><p>填写左侧业务信息并开始生成。你可以复制结果、查看引用和提交反馈。</p></div>}</section></div>{error ? <Notice tone="error" title="运行失败">{error}</Notice> : null}</main>;
}
