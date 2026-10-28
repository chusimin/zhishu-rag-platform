import { AlertTriangle, CheckCircle2, FileJson, LoaderCircle, Pencil, Plus, RefreshCw, Server, Trash2, Upload, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch, errorMessage, type ApiToolConfig } from '../api/client';
import { Badge, Button, Drawer, Modal, Notice, PageHeader } from '../components/ui';
import { useToast } from '../components/Toast';

type Tab = 'tools' | 'mcp' | 'flows' | 'models';
type Draft = {
  name: string;
  description: string;
  method: string;
  url: string;
  authType: 'none' | 'bearer' | 'api_key';
  authHeader: string;
  secret: string;
  allowPrivate: boolean;
  parameters: string;
  headers: string;
  query: string;
  body: string;
  responsePath: string;
};

const emptyDraft: Draft = {
  name: '', description: '', method: 'GET', url: '', authType: 'none', authHeader: 'X-API-Key', secret: '', allowPrivate: false,
  parameters: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}', headers: '{}', query: '{}', body: '', responsePath: '',
};

export function ToolsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'tools';
  const [tools, setTools] = useState<ApiToolConfig[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [selected, setSelected] = useState<ApiToolConfig | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [openApiSpec, setOpenApiSpec] = useState('');
  const [testTool, setTestTool] = useState<ApiToolConfig | null>(null);
  const [testArgs, setTestArgs] = useState('{}');
  const [testResult, setTestResult] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const { showToast } = useToast();

  const load = async () => {
    try { setTools(await apiFetch<ApiToolConfig[]>('/tools')); setError(''); }
    catch (caught) { setError(errorMessage(caught)); }
  };
  useEffect(() => { void load(); }, []);

  const openNew = () => { setSelected(null); setDraft(emptyDraft); setEditorOpen(true); };
  const openEdit = (tool: ApiToolConfig) => {
    setSelected(tool);
    setDraft({
      name: tool.name, description: tool.description, method: tool.config.method ?? 'GET', url: tool.config.url ?? '',
      authType: tool.config.auth_type ?? 'none', authHeader: tool.config.auth_header ?? 'X-API-Key', secret: '',
      allowPrivate: Boolean(tool.config.allow_private_network),
      parameters: JSON.stringify(tool.config.parameters ?? { type: 'object', properties: {}, required: [] }, null, 2),
      headers: JSON.stringify(tool.config.headers ?? {}, null, 2), query: JSON.stringify(tool.config.query ?? {}, null, 2),
      body: tool.config.body == null ? '' : JSON.stringify(tool.config.body, null, 2), responsePath: tool.config.response_path ?? '',
    });
    setEditorOpen(true);
  };
  const save = async () => {
    setBusy('save');
    try {
      const parameters = JSON.parse(draft.parameters || '{}');
      const headers = JSON.parse(draft.headers || '{}');
      const query = JSON.parse(draft.query || '{}');
      const body = draft.body.trim() ? JSON.parse(draft.body) : undefined;
      const payload = {
        name: draft.name, kind: 'http', description: draft.description, secret: draft.secret || undefined,
        config: { method: draft.method, url: draft.url, parameters, headers, query, body, auth_type: draft.authType, auth_header: draft.authHeader, allow_private_network: draft.allowPrivate, response_path: draft.responsePath, timeout_seconds: 15 },
      };
      if (selected) await apiFetch(`/tools/${selected.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await apiFetch('/tools', { method: 'POST', body: JSON.stringify(payload) });
      setEditorOpen(false); showToast(selected ? '工具配置已更新' : 'HTTP 工具已创建'); await load();
    } catch (caught) { showToast(caught instanceof SyntaxError ? '参数或请求体不是有效 JSON' : errorMessage(caught), 'error'); }
    finally { setBusy(''); }
  };
  const remove = async (tool: ApiToolConfig) => {
    if (!window.confirm(`确定删除工具「${tool.name}」？`)) return;
    await apiFetch(`/tools/${tool.id}`, { method: 'DELETE' });
    showToast('工具已删除'); await load();
  };
  const test = async () => {
    if (!testTool) return;
    setBusy('test'); setTestResult('');
    try {
      const result = await apiFetch<{ content: string }>(`/tools/${testTool.id}/test`, { method: 'POST', body: JSON.stringify({ arguments: JSON.parse(testArgs || '{}') }) });
      setTestResult(result.content); showToast('工具调用成功'); await load();
    } catch (caught) { setTestResult(errorMessage(caught)); }
    finally { setBusy(''); }
  };
  const counts = useMemo(() => ({ connected: tools.filter((tool) => tool.connection_status === 'connected').length, total: tools.length }), [tools]);

  const importOpenApi = async () => {
    setBusy('import');
    try {
      const document = JSON.parse(openApiSpec) as { servers?: Array<{ url?: string }>; paths?: Record<string, Record<string, unknown>> };
      const baseUrl = document.servers?.[0]?.url?.replace(/\/$/, '');
      if (!baseUrl || !document.paths) throw new Error('OpenAPI 必须包含 servers[0].url 和 paths');
      const methodNames = new Set(['get', 'post', 'put', 'patch', 'delete']);
      let imported = 0;
      for (const [path, pathItem] of Object.entries(document.paths)) {
        const shared = Array.isArray(pathItem.parameters) ? pathItem.parameters as Array<Record<string, unknown>> : [];
        for (const [method, rawOperation] of Object.entries(pathItem)) {
          if (!methodNames.has(method) || !rawOperation || typeof rawOperation !== 'object') continue;
          const operation = rawOperation as Record<string, unknown>;
          const parameters = [...shared, ...(Array.isArray(operation.parameters) ? operation.parameters as Array<Record<string, unknown>> : [])];
          const properties: Record<string, unknown> = {};
          const required: string[] = [];
          const query: Record<string, string> = {};
          const headers: Record<string, string> = {};
          for (const parameter of parameters) {
            const name = String(parameter.name ?? '');
            if (!name || parameter.$ref) continue;
            properties[name] = parameter.schema ?? { type: 'string' };
            if (parameter.required) required.push(name);
            if (parameter.in === 'query') query[name] = `{{${name}}}`;
            if (parameter.in === 'header') headers[name] = `{{${name}}}`;
          }
          const requestBody = operation.requestBody as { content?: Record<string, { schema?: { properties?: Record<string, unknown>; required?: string[] } }> } | undefined;
          const bodySchema = requestBody?.content?.['application/json']?.schema;
          const bodyProperties = bodySchema?.properties ?? {};
          Object.assign(properties, bodyProperties);
          for (const name of bodySchema?.required ?? []) if (!required.includes(name)) required.push(name);
          const body = Object.keys(bodyProperties).length ? Object.fromEntries(Object.keys(bodyProperties).map((name) => [name, `{{${name}}}`])) : undefined;
          const url = `${baseUrl}${path.replace(/\{([^}]+)\}/g, '{{$1}}')}`;
          await apiFetch('/tools', { method: 'POST', body: JSON.stringify({
            name: String(operation.operationId ?? operation.summary ?? `${method.toUpperCase()} ${path}`).slice(0, 120),
            kind: 'http', description: String(operation.description ?? operation.summary ?? ''),
            config: { method: method.toUpperCase(), url, parameters: { type: 'object', properties, required }, headers, query, body, auth_type: 'none', timeout_seconds: 15 },
          }) });
          imported += 1;
        }
      }
      if (!imported) throw new Error('OpenAPI 中没有可导入的 GET/POST/PUT/PATCH/DELETE 操作');
      setImportOpen(false); setOpenApiSpec(''); showToast(`已导入 ${imported} 个 HTTP 工具，请逐个配置鉴权并调试`); await load();
    } catch (caught) { showToast(caught instanceof SyntaxError ? 'OpenAPI 不是有效 JSON' : errorMessage(caught), 'error'); }
    finally { setBusy(''); }
  };

  return <main className="page page-enter tools-page">
    <PageHeader eyebrow="TOOLS & MODELS" title="工具与模型" description="统一管理应用与 Agent 可调用的 HTTP 工具、MCP 服务、工作流插件和模型。" actions={tab === 'tools' ? <><Button icon={<Upload size={16} />} onClick={() => setImportOpen(true)}>导入 OpenAPI</Button><Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>新建 HTTP 工具</Button></> : undefined} />
    <div className="tabs" role="tablist" aria-label="工具与模型分类">{([['tools', '工具库'], ['mcp', 'MCP 服务'], ['flows', '工作流插件'], ['models', '模型']] as const).map(([value, label]) => <button type="button" role="tab" aria-selected={tab === value} className={`tab ${tab === value ? 'active' : ''}`} key={value} onClick={() => setParams(value === 'tools' ? {} : { tab: value })}>{label}</button>)}</div>
    {error ? <Notice tone="error" title="无法读取工具">{error}</Notice> : null}
    {tab === 'tools' ? <>
      <div className="guardrail-summary"><span><Wrench size={14} />{counts.total} 个工具</span><span><CheckCircle2 size={14} />{counts.connected} 个已验证</span><span>密钥加密存储且不会回传前端</span></div>
      <div className="tool-card-grid">{tools.map((tool) => <article className="card tool-card" key={tool.id}><header><span className="tool-icon"><Wrench size={19} /></span><div><h2>{tool.name}</h2><Badge>{tool.kind.toUpperCase()}</Badge></div><Badge tone={tool.connection_status === 'connected' ? 'success' : tool.connection_status === 'error' ? 'error' : 'warning'}>{tool.connection_status === 'connected' ? '已连通' : tool.connection_status === 'error' ? '连接异常' : '未验证'}</Badge></header><p>{tool.description || '未填写工具说明。'}</p><code>{tool.config.method} {tool.config.url}</code>{tool.last_error ? <small className="tool-error"><AlertTriangle size={13} />{tool.last_error}</small> : null}<footer><Button variant="ghost" icon={<RefreshCw size={14} />} onClick={() => { setTestTool(tool); setTestArgs('{}'); setTestResult(''); }}>调试</Button><Button variant="ghost" icon={<Pencil size={14} />} onClick={() => openEdit(tool)}>编辑</Button><Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => void remove(tool)}>删除</Button></footer></article>)}</div>
      {!tools.length ? <section className="card empty-state"><Wrench size={26} /><h2>还没有工具</h2><p>创建 HTTP 工具后，可先调试连接，再授权给 Agent。</p><Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>新建工具</Button></section> : null}
    </> : null}
    {tab === 'mcp' ? <section className="card empty-state"><Server size={27} /><h2>MCP 连接器将在下一批接入</h2><p>HTTP 工具与加密凭据底座已经可用；MCP 不会用模拟连接冒充完成。</p></section> : null}
    {tab === 'flows' ? <section className="card empty-state"><FileJson size={27} /><h2>工作流插件暂不启用</h2><p>你已明确本阶段不实现 Chat Flow，因此这里不提供虚假的插件入口。</p></section> : null}
    {tab === 'models' ? <section className="card model-entry"><h2>模型服务</h2><p>管理 LLM、Embedding、Rerank 与 OCR 模型，连接测试和密钥加密能力保持不变。</p><Link className="button button--primary" to="/models">进入模型管理</Link></section> : null}

    <Drawer open={editorOpen} title={selected ? `编辑工具：${selected.name}` : '新建 HTTP 工具'} description="参数中的 {{变量}} 会在调用时替换；密钥只保存加密值。" onClose={() => setEditorOpen(false)} footer={<><Button onClick={() => setEditorOpen(false)}>取消</Button><Button variant="primary" disabled={!draft.name.trim() || !draft.url.trim() || busy === 'save'} onClick={() => void save()}>{busy === 'save' ? '保存中…' : '保存工具'}</Button></>}>
      <div className="form-stack"><label className="form-label">工具名称<input className="field" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="form-label">给模型看的说明<textarea className="field" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><div className="inline-fields"><label className="form-label">方法<select className="field" value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value })}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => <option key={method}>{method}</option>)}</select></label><label className="form-label">请求 URL<input className="field" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://erp.example.com/api/stock/{{sku}}" /></label></div><div className="inline-fields"><label className="form-label">鉴权<select className="field" value={draft.authType} onChange={(event) => setDraft({ ...draft, authType: event.target.value as Draft['authType'] })}><option value="none">无</option><option value="bearer">Bearer Token</option><option value="api_key">API Key Header</option></select></label>{draft.authType === 'api_key' ? <label className="form-label">Header 名<input className="field" value={draft.authHeader} onChange={(event) => setDraft({ ...draft, authHeader: event.target.value })} /></label> : null}{draft.authType !== 'none' ? <label className="form-label">{selected?.has_secret ? '替换密钥（留空保持原值）' : '密钥'}<input className="field" type="password" value={draft.secret} onChange={(event) => setDraft({ ...draft, secret: event.target.value })} /></label> : null}</div><label className="check-card"><input type="checkbox" checked={draft.allowPrivate} onChange={(event) => setDraft({ ...draft, allowPrivate: event.target.checked })} /><span><strong>允许访问企业内网地址</strong><small>默认阻止环回、内网和保留地址，降低 SSRF 风险。</small></span></label><label className="form-label">参数 JSON Schema<textarea className="field code-textarea" value={draft.parameters} onChange={(event) => setDraft({ ...draft, parameters: event.target.value })} /></label><div className="inline-fields"><label className="form-label">请求 Headers 模板<textarea className="field code-textarea" value={draft.headers} onChange={(event) => setDraft({ ...draft, headers: event.target.value })} /></label><label className="form-label">Query 参数模板<textarea className="field code-textarea" value={draft.query} onChange={(event) => setDraft({ ...draft, query: event.target.value })} /></label></div><label className="form-label">JSON 请求体（可选）<textarea className="field code-textarea" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} /></label><label className="form-label">响应提取路径<input className="field" value={draft.responsePath} onChange={(event) => setDraft({ ...draft, responsePath: event.target.value })} placeholder="data.items" /></label></div>
    </Drawer>
    <Modal open={Boolean(testTool)} title={`调试工具：${testTool?.name ?? ''}`} description="本次会发起真实请求，结果不会自动保存到应用。" onClose={() => setTestTool(null)} footer={<><Button onClick={() => setTestTool(null)}>关闭</Button><Button variant="primary" icon={busy === 'test' ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} disabled={busy === 'test'} onClick={() => void test()}>{busy === 'test' ? '调用中…' : '发送请求'}</Button></>}><label className="form-label">参数 JSON<textarea className="field code-textarea" value={testArgs} onChange={(event) => setTestArgs(event.target.value)} /></label>{testResult ? <pre className="manifest-view">{testResult}</pre> : null}</Modal>
    <Modal open={importOpen} title="导入 OpenAPI JSON" description="把每个 HTTP operation 转为独立工具；鉴权密钥不会从规范中导入，需要逐个配置和调试。" onClose={() => setImportOpen(false)} footer={<><Button onClick={() => setImportOpen(false)}>取消</Button><Button variant="primary" disabled={!openApiSpec.trim() || busy === 'import'} onClick={() => void importOpenApi()}>{busy === 'import' ? '导入中…' : '导入工具'}</Button></>}><label className="form-label">OpenAPI 3.x JSON<textarea className="field openapi-textarea" value={openApiSpec} onChange={(event) => setOpenApiSpec(event.target.value)} placeholder={'{"openapi":"3.0.0","servers":[{"url":"https://api.example.com"}],"paths":{...}}'} /></label><Notice tone="warning" title="导入后必须验证">规范无法证明目标地址、鉴权和响应格式真实可用；导入项默认处于“未验证”。</Notice></Modal>
  </main>;
}
