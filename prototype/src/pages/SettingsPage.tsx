import { Copy, KeyRound, Plus, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { Dev, Tag, useToast } from '../components/ui';

const MEMBERS = [
  { name: '周敏', dept: '客服中心', role: '平台管理员', last: '刚刚' },
  { name: '李想', dept: '战略部', role: '应用开发者', last: '1 小时前' },
  { name: '王律', dept: '法务部', role: '应用开发者', last: '昨天' },
  { name: '陈晨', dept: '人力行政部', role: '知识库管理员', last: '10-24' },
  { name: '黄磊', dept: '研发部', role: '业务使用者', last: '10:15' },
];

const ROLES = [
  { name: '平台管理员', desc: '模型、工具、成员与全部资源', dev: 'ready' as const },
  { name: '应用开发者', desc: '搭建、调试、发布本部门应用', dev: 'partial' as const },
  { name: '知识库管理员', desc: '管理被授权的知识库与切块', dev: 'ready' as const },
  { name: '业务使用者', desc: '只在工作台使用已发布应用', dev: 'ready' as const },
];

export function SettingsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<'members' | 'roles' | 'agent' | 'audit'>('members');
  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <div className="page-head"><div className="grow"><h1>设置</h1><p>团队、角色与权限、Agent 接入和审计。</p></div></div>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {([['members', '成员'], ['roles', '角色与权限'], ['agent', 'Agent 接入'], ['audit', '审计日志']] as const).map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'members' ? <>
        <div className="row" style={{ marginBottom: 12 }}><span className="grow faint">成员来自企业 SSO（飞书 / 企业微信），按部门自动同步<Dev s="todo" note="OIDC" /></span><button className="btn primary"><Plus size={15} />邀请成员</button></div>
        <table className="table"><thead><tr><th>成员</th><th>部门</th><th>角色</th><th>最近活跃</th></tr></thead>
          <tbody>{MEMBERS.map((m) => <tr key={m.name}><td><div className="row"><span className="nav-avatar" style={{ margin: 0, width: 28, height: 28, fontSize: 12 }}>{m.name[0]}</span>{m.name}</div></td><td>{m.dept}</td><td><Tag tone={m.role === '平台管理员' ? 'blue' : ''}>{m.role}</Tag></td><td className="faint">{m.last}</td></tr>)}</tbody>
        </table>
      </> : null}
      {tab === 'roles' ? (
        <div className="grid c2">
          {ROLES.map((r) => <div key={r.name} className="card pad row"><ShieldCheck size={20} color="var(--primary)" /><div className="grow"><strong>{r.name}</strong><Dev s={r.dev} /><div className="faint">{r.desc}</div></div><button className="btn sm ghost">编辑</button></div>)}
          <div className="card pad" style={{ gridColumn: '1 / -1' }}>
            <div className="row" style={{ marginBottom: 8 }}><Users size={16} /><strong>应用可见范围示例</strong></div>
            <div className="row wrap"><Tag tone="blue">智能客服助手 → 客服中心、外部访客</Tag><Tag tone="blue">合同风险审校 → 法务部、采购部</Tag><Tag tone="blue">制度问答助手 → 全员</Tag></div>
          </div>
        </div>
      ) : null}
      {tab === 'agent' ? (
        <div className="col" style={{ gap: 16 }}>
          <div className="card pad">
            <div className="row"><KeyRound size={18} color="var(--primary)" /><strong className="grow">Agent 控制面 Token<Dev s="ready" /></strong><button className="btn sm primary" onClick={() => toast('Token 只显示一次，请立即复制')}><Plus size={13} />创建 Token</button></div>
            <p className="faint" style={{ margin: '6px 0 12px' }}>外部 AI Agent（如 Claude Code、Codex）可通过同一套协议创建知识库、搭建和发布应用。</p>
            <table className="table"><thead><tr><th>名称</th><th>权限</th><th>最近使用</th></tr></thead><tbody>
              <tr><td>FDE 交付 Agent</td><td><Tag>apps:write</Tag><Tag>knowledge:write</Tag></td><td className="faint">今天 09:12</td></tr>
              <tr><td>CI 评测机器人</td><td><Tag>apps:evaluate</Tag></td><td className="faint">昨天</td></tr>
            </tbody></table>
          </div>
          <div className="code-block">{`# 能力发现
curl -H "Authorization: Bearer $FDE_TOKEN" https://ai.example.com/api/v1/fde/capabilities

# 让 Agent 按需求生成 Chat Flow 草稿
curl -X POST https://ai.example.com/api/v1/fde/design -H "Authorization: Bearer $FDE_TOKEN" \\
  -d '{"brief":"法务部需要合同审校流程…","type":"chatflow"}'`}</div>
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => toast('已复制')}><Copy size={13} />复制示例</button>
        </div>
      ) : null}
      {tab === 'audit' ? (
        <table className="table"><thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象</th></tr></thead><tbody>
          {[['10:42', '周敏', '发布版本 v12', '智能客服助手'], ['10:05', '系统', '同步网站 58 页', '产品手册与 FAQ'], ['09:30', '陈晨', '重新切块（按标题层级）', 'ES-200 用户手册'], ['09:12', 'FDE 交付 Agent', '创建草稿', '项目周报生成'], ['昨天', '王律', '运行评测 21/24', '合同风险审校']].map((r) => <tr key={r.join()}>{r.map((c, i) => <td key={i} className={i === 0 ? 'faint' : ''}>{c}</td>)}</tr>)}
        </tbody></table>
      ) : null}
    </div>
  );
}
