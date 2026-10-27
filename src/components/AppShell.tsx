import {
  AppWindow,
  BookOpenCheck,
  Boxes,
  ChevronDown,
  Database,
  KeyRound,
  LayoutDashboard,
  MessagesSquare,
  MoreHorizontal,
  ScrollText,
  Settings2,
  Sparkles,
  Store,
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { Role } from '../types';
import { ROLE_LABELS } from '../data/roles';

const navItems = [
  { to: '/dashboard', label: '交付工作台', icon: LayoutDashboard, roles: ['admin', 'manager', 'user'] as Role[] },
  { to: '/studio', label: 'AI 设计室', icon: Sparkles, roles: ['admin', 'manager'] as Role[] },
  { to: '/apps', label: '应用中心', icon: AppWindow, roles: ['admin', 'manager'] as Role[] },
  { to: '/knowledge', label: '知识库', icon: Database, roles: ['admin', 'manager'] as Role[] },
  { to: '/models', label: '模型与工具', icon: Settings2, roles: ['admin'] as Role[] },
  { to: '/agent', label: 'Agent 接入', icon: KeyRound, roles: ['admin'] as Role[] },
  { to: '/portal', label: '业务应用', icon: Store, roles: ['admin', 'manager', 'user'] as Role[] },
  { to: '/chat', label: '在线对话', icon: MessagesSquare, roles: ['admin', 'manager', 'user'] as Role[] },
  { to: '/logs', label: '运行与质量', icon: ScrollText, roles: ['admin', 'manager'] as Role[] },
];

const titleByPrefix: Record<string, string> = {
  dashboard: '交付工作台',
  studio: 'AI 设计室',
  models: '模型与工具',
  agent: 'Agent 接入',
  knowledge: '知识库',
  apps: '应用中心',
  portal: '业务应用',
  chat: '在线对话',
  logs: '运行与质量',
};

export function AppShell({ role, onRoleChange, children }: PropsWithChildren<{ role: Role; onRoleChange: (role: Role) => void }>) {
  const location = useLocation();
  const visibleItems = navItems.filter((item) => item.roles.includes(role));
  const pathKey = location.pathname.split('/')[1] || 'dashboard';
  const pageTitle = titleByPrefix[pathKey] ?? '知枢';
  const mobileItems = role === 'user'
    ? visibleItems
    : visibleItems.filter((item) => ['/dashboard', '/knowledge', '/chat', '/logs'].includes(item.to));
  const moreItems = visibleItems.filter((item) => !mobileItems.includes(item));
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMoreOpen(false), [location.pathname, role]);
  useEffect(() => {
    if (!moreOpen) return undefined;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        moreRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', outside);
    };
  }, [moreOpen]);

  return (
    <div className="app-shell">
      <aside className="global-nav" aria-label="主导航">
        <div className="brand"><span className="brand-mark">知</span><span className="product-name">知枢</span></div>
        <div className="nav-section-label">工作空间</div>
        <nav className="nav-list">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} className="nav-item" to={item.to} aria-label={item.label} title={item.label}>
                <Icon size={19} aria-hidden="true" />
                <span className="nav-label">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="nav-spacer" />
        <div className="prototype-note"><Boxes size={16} /><span className="nav-label">FDE 2.0<br />AI 可编排中台</span></div>
        <NavLink className="nav-item role-nav-item" to="/role" aria-label="切换体验角色" title="切换体验角色">
          <BookOpenCheck size={19} aria-hidden="true" />
          <span className="nav-label">切换体验角色</span>
        </NavLink>
      </aside>

      <div className="app-main">
        <header className="utility-bar">
          <div className="mobile-brand"><span className="brand-mark">知</span><strong>知枢</strong></div>
          <div className="breadcrumbs"><span>FDE AI 应用中台</span><span>/</span><strong>{pageTitle}</strong></div>
          <div className="role-switcher-wrap">
            <span className="role-mode-label">体验视角 · 非鉴权</span>
            <label className="role-switcher">
              <span className="sr-only">切换体验角色</span>
              <select value={role} onChange={(event) => onRoleChange(event.target.value as Role)}>
                <option value="admin">管理员</option>
                <option value="manager">知识库管理人员</option>
                <option value="user">使用者</option>
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </label>
          </div>
        </header>
        <div className="demo-strip">标准交付流程：业务需求 → 应用设计 → 真实验证 → 质量评测 → 版本发布</div>
        <div className="workspace">{children}</div>
      </div>

      <div className="mobile-more" ref={moreRef}>
        {moreOpen ? <div className="mobile-more-menu" id="mobile-more-menu" role="menu" aria-label="更多功能">
          {moreItems.map((item) => {
            const Icon = item.icon;
            return <NavLink key={item.to} to={item.to} role="menuitem"><Icon size={18} aria-hidden="true" /><span>{item.label}</span></NavLink>;
          })}
        </div> : null}
        <nav className="mobile-bottom-nav" aria-label="移动端主导航">
          {mobileItems.map((item) => {
            const Icon = item.icon;
            return <NavLink key={item.to} to={item.to}><Icon size={19} aria-hidden="true" /><span>{item.label}</span></NavLink>;
          })}
          {moreItems.length ? <button type="button" className={moreOpen ? 'active' : ''} aria-label="更多功能" aria-expanded={moreOpen} aria-controls="mobile-more-menu" onClick={() => setMoreOpen((current) => !current)}><MoreHorizontal size={20} aria-hidden="true" /><span>更多</span></button> : null}
        </nav>
      </div>
    </div>
  );
}

export const allowedRoutes: Record<Role, string[]> = {
  admin: ['/dashboard', '/studio', '/models', '/agent', '/knowledge', '/apps', '/portal', '/chat', '/logs'],
  manager: ['/dashboard', '/studio', '/knowledge', '/apps', '/portal', '/chat', '/logs'],
  user: ['/dashboard', '/portal', '/chat'],
};

export function canAccess(role: Role, path: string) {
  return allowedRoutes[role].some((route) => path === route || path.startsWith(`${route}/`));
}

export function roleLabel(role: Role) {
  return ROLE_LABELS[role];
}
