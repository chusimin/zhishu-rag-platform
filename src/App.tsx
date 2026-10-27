import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, type PropsWithChildren } from 'react';
import { AppShell, canAccess } from './components/AppShell';
import { ToastProvider } from './components/Toast';
import { AgentAccessPage } from './pages/AgentAccessPage';
import { DashboardPage } from './pages/DashboardPage';
import { AppConfigPage } from './pages/AppConfigPage';
import { AppsPage } from './pages/AppsPage';
import { ChatPage } from './pages/ChatPage';
import { ChunksPage } from './pages/ChunksPage';
import { KnowledgeDetailPage } from './pages/KnowledgeDetailPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { LogsPage } from './pages/LogsPage';
import { LoginPage } from './pages/LoginPage';
import { FDEStudioPage } from './pages/FDEStudioPage';
import { PortalPage } from './pages/PortalPage';
import { ModelsPage } from './pages/ModelsPage';
import { RetrievalTestPage } from './pages/RetrievalTestPage';
import { RolePage } from './pages/RolePage';
import type { Role } from './types';

const roleStorageKey = 'knowledge-hub-demo-role';

function loadRole(): Role | null {
  const value = window.localStorage.getItem(roleStorageKey);
  return value === 'admin' || value === 'manager' || value === 'user' ? value : null;
}

function ProtectedShell({ role, onRoleChange, children }: PropsWithChildren<{ role: Role | null; onRoleChange: (role: Role) => void }>) {
  const location = useLocation();
  if (!role) return <Navigate to="/role" replace state={{ from: location.pathname }} />;
  if (!canAccess(role, location.pathname)) return <Navigate to="/dashboard" replace />;
  return <AppShell role={role} onRoleChange={onRoleChange}>{children}</AppShell>;
}

export default function App() {
  const [role, setRole] = useState<Role | null>(() => loadRole());
  const navigate = useNavigate();

  useEffect(() => {
    if (role) window.localStorage.setItem(roleStorageKey, role);
  }, [role]);

  const changeRole = (nextRole: Role) => {
    window.localStorage.setItem(roleStorageKey, nextRole);
    setRole(nextRole);
  };

  const chooseRole = (nextRole: Role) => {
    changeRole(nextRole);
    navigate('/dashboard');
  };

  return (
    <ToastProvider>
      <Routes>
        <Route path="/role" element={<RolePage currentRole={role} onSelect={chooseRole} />} />
        <Route path="/login" element={<LoginPage onLogin={changeRole} />} />
        <Route path="/portal" element={role ? <PortalPage /> : <Navigate to="/login" replace />} />
        <Route path="/portal/apps/:id" element={role ? <PortalPage /> : <Navigate to="/login" replace />} />
        <Route path="/studio" element={<ProtectedShell role={role} onRoleChange={changeRole}><FDEStudioPage /></ProtectedShell>} />
        <Route path="/agent" element={<ProtectedShell role={role} onRoleChange={changeRole}><AgentAccessPage /></ProtectedShell>} />
        <Route path="/dashboard" element={<ProtectedShell role={role} onRoleChange={changeRole}><DashboardPage role={role!} /></ProtectedShell>} />
        <Route path="/models" element={<ProtectedShell role={role} onRoleChange={changeRole}><ModelsPage /></ProtectedShell>} />
        <Route path="/knowledge" element={<ProtectedShell role={role} onRoleChange={changeRole}><KnowledgePage /></ProtectedShell>} />
        <Route path="/knowledge/:id/chunks" element={<ProtectedShell role={role} onRoleChange={changeRole}><ChunksPage /></ProtectedShell>} />
        <Route path="/knowledge/:id/test" element={<ProtectedShell role={role} onRoleChange={changeRole}><RetrievalTestPage /></ProtectedShell>} />
        <Route path="/knowledge/:id" element={<ProtectedShell role={role} onRoleChange={changeRole}><KnowledgeDetailPage /></ProtectedShell>} />
        <Route path="/apps" element={<ProtectedShell role={role} onRoleChange={changeRole}><AppsPage /></ProtectedShell>} />
        <Route path="/apps/:id/config" element={<ProtectedShell role={role} onRoleChange={changeRole}><AppConfigPage /></ProtectedShell>} />
        <Route path="/chat" element={<ProtectedShell role={role} onRoleChange={changeRole}><ChatPage /></ProtectedShell>} />
        <Route path="/logs" element={<ProtectedShell role={role} onRoleChange={changeRole}><LogsPage /></ProtectedShell>} />
        <Route path="/" element={<Navigate to={role ? '/dashboard' : '/role'} replace />} />
        <Route path="*" element={<Navigate to={role ? '/dashboard' : '/role'} replace />} />
      </Routes>
    </ToastProvider>
  );
}
