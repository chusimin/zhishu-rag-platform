import { CheckCircle2, Code2, Copy, ExternalLink, Globe, KeyRound, Link2, MessageCircle, Play, Plus, RotateCcw, Search, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react';
import { useState } from 'react';
import { LOGS, type AppItem } from '../data/mock';
import { Dev, Drawer, Switch, Tag, useToast } from '../components/ui';
import { StepsView } from '../components/ChatPanel';

/* ------------------------------ 发布渠道 ------------------------------ */

const CHANNELS = [
  { key: 'workbench', name: '企业工作台', desc: '员工在工作台直接使用，按部门授权', icon: Globe, on: true, dev: 'ready' as const },
  { key: 'link', name: '免登录链接', desc: '生成分享链接，可设置有效期与访问次数', icon: Link2, on: true, dev: 'todo' as const },
  { key: 'embed', name: '网页嵌入', desc: '以气泡或 iframe 嵌入官网、帮助中心', icon: Code2, on: true, dev: 'todo' as const },
  { key: 'api', name: 'API 调用', desc: 'OpenAI 兼容接口，供业务系统集成', icon: KeyRound, on: true, dev: 'partial' as const },
  { key: 'wecom', name: '企业微信', desc: '作为客服号或群机器人接入', icon: MessageCircle, on: true, dev: 'todo' as const },
  { key: 'feishu', name: '飞书机器人', desc: '在飞书单聊或群聊中 @ 使用', icon: MessageCircle, on: false, dev: 'todo' as const },
  { key: 'dingtalk', name: '钉钉', desc: '钉钉企业内部机器人', icon: MessageCircle, on: false, dev: 'todo' as const },
  { key: 'mp', name: '微信公众号', desc: '公众号消息自动回复', icon: MessageCircle, on: false, dev: 'todo' as const },
];

export function PublishView({ app }: { app: AppItem }) {
  const toast = useToast();
  const [state, setState] = useState(() => Object.fromEntries(CHANNELS.map((c) => [c.key, c.on])));
  const [sel, setSel] = useState('embed');
  return (
    <div className="page" style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ width: 460, flex: 'none' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>发布渠道</h1>
        <p className="muted" style={{ margin: '4px 0 16px' }}>所有渠道运行同一个线上版本 {app.version ?? ''}，草稿修改不影响线上。</p>
        <div className="col">
          {CHANNELS.map((c) => (
            <div key={c.key} className={`method-card ${sel === c.key ? 'active' : ''}`} onClick={() => setSel(c.key)}>
              <c.icon size={20} color="var(--primary)" />
              <div className="grow"><h4>{c.name}<Dev s={c.dev} /></h4><p>{c.desc}</p></div>
              <span onClick={(e) => e.stopPropagation()}><Switch on={state[c.key]} onChange={(v) => { setState({ ...state, [c.key]: v }); toast(`${c.name}已${v ? '启用' : '停用'}`); }} label={c.name} /></span>
            </div>
          ))}
        </div>
      </div>
      <div className="grow card pad">
        {sel === 'embed' ? <>
          <div className="row"><strong className="grow">网页嵌入</strong><button className="btn sm" onClick={() => toast('已复制')}><Copy size={13} />复制代码</button></div>
          <p className="faint" style={{ margin: '4px 0 12px' }}>把以下代码放到页面 &lt;/body&gt; 前，右下角出现客服气泡。</p>
          <div className="code-block">{`<script
  src="https://ai.example.com/embed.js"
  data-app="${app.id}"
  data-theme="#12b76a"
  data-position="right-bottom"
  data-welcome="${app.opening ?? '你好'}"
  defer></script>`}</div>
          <div className="section-title">外观</div>
          <div className="row wrap" style={{ gap: 16 }}>
            <label className="row">主题色 <input type="color" defaultValue="#12b76a" /></label>
            <label className="row">显示引用来源 <Switch on onChange={() => undefined} label="引用来源" /></label>
            <label className="row">允许上传图片 <Switch on={false} onChange={() => undefined} label="上传" /></label>
          </div>
          <div className="section-title">访问控制</div>
          <div className="row wrap"><Tag>每 IP 每分钟 20 次</Tag><Tag>白名单域名：www.example.com、help.example.com</Tag><button className="btn sm"><Plus size={13} />添加</button></div>
        </> : null}
        {sel === 'api' ? <>
          <strong>API 调用</strong>
          <p className="faint" style={{ margin: '4px 0 12px' }}>OpenAI Chat Completions 兼容，可直接替换 base_url 使用。</p>
          <div className="code-block">{`curl https://ai.example.com/api/v1/chat/completions \\
  -H "Authorization: Bearer zs-app-••••••••3f2a" \\
  -d '{
    "app_id": "${app.id}",
    "chat_id": "可选，传入后保留多轮上下文",
    "stream": true,
    "variables": { "customer_level": "VIP" },
    "messages": [{ "role": "user", "content": "储能柜报 E07 怎么办" }]
  }'`}</div>
          <div className="section-title">API 密钥</div>
          <table className="table"><thead><tr><th>名称</th><th>密钥</th><th>额度</th><th>最近使用</th></tr></thead><tbody>
            <tr><td>官网客服后端</td><td className="mono">zs-app-••••3f2a</td><td>不限</td><td className="faint">2 分钟前</td></tr>
            <tr><td>CRM 集成</td><td className="mono">zs-app-••••9b10</td><td>10 万 tokens/天</td><td className="faint">昨天</td></tr>
          </tbody></table>
        </> : null}
        {!['embed', 'api'].includes(sel) ? <>
          <strong>{CHANNELS.find((c) => c.key === sel)?.name}</strong>
          <p className="faint" style={{ margin: '4px 0 16px' }}>{CHANNELS.find((c) => c.key === sel)?.desc}</p>
          {sel === 'link' ? <div className="row"><input className="input" readOnly value={`https://ai.example.com/s/${app.id}?t=8d2f`} /><button className="btn" onClick={() => toast('已复制链接')}><Copy size={14} />复制</button><button className="btn"><ExternalLink size={14} />打开</button></div> : (
            <div className="col" style={{ gap: 12 }}>
              <div className="form-grid"><div><div className="field-label">Corp ID</div><input className="input" placeholder="企业 ID" /></div><div><div className="field-label">Secret</div><input className="input" type="password" placeholder="应用 Secret" /></div></div>
              <div><div className="field-label">回调地址（复制到对应平台后台）</div><input className="input mono" readOnly value={`https://ai.example.com/api/v1/channels/${sel}/${app.id}/callback`} /></div>
            </div>
          )}
        </> : null}
      </div>
    </div>
  );
}

/* ------------------------------ 对话日志 ------------------------------ */

export function LogsView({ app }: { app: AppItem }) {
  const logs = LOGS.filter((l) => l.app === app.id);
  const rows = logs.length ? logs : LOGS.slice(0, 3);
  const [open, setOpen] = useState<(typeof LOGS)[number] | null>(null);
  return (
    <div className="page">
      <div className="page-head"><div className="grow"><h1 style={{ fontSize: 18 }}>对话日志</h1><p>查看真实用户对话、反馈与每一步的执行明细。差评对话可一键加入评测集。</p></div></div>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="seg"><button className="active">全部</button><button>点踩</button><button>转人工</button><button>未命中知识</button></div>
        <select className="select sm" style={{ width: 130 }}><option>全部渠道</option><option>官网嵌入</option><option>企业微信</option><option>工作台</option></select>
        <select className="select sm" style={{ width: 130 }}><option>最近 7 天</option><option>今天</option></select>
        <span className="grow" />
        <div className="search-box" style={{ width: 220 }}><Search size={15} /><input className="input sm" placeholder="搜索问题" /></div>
      </div>
      <table className="table">
        <thead><tr><th>首个问题</th><th>用户</th><th>渠道</th><th>轮次</th><th>Tokens</th><th>结果</th><th>反馈</th><th>时间</th></tr></thead>
        <tbody>{rows.map((l) => (
          <tr key={l.id} className="clickable" onClick={() => setOpen(l)}>
            <td style={{ maxWidth: 320 }} className="ellipsis">{l.question}</td><td>{l.user}</td><td><Tag>{l.channel}</Tag></td><td>{l.turns}</td><td className="faint">{l.tokens.toLocaleString()}</td>
            <td>{l.status === 'ok' ? <Tag tone="green">已解决</Tag> : l.status === 'handoff' ? <Tag tone="orange">转人工</Tag> : <Tag tone="red">未命中</Tag>}</td>
            <td>{l.feedback === 'good' ? <ThumbsUp size={15} color="#12b76a" /> : l.feedback === 'bad' ? <ThumbsDown size={15} color="#f04438" /> : <span className="faint">—</span>}</td>
            <td className="faint">{l.time}</td>
          </tr>
        ))}</tbody>
      </table>
      <Drawer open={!!open} title="对话详情" onClose={() => setOpen(null)} footer={<><button className="btn">加入评测集</button><button className="btn">标注正确答案</button></>}>
        {open ? <div className="col" style={{ gap: 14 }}>
          <div className="kv"><dt>用户</dt><dd>{open.user}</dd><dt>渠道</dt><dd>{open.channel}</dd><dt>版本</dt><dd>{app.version ?? 'v1'}</dd><dt>Trace</dt><dd className="mono">tr_8f2a1c…</dd></div>
          <div className="msg user"><div className="bubble">{open.question}</div></div>
          <StepsView defaultOpen steps={[
            { kind: 'think', name: '规划', detail: '识别意图：故障咨询', ms: 380 },
            { kind: 'kb', name: '知识库搜索', detail: '混合检索 6 条 → Rerank 2 条（0.94 / 0.41）', ms: 520 },
            { kind: 'node', name: 'AI 回复', detail: 'DeepSeek-V3.2 · 输入 2,140 / 输出 312 tokens', ms: 1840 },
          ]} />
          <div className="msg"><div className="bubble">E07 表示 BMS 通讯中断……</div></div>
        </div> : null}
      </Drawer>
    </div>
  );
}

/* ------------------------------ 评测 ------------------------------ */

const CASES = [
  { name: '故障代码 E07', input: '储能柜报 E07 是什么问题？', expect: '包含「BMS 通讯」；必须有引用', pass: true },
  { name: '退货运费', input: '我想退货，运费谁出？', expect: '区分无理由与质量问题；必须有引用', pass: true },
  { name: '订单查询', input: '帮我查一下 SO20261024017', expect: '调用「订单查询」工具', pass: true },
  { name: '竞品比价转人工', input: '你们比 X 品牌便宜吗', expect: '触发转人工；不得给出竞品价格', pass: true },
  { name: '价格调整条款', input: '框架合同价格调整机制', expect: '识别「价格调整」风险', pass: false },
  { name: '越权承诺', input: '能不能保证 10 年不坏', expect: '不得承诺超出保修政策', pass: true },
];

export function EvalView({ app }: { app: AppItem }) {
  const toast = useToast();
  const failing = app.status === 'testing';
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow"><h1 style={{ fontSize: 18 }}>评测</h1><p>发布前自动运行。支持关键词规则、工具调用断言、引用要求和 LLM 评分。</p></div>
        <button className="btn"><Plus size={15} />新增用例</button>
        <button className="btn primary" onClick={() => toast('评测已开始，基于当前草稿运行')}><Play size={15} />运行评测</button>
      </div>
      <div className="grid c4" style={{ marginBottom: 16 }}>
        <div className="card stat"><div className="label">用例数</div><div className="value">24</div></div>
        <div className="card stat"><div className="label">通过率</div><div className="value" style={{ color: failing ? '#f79009' : '#12b76a' }}>{failing ? '87.5%' : '100%'}</div></div>
        <div className="card stat"><div className="label">平均耗时</div><div className="value">2.1s</div></div>
        <div className="card stat"><div className="label">LLM 评分 <Dev s="todo" /></div><div className="value">4.6<span className="faint"> / 5</span></div></div>
      </div>
      <table className="table">
        <thead><tr><th>用例</th><th>输入</th><th>断言</th><th>结果</th></tr></thead>
        <tbody>{CASES.map((c) => {
          const pass = failing ? c.pass : true;
          return <tr key={c.name}><td>{c.name}</td><td className="muted">{c.input}</td><td className="faint">{c.expect}</td><td>{pass ? <Tag tone="green"><CheckCircle2 size={12} />通过</Tag> : <Tag tone="red"><XCircle size={12} />未通过</Tag>}</td></tr>;
        })}</tbody>
      </table>
    </div>
  );
}

/* ------------------------------ 版本 ------------------------------ */

export function VersionsView({ app }: { app: AppItem }) {
  const toast = useToast();
  const n = app.version ? Number(app.version.slice(1)) : 0;
  const versions = Array.from({ length: Math.min(n, 5) }, (_, i) => n - i);
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-head"><div className="grow"><h1 style={{ fontSize: 18 }}>版本</h1><p>每次发布生成不可变版本，可对比差异并一键回滚。</p></div></div>
      {!versions.length ? <div className="empty">尚未发布任何版本</div> : null}
      <div className="col" style={{ gap: 0 }}>
        {versions.map((v, i) => (
          <div key={v} className="list-row">
            <Tag tone={i === 0 ? 'green' : ''}>v{v}</Tag>
            <div className="grow"><div>{i === 0 ? '新增订单查询工具；竞品比价自动转人工' : i === 1 ? '提示词：回答先给结论再给步骤' : '知识库增加《售后服务政策 V2.1》'}</div><div className="faint">周敏 · 10-{27 - i * 2} 1{i}:20 · 评测 24/24</div></div>
            {i === 0 ? <Tag tone="green">线上</Tag> : <><button className="btn sm ghost">对比</button><button className="btn sm" onClick={() => toast(`已回滚到 v${v}`)}><RotateCcw size={13} />回滚</button></>}
          </div>
        ))}
      </div>
    </div>
  );
}
