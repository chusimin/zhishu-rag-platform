import { BarChart3, Blocks, Database, Eye, EyeOff, LayoutGrid, Settings, Wrench } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAnnotate } from './ui';

const NAV = [
  { to: '/workbench', label: '工作台', icon: LayoutGrid },
  { to: '/apps', label: '应用', icon: Blocks },
  { to: '/knowledge', label: '知识库', icon: Database },
  { to: '/tools', label: '工具', icon: Wrench },
  { to: '/insights', label: '看板', icon: BarChart3 },
];

export function Shell({ children, bare }: PropsWithChildren<{ bare?: boolean }>) {
  const { on, toggle } = useAnnotate();
  const { pathname } = useLocation();
  return (
    <div className="shell">
      <nav className="nav" aria-label="主导航">
        <div className="nav-logo" title="知枢 AI 应用中台">枢</div>
        {NAV.map(({ to, label, icon: I }) => (
          <NavLink key={to} to={to} className={() => `nav-item ${pathname.startsWith(to) ? 'active' : ''}`}>
            <I size={20} aria-hidden="true" /><span>{label}</span>
          </NavLink>
        ))}
        <div className="nav-spacer" />
        <button className={`nav-item ${on ? 'active' : ''}`} onClick={toggle} title="评审用：显示每个功能的后端就绪度">
          {on ? <Eye size={18} /> : <EyeOff size={18} />}<span>开发标注</span>
        </button>
        <NavLink to="/settings" className={() => `nav-item ${pathname.startsWith('/settings') ? 'active' : ''}`}><Settings size={18} /><span>设置</span></NavLink>
        <div className="nav-avatar" title="周敏 · 管理员">周</div>
      </nav>
      <main className={`main ${bare ? 'bare' : ''}`}>{children}</main>
    </div>
  );
}
