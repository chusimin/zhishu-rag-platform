import { apiFetch } from './client';

export type InputField = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'boolean';
  description?: string;
  required: boolean;
  placeholder?: string;
  options: string[];
  default?: string | number | boolean | null;
  minimum?: number | null;
  maximum?: number | null;
};

export type AppManifest = {
  schema_version: 'fde.app/v1' | 'fde.app/v2';
  type: 'simple' | 'agent';
  name: string;
  description: string;
  template_key: 'qa' | 'content' | 'report' | 'review' | 'customer_service' | string;
  system_prompt: string;
  llm_model_id: string | null;
  model: { temperature: number; max_tokens: number; thinking_mode: 'auto' | 'enabled' | 'disabled' };
  knowledge_base_ids: string[];
  input_fields: InputField[];
  output: { format: 'markdown' | 'text' | 'json'; json_schema?: Record<string, unknown> | null };
  tools: Array<{ name: string; tool_id?: string | null; enabled: boolean; config: Record<string, unknown> }>;
  guardrails: { blocked_topics: string[]; require_citations: boolean; refuse_without_evidence: boolean; human_handoff: boolean; max_output_chars: number };
  memory: { enabled: boolean; max_turns: number };
  delivery: { channel: 'web' | 'api' | 'both'; show_citations: boolean; allow_copy: boolean; allow_export: boolean };
  agent: { max_steps: number; require_confirmation_for_side_effects: boolean; show_tool_steps: boolean; long_term_memory: boolean };
};

export type AppTemplate = {
  key: string;
  name: string;
  description: string;
  icon: string;
  system_prompt: string;
  input_fields: InputField[];
  output: AppManifest['output'];
  knowledge_bases: { required: boolean; min_items: number; max_items: number };
  tools: AppManifest['tools'];
  guardrails: AppManifest['guardrails'];
  memory: AppManifest['memory'];
  delivery: AppManifest['delivery'];
};

export type ValidationIssue = { path: string; code: string; message: string; severity: 'error' | 'warning' };
export type AppVersion = { id: string; version: number; manifest: AppManifest; release_notes: string; created_at: string };
export type FDEApp = {
  id: string;
  name: string;
  description: string;
  scenario_type: string;
  status: string;
  is_enabled: boolean;
  manifest: AppManifest;
  published_version_id: string | null;
  published_version: AppVersion | null;
  versions: AppVersion[];
  portal_path: string;
  conversation_count?: number;
  updated_at: string;
};
export type RunResult = {
  content: string;
  citations: Array<{ chunk_id: string; filename: string; title: string; page_number: number | null; content: string; score: number }>;
  tokens: { input: number | null; output: number | null; total: number | null };
  duration_ms: number;
  simulated: boolean;
  output_json: unknown;
  handoff: boolean;
  agent_steps: Array<{ step: number; tool: string; arguments: Record<string, unknown>; status: string; result: string }>;
  conversation_id: string;
  message_id: string;
  app_version_id: string | null;
};
export type EvaluationCase = { id?: string; name: string; message: string; input_values: Record<string, unknown>; expected_keywords: string[]; forbidden_keywords: string[]; require_citations: boolean };
export type EvaluationResult = { case_id: string; name: string; passed: boolean; reasons: string[]; output: string; simulated?: boolean };
export type AppShare = { id: string; name: string; token?: string; expires_at: string | null; max_uses: number | null; use_count: number; is_enabled: boolean; created_at: string };

export const fdeApi = {
  templates: () => apiFetch<AppTemplate[]>('/fde/templates'),
  capabilities: () => apiFetch<Record<string, unknown>>('/fde/capabilities'),
  list: () => apiFetch<FDEApp[]>('/fde/apps'),
  design: (payload: { brief: string; template_key: string; llm_model_id?: string | null; base_manifest?: AppManifest }) => apiFetch<{ manifest: AppManifest; simulated: boolean; issues: ValidationIssue[] }>('/fde/design', { method: 'POST', body: JSON.stringify(payload) }),
  create: (manifest: AppManifest) => apiFetch<FDEApp>('/fde/apps', { method: 'POST', body: JSON.stringify({ manifest }) }),
  get: (id: string) => apiFetch<FDEApp>(`/fde/apps/${id}`),
  save: (id: string, manifest: AppManifest) => apiFetch<FDEApp>(`/fde/apps/${id}/manifest`, { method: 'PUT', body: JSON.stringify({ manifest }) }),
  validate: (id: string) => apiFetch<{ issues: ValidationIssue[]; publish_ready: boolean }>(`/fde/apps/${id}/validate`, { method: 'POST' }),
  preview: (id: string, payload: { message?: string; input_values: Record<string, unknown> }) => apiFetch<RunResult>(`/fde/apps/${id}/preview`, { method: 'POST', body: JSON.stringify(payload) }),
  run: (id: string, payload: { message?: string; input_values: Record<string, unknown>; conversation_id?: string; confirmed_tool_names?: string[] }) => apiFetch<RunResult>(`/fde/apps/${id}/run`, { method: 'POST', body: JSON.stringify(payload) }),
  version: (id: string, releaseNotes = '') => apiFetch<AppVersion>(`/fde/apps/${id}/versions`, { method: 'POST', body: JSON.stringify({ release_notes: releaseNotes }) }),
  publish: (id: string, versionId?: string) => apiFetch<FDEApp>(`/fde/apps/${id}/publish`, { method: 'POST', body: JSON.stringify({ version_id: versionId ?? null }) }),
  rollback: (id: string, versionId: string) => apiFetch<FDEApp>(`/fde/apps/${id}/rollback`, { method: 'POST', body: JSON.stringify({ version_id: versionId }) }),
  unpublish: (id: string) => apiFetch<FDEApp>(`/fde/apps/${id}/unpublish`, { method: 'POST' }),
  duplicate: (id: string) => apiFetch<FDEApp>(`/fde/apps/${id}/duplicate`, { method: 'POST' }),
  archive: (id: string) => apiFetch<FDEApp>(`/fde/apps/${id}/archive`, { method: 'POST' }),
  restore: (id: string) => apiFetch<FDEApp>(`/fde/apps/${id}/restore`, { method: 'POST' }),
  delete: (id: string) => apiFetch<void>(`/fde/apps/${id}`, { method: 'DELETE' }),
  shares: (id: string) => apiFetch<AppShare[]>(`/fde/apps/${id}/shares`),
  createShare: (id: string, payload: { name: string; expires_in_days: number | null; max_uses: number | null }) => apiFetch<AppShare>(`/fde/apps/${id}/shares`, { method: 'POST', body: JSON.stringify(payload) }),
  revokeShare: (id: string, shareId: string) => apiFetch<void>(`/fde/apps/${id}/shares/${shareId}`, { method: 'DELETE' }),
  publicShare: (token: string) => apiFetch<FDEApp>(`/fde/share/${encodeURIComponent(token)}`),
  runShare: (token: string, payload: { message?: string; input_values: Record<string, unknown>; conversation_id?: string; confirmed_tool_names?: string[] }) => apiFetch<RunResult>(`/fde/share/${encodeURIComponent(token)}/run`, { method: 'POST', body: JSON.stringify(payload) }),
  saveSuite: (id: string, name: string, cases: EvaluationCase[]) => apiFetch<{ id: string; case_count: number }>(`/fde/apps/${id}/evaluation-suite`, { method: 'PUT', body: JSON.stringify({ name, cases: cases.map(({ name: caseName, ...item }) => ({ ...item, name: caseName })) }) }),
  evaluate: (id: string) => apiFetch<{ status: string; passed_count: number; failed_count: number; simulated: boolean; results: EvaluationResult[] }>(`/fde/apps/${id}/evaluate`, { method: 'POST' }),
  feedback: (messageId: string, rating: 1 | -1, comment = '') => apiFetch<{ ok: boolean }>(`/fde/messages/${messageId}/feedback`, { method: 'POST', body: JSON.stringify({ rating, comment }) }),
};
