import { CheckCircle2, FileJson, Plus, RefreshCw, Server, AlertTriangle, Workflow } from 'lucide-react';
import { useState } from 'react';
import { APPS, MODELS, TOOLS } from '../data/mock';
import { Dev, Field, Icon, Modal, Tag, useToast } from '../components/ui';

type Tab = 'models' | 'tools' | 'mcp' | 'flows';

export function ToolsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('tools');
  const [creating, setCreating] = useState(false);
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow"><h1>工具与模型</h1><p>统一管理应用可用的模型和工具。工具一次接入，所有 Chat Flow 与 Agent 都能复用。</p></div>
        {tab === 'models' ? <button className="btn primary"><Plus size={15} />接入模型</button> : <button className="btn primary" onClick={() => setCreating(true)}><Plus size={15} />新建工具</button>}
      </div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {([['tools', '工具库'], ['mcp', 'MCP 服务'], ['flows', '工作流插件'], ['models', '模型']] as const).map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'tools' ? (
        <div className="grid auto">
          {TOOLS.map((t) => (
            <div key={t.id} className="card pad hover">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <span className="avatar-tile" style={{ background: t.color }}><Icon name={t.icon} size={18} /></span>
                <div className="grow"><strong>{t.name}</strong><div className="row" style={{ marginTop: 4 }}><Tag>{t.kind}</Tag>{t.status === 'beta' ? <Tag tone="orange">Beta</Tag> : <Tag tone="green"><CheckCircle2 size={11} />可用</Tag>}<Dev s={t.kind === '系统' ? 'partial' : 'todo'} /></div></div>
              </div>
              <p className="muted" style={{ fontSize: 13, margin: '10px 0' }}>{t.desc}</p>
              <div className="row faint"><span>近 7 天调用 {t.calls.toLocaleString()} 次</span><span className="grow" /><span>被 {t.id === 't-order' ? 2 : 1} 个应用使用</span></div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'mcp' ? (
        <div className="col">
          {[{ name: '飞书开放平台 MCP', url: 'https://mcp.feishu.cn/sse', tools: 12, ok: true }, { name: 'ERP 只读查询', url: 'https://erp.example.com/mcp', tools: 6, ok: true }, { name: '内部 BI', url: 'https://bi.example.com/mcp', tools: 3, ok: false }].map((m) => (
            <div key={m.name} className="card pad row">
              <Server size={20} color="var(--primary)" />
              <div className="grow"><strong>{m.name}</strong><div className="faint mono">{m.url}</div></div>
              <Tag>{m.tools} 个工具</Tag>
              {m.ok ? <Tag tone="green">已连接</Tag> : <Tag tone="red"><AlertTriangle size={11} />连接超时</Tag>}
              <button className="btn sm" onClick={() => toast('已重新发现工具')}><RefreshCw size={13} />刷新</button>
            </div>
          ))}
          <Dev s="todo" note="MCP 客户端" />
        </div>
      ) : null}

      {tab === 'flows' ? (
        <div className="col">
          <p className="muted">已发布的 Chat Flow 可以封装成插件，供 Agent 或其他流程当作工具调用。</p>
          {APPS.filter((a) => a.type === 'chatflow').map((a) => (
            <div key={a.id} className="card pad row">
              <Workflow size={20} color="var(--primary)" />
              <div className="grow"><strong>{a.name}</strong><div className="faint">{a.desc}</div></div>
              <Tag tone={a.status === 'published' ? 'green' : ''}>{a.status === 'published' ? '可作为插件' : '发布后可用'}</Tag>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'models' ? (
        <table className="table">
          <thead><tr><th>模型</th><th>服务商</th><th>类型</th><th>上下文</th><th>能力</th><th>状态</th><th /></tr></thead>
          <tbody>{MODELS.map((m) => (
            <tr key={m.name}>
              <td><strong>{m.name}</strong></td><td>{m.provider}</td><td><Tag tone="blue">{m.type}</Tag></td><td>{m.ctx}</td>
              <td><div className="row wrap" style={{ gap: 4 }}>{m.tags.map((t) => <Tag key={t}>{t}</Tag>)}</div></td>
              <td>{m.status === 'ok' ? <Tag tone="green">已连通</Tag> : <Tag tone="orange">未验证</Tag>}</td>
              <td><button className="btn sm ghost" onClick={() => toast(`${m.name} 连接正常 · 312ms`)}>测试</button></td>
            </tr>
          ))}</tbody>
        </table>
      ) : null}

      <Modal open={creating} title="新建 HTTP 工具" onClose={() => setCreating(false)} wide
        footer={<><button className="btn" onClick={() => setCreating(false)}>取消</button><button className="btn">调试请求</button><button className="btn primary" onClick={() => { setCreating(false); toast('工具已创建'); }}>保存</button></>}>
        <div className="row" style={{ marginBottom: 14 }}><button className="btn sm"><FileJson size={14} />从 OpenAPI 导入</button><span className="faint">粘贴 Swagger / OpenAPI 文档，自动生成多个工具</span></div>
        <div className="form-grid">
          <Field label="工具名称" required><input className="input" defaultValue="查询库存" /></Field>
          <Field label="鉴权"><select className="select"><option>Bearer Token（从密钥库读取）</option><option>无</option><option>API Key Header</option></select></Field>
        </div>
        <Field label="工具描述" required hint="写给模型看：什么时候该调用"><textarea className="textarea" style={{ minHeight: 60 }} defaultValue="按产品型号查询各仓库实时库存。用户询问「有没有货」「多久能发」时调用。" /></Field>
        <Field label="请求"><div className="row"><select className="select" style={{ width: 100 }}><option>GET</option><option>POST</option></select><input className="input mono" defaultValue="https://erp.example.com/api/stock?sku={{sku}}" /></div></Field>
        <Field label="参数" hint="模型会按此 Schema 生成参数">
          <table className="table" style={{ fontSize: 13 }}><thead><tr><th>参数</th><th>类型</th><th>必填</th><th>说明</th></tr></thead><tbody>
            <tr><td className="mono">sku</td><td>string</td><td>是</td><td>产品型号，如 ES-200</td></tr>
            <tr><td className="mono">warehouse</td><td>string</td><td>否</td><td>仓库编码，不填则查全部</td></tr>
          </tbody></table>
        </Field>
      </Modal>
    </div>
  );
}
