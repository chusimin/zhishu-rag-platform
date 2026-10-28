import { Copy, KeyRound, Plus, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, errorMessage, formatDateTime } from '../api/client';
import { useToast } from '../components/Toast';
import { Badge, Button, Modal, Notice, PageHeader } from '../components/ui';

type Tab = 'members' | 'roles' | 'agent' | 'audit';
type Member = { id: string; email: string; display_name: string; is_active: boolean; role: 'admin' | 'manager' | 'user'; joined_at: string };
type ApiClient = { id: string; name: string; role: string; scopes: string[]; last_used_at: string | null };
type AuditEvent = { id: string; actor_id: string | null; actor_name: string; action: string; resource_type: string; resource_id: string; detail: Record<string, unknown>; created_at: string };

const roleMeta = {
  admin: { name: '平台管理员', description: '管理成员、凭证、模型、工具、知识库、应用和审计日志。' },
  manager: { name: '应用与知识管理者', description: '搭建和发布应用，管理知识库与工具，但不能管理成员和 Agent Token。' },
  user: { name: '业务使用者', description: '只使用已发布应用，不可修改平台资源。' },
} as const;

const actionLabels: Record<string, string> = {
  'application.created': '创建应用', 'application.duplicated': '复制应用', 'application.draft_updated': '更新应用草稿',
  'application.version_created': '创建版本', 'application.published': '发布应用', 'application.rolled_back': '回滚应用',
  'application.unpublished': '下线应用', 'application.archived': '归档应用', 'application.restored': '恢复应用',
  'application.deleted': '删除应用', 'application.evaluated': '运行评测', 'member.invited': '邀请成员',
  'member.role_updated': '修改成员角色', 'member.removed': '移除成员', 'api_client.created': '创建 Agent Token',
  'api_client.revoked': '撤销 Agent Token', 'tool.created': '创建工具', 'tool.updated': '更新工具', 'tool.deleted': '删除工具',
};

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('members');
  const [members, setMembers] = useState<Member[]>([]);
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ display_name: '', email: '', password: '', role: 'user' as Member['role'] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const { showToast } = useToast();

  const load = useCallback(async () => {
    try {
      const [loadedMembers, loadedClients, loadedEvents] = await Promise.all([
        apiFetch<Member[]>('/auth/users'), apiFetch<ApiClient[]>('/auth/api-clients'), apiFetch<AuditEvent[]>(`/audit-events?limit=200${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`),
      ]);
      setMembers(loadedMembers);
      setClients(loadedClients);
      setEvents(loadedEvents);
      setError('');
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [search]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(timer); }, [load]);

  const createMember = async () => {
    setBusy('invite');
    try {
      await apiFetch('/auth/users', { method: 'POST', body: JSON.stringify(invite) });
      setInviteOpen(false);
      setInvite({ display_name: '', email: '', password: '', role: 'user' });
      showToast('成员已加入当前业务空间');
      await load();
    } catch (caught) { showToast(errorMessage(caught), 'error'); } finally { setBusy(''); }
  };

  const updateRole = async (member: Member, role: Member['role']) => {
    try {
      await apiFetch(`/auth/users/${member.id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
      setMembers((current) => current.map((item) => item.id === member.id ? { ...item, role } : item));
      showToast('成员角色已更新');
    } catch (caught) { showToast(errorMessage(caught), 'error'); }
  };

  const removeMember = async (member: Member) => {
    if (!window.confirm(`将 ${member.display_name} 移出当前业务空间？`)) return;
    try {
      await apiFetch(`/auth/users/${member.id}`, { method: 'DELETE' });
      setMembers((current) => current.filter((item) => item.id !== member.id));
      showToast('成员已移出业务空间');
    } catch (caught) { showToast(errorMessage(caught), 'error'); }
  };

  const revokeClient = async (client: ApiClient) => {
    if (!window.confirm(`撤销 Agent Token“${client.name}”？撤销后无法恢复。`)) return;
    try {
      await apiFetch(`/auth/api-clients/${client.id}`, { method: 'DELETE' });
      setClients((current) => current.filter((item) => item.id !== client.id));
      showToast('Agent Token 已撤销');
    } catch (caught) { showToast(errorMessage(caught), 'error'); }
  };

  return <main className="page page-enter settings-page">
    <PageHeader eyebrow="平台管理" title="设置" description="成员、角色权限、Agent 凭证与不可变审计记录。" actions={tab === 'members' ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => setInviteOpen(true)}>添加成员</Button> : undefined} />
    {error ? <Notice tone="error" title="无法读取设置数据">{error}</Notice> : null}
    <div className="tabs settings-tabs" role="tablist">{([['members', '成员'], ['roles', '角色与权限'], ['agent', 'Agent 接入'], ['audit', '审计日志']] as const).map(([value, label]) => <button className="tab" role="tab" aria-selected={tab === value} key={value} onClick={() => setTab(value)}>{label}</button>)}</div>

    {tab === 'members' ? <section className="card table-card"><div className="table-heading"><div><h2>业务空间成员</h2><p>当前为本地账号体系；企业 SSO/OIDC 需要真实身份源配置后才能启用。</p></div><Badge tone="info">{members.length} 人</Badge></div><table className="data-table"><thead><tr><th>成员</th><th>角色</th><th>加入时间</th><th>状态</th><th>操作</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><strong>{member.display_name}</strong><small className="table-subtext">{member.email}</small></td><td><select className="field compact-select" value={member.role} onChange={(event) => void updateRole(member, event.target.value as Member['role'])}>{Object.entries(roleMeta).map(([value, meta]) => <option value={value} key={value}>{meta.name}</option>)}</select></td><td>{formatDateTime(member.joined_at)}</td><td><Badge tone={member.is_active ? 'success' : 'warning'}>{member.is_active ? '有效' : '停用'}</Badge></td><td><Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => void removeMember(member)}>移除</Button></td></tr>)}</tbody></table>{!members.length ? <div className="empty-state"><Users size={26} /><h2>当前空间还没有正式成员</h2><p>体验角色不等于正式账号；请添加成员建立真实会话。</p></div> : null}</section> : null}

    {tab === 'roles' ? <><div className="role-card-grid">{Object.entries(roleMeta).map(([key, role]) => <section className="card role-card" key={key}><ShieldCheck size={22} /><div><Badge tone={key === 'admin' ? 'info' : 'neutral'}>{key}</Badge><h2>{role.name}</h2><p>{role.description}</p></div></section>)}</div><Notice tone="info" title="当前权限边界">API Token 另有 scopes 细粒度限制；成员角色目前为三档固定角色。部门级和自定义角色需要组织架构数据，尚未伪造为已完成。</Notice></> : null}

    {tab === 'agent' ? <section className="card table-card"><div className="table-heading"><div><h2>Agent 控制面 Token</h2><p>服务端只保存哈希；明文 Token 仅在创建时显示一次。</p></div><Link className="button button--primary" to="/agent"><Plus size={15} />创建 Token</Link></div><table className="data-table"><thead><tr><th>名称</th><th>角色</th><th>Scopes</th><th>最近使用</th><th>操作</th></tr></thead><tbody>{clients.map((client) => <tr key={client.id}><td><KeyRound size={15} /> {client.name}</td><td>{client.role}</td><td><code>{client.scopes.join(', ')}</code></td><td>{client.last_used_at ? formatDateTime(client.last_used_at) : '尚未使用'}</td><td><Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => void revokeClient(client)}>撤销</Button></td></tr>)}</tbody></table><div className="settings-agent-example"><pre className="manifest-view">{`curl -H "Authorization: Bearer $FDE_TOKEN" \\\n+  http://127.0.0.1:8001/api/v1/fde/capabilities`}</pre><Button icon={<Copy size={14} />} onClick={() => void navigator.clipboard.writeText(`curl -H "Authorization: Bearer $FDE_TOKEN" http://127.0.0.1:8001/api/v1/fde/capabilities`)}>复制示例</Button></div></section> : null}

    {tab === 'audit' ? <section className="card table-card"><div className="table-heading"><div><h2>审计事件</h2><p>记录应用、工具、成员与凭证变更；这里只提供查询，不允许改写。</p></div><label className="search-field"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索动作或资源 ID" /></label></div><table className="data-table"><thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>资源</th><th>详情</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{formatDateTime(event.created_at)}</td><td>{event.actor_name}</td><td><Badge tone="info">{actionLabels[event.action] ?? event.action}</Badge></td><td>{event.resource_type}<small className="table-subtext mono">{event.resource_id}</small></td><td><code>{JSON.stringify(event.detail)}</code></td></tr>)}</tbody></table>{!events.length ? <div className="empty-state"><Search size={26} /><h2>没有匹配的审计事件</h2><p>对应用、工具、成员或 Token 执行变更后会产生记录。</p></div> : null}</section> : null}

    <Modal open={inviteOpen} title="添加业务空间成员" description="创建本地账号并授予当前空间角色；密码需通过安全渠道交付给成员。" onClose={() => setInviteOpen(false)} footer={<><Button onClick={() => setInviteOpen(false)}>取消</Button><Button variant="primary" disabled={busy === 'invite' || !invite.display_name.trim() || !invite.email.trim() || invite.password.length < 8} onClick={() => void createMember()}>{busy === 'invite' ? '添加中…' : '添加成员'}</Button></>}><div className="form-stack"><label className="form-label">姓名<input className="field" value={invite.display_name} onChange={(event) => setInvite((current) => ({ ...current, display_name: event.target.value }))} /></label><label className="form-label">邮箱<input className="field" type="email" value={invite.email} onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))} /></label><label className="form-label">初始密码<input className="field" type="password" value={invite.password} onChange={(event) => setInvite((current) => ({ ...current, password: event.target.value }))} /><small>至少 8 位；后续应接入密码重置或企业身份源。</small></label><label className="form-label">角色<select className="field" value={invite.role} onChange={(event) => setInvite((current) => ({ ...current, role: event.target.value as Member['role'] }))}>{Object.entries(roleMeta).map(([value, meta]) => <option value={value} key={value}>{meta.name}</option>)}</select></label></div></Modal>
  </main>;
}
