import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { AppEditorPage } from './pages/AppEditorPage';
import { AppsPage } from './pages/AppsPage';
import { ChatRunPage } from './pages/ChatRunPage';
import { EvaluationSetsPage } from './pages/EvaluationSetsPage';
import { ImportWizardPage } from './pages/ImportWizardPage';
import { InsightsPage } from './pages/InsightsPage';
import { KnowledgeDetailPage } from './pages/KnowledgeDetailPage';
import { KnowledgeListPage } from './pages/KnowledgeListPage';
import { ObservabilityPage } from './pages/ObservabilityPage';
import { SettingsPage } from './pages/SettingsPage';
import { ToolsPage } from './pages/ToolsPage';
import { WorkbenchPage } from './pages/WorkbenchPage';

export function App() {
  return (
    <Routes>
      <Route path="/workbench" element={<Shell><WorkbenchPage /></Shell>} />
      <Route path="/chat/:appId" element={<Shell><ChatRunPage /></Shell>} />
      <Route path="/apps" element={<Shell><AppsPage /></Shell>} />
      <Route path="/apps/:appId" element={<Shell><AppEditorPage /></Shell>} />
      <Route path="/knowledge" element={<Shell><KnowledgeListPage /></Shell>} />
      <Route path="/knowledge/:kbId/import" element={<Shell><ImportWizardPage /></Shell>} />
      <Route path="/knowledge/:kbId/*" element={<Shell><KnowledgeDetailPage /></Shell>} />
      <Route path="/tools" element={<Shell><ToolsPage /></Shell>} />
      <Route path="/insights" element={<Shell><InsightsPage /></Shell>} />
      <Route path="/observability" element={<Shell><ObservabilityPage /></Shell>} />
      <Route path="/evaluation-sets" element={<Shell><EvaluationSetsPage /></Shell>} />
      <Route path="/settings" element={<Shell><SettingsPage /></Shell>} />
      <Route path="*" element={<Navigate to="/workbench" replace />} />
    </Routes>
  );
}
