import { ArrowRight, BookOpenCheck, ShieldCheck, UserRound } from 'lucide-react';
import type { Role } from '../types';
import { Button, Notice } from '../components/ui';

const roles: Array<{ id: Role; title: string; description: string; permissions: string[]; icon: typeof ShieldCheck }> = [
  {
    id: 'admin',
    title: '管理员',
    description: '管理业务空间、模型、Agent 接入和全部应用交付。',
    permissions: ['工作区与权限', '模型与 Agent Token', '全局运行与质量'],
    icon: ShieldCheck,
  },
  {
    id: 'manager',
    title: '交付工程师',
    description: '设计 AI 应用，维护知识，完成评测和版本发布。',
    permissions: ['AI 应用设计', '知识与检索', '评测与版本交付'],
    icon: BookOpenCheck,
  },
  {
    id: 'user',
    title: '使用者',
    description: '使用已发布的问答、内容、报告和客服应用。',
    permissions: ['运行业务应用', '查看结果与引用', '复制与反馈'],
    icon: UserRound,
  },
];

export function RolePage({ currentRole, onSelect }: { currentRole: Role | null; onSelect: (role: Role) => void }) {
  return (
    <main className="role-page page-enter">
      <div className="role-brand"><span className="brand-mark">知</span><span>知枢</span></div>
      <section className="role-intro">
        <div className="eyebrow">FDE AI 应用中台 · 2.0</div>
        <h1>选择你的工作视角</h1>
        <p>开发环境可切换角色体验；正式使用请通过账号登录并进入授权业务空间。</p>
      </section>
      <Notice tone="info" title="Demo 角色与正式登录分离">
        角色选择仅用于开发体验；生产环境必须使用真实账号或 Agent Token，权限由工作区成员关系决定。
      </Notice>
      <div className="role-grid">
        {roles.map((role) => {
          const Icon = role.icon;
          return (
            <article className={`card role-card ${currentRole === role.id ? 'card--selected' : ''}`} key={role.id}>
              <div className="role-icon"><Icon size={24} /></div>
              <h2>{role.title}</h2>
              <p>{role.description}</p>
              <ul>{role.permissions.map((permission) => <li key={permission}>{permission}</li>)}</ul>
              <Button variant="primary" onClick={() => onSelect(role.id)} icon={<ArrowRight size={17} />}>
                以{role.title}进入
              </Button>
            </article>
          );
        })}
      </div>
      <p className="role-footnote">正式环境请使用 /login 登录；Demo Header 在生产环境无效。</p>
    </main>
  );
}
