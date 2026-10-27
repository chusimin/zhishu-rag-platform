import { Bot, Check, Copy, KeyRound, Plus, TerminalSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiFetch, errorMessage } from '../api/client';
import { fdeApi } from '../api/fde';
import { Badge, Button, Notice, PageHeader } from '../components/ui';

type ApiClient = { id: string; name: string; role: string; scopes: string[]; last_used_at: string | null };

export function AgentAccessPage() {
  const [capabilities, setCapabilities] = useState<Record<string, unknown> | null>(null);
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [name, setName] = useState('FDE App Designer');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = () => Promise.all([fdeApi.capabilities(), apiFetch<ApiClient[]>('/auth/api-clients')]).then(([caps, tokens]) => { setCapabilities(caps); setClients(tokens); }).catch((caught) => setError(errorMessage(caught)));
  useEffect(() => { void load(); }, []);

  const create = async () => {
    try {
      const response = await apiFetch<{ token: string }>('/auth/api-clients', { method: 'POST', body: JSON.stringify({ name, role: 'manager', scopes: ['apps:read', 'apps:write', 'apps:run'] }) });
      setToken(response.token);
      await load();
    } catch (caught) { setError(errorMessage(caught)); }
  };

  return <main className="page page-enter"><PageHeader eyebrow="AGENT CONTROL PLANE" title="AI Agent 接入" description="让 AI 通过与人相同的 FDE API 发现资源、设计应用、运行评测和发布版本。" actions={<Button variant="primary" icon={<Plus size={16} />} disabled={!name.trim()} onClick={create}>创建 Agent Token</Button>} />{error ? <Notice tone="error" title="操作失败">{error}</Notice> : null}<div className="agent-access-grid"><section className="card editor-section"><header><span>01</span><div><h2>能力发现</h2><p>Agent 首先读取协议、模板、端点和明确限制。</p></div></header><div className="agent-endpoint"><Badge tone="success">GET</Badge><code>/api/v1/fde/capabilities</code></div><pre className="manifest-view">{JSON.stringify(capabilities, null, 2) || '正在读取…'}</pre></section><section className="card editor-section"><header><span>02</span><div><h2>访问凭证</h2><p>Token 只属于当前业务空间，保存哈希而不是明文。</p></div></header><label className="form-label">Token 名称<input className="field" value={name} onChange={(event) => setName(event.target.value)} /></label>{token ? <Notice tone="success" title="Token 仅显示一次，请立即保存"><div className="token-value"><code>{token}</code><Button icon={copied ? <Check size={15} /> : <Copy size={15} />} onClick={() => { void navigator.clipboard.writeText(token); setCopied(true); }}>{copied ? '已复制' : '复制'}</Button></div></Notice> : null}<div className="input-schema-list">{clients.map((client) => <div key={client.id}><span><strong>{client.name}</strong><code>{client.role} · {client.scopes.join(', ')}</code></span><Badge tone="success">有效</Badge></div>)}</div>{!clients.length ? <div className="empty-state"><KeyRound size={24} /><h2>尚未创建 Agent Token</h2><p>创建一个专用凭证，不要复用个人登录会话。</p></div> : null}</section></div><section className="card editor-section agent-quickstart"><header><span>03</span><div><h2>最小调用示例</h2><p>AI 先生成 Manifest，再依次调用草稿、预览、评测和发布端点。</p></div></header><pre className="manifest-view">{`curl -X POST http://127.0.0.1:8001/api/v1/fde/design \\
  -H "Authorization: Bearer <FDE_TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"brief":"设计特色菜文案应用","template_key":"content"}'`}</pre><div className="guardrail-summary"><span><Bot size={14} />人机共用 Manifest</span><span><TerminalSquare size={14} />OpenAPI 可发现</span><span><KeyRound size={14} />工作区隔离</span></div></section></main>;
}
