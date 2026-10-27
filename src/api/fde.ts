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
  schema_version: 'fde.app/v1';
  name: string;
  description: string;
  template_key: 'qa' | 'content' | 'report' | 'review' | 'customer_service' | string;
  system_prompt: string;
  llm_model_id: string | null;
  knowledge_base_ids: string[];
  input_fields: InputField[];
  output: { format: 'markdown' | 'text' | 'json'; json_schema?: Record<string, unknown> | null };
  tools: Array<{ name: string; enabled: boolean; config: Record<string, unknown> }>;
  guardrails: { blocked_topics: string[]; require_citations: boolean; refuse_without_evidence: boolean; human_handoff: boolean; max_output_chars: number };
  memory: { enabled: boolean; max_turns: number };
  delivery: { channel: 'web' | 'api' | 'both'; show_citations: boolean; allow_copy: boolean; allow_export: boolean };
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
export type AppVersion = { id: string; version: number; manifest: AppManifest; created_at: string };
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
  conversation_id: string;
  message_id: string;
  app_version_id: string | null;
};
export type EvaluationCase = { id?: string; name: string; message: string; input_values: Record<string, unknown>; expected_keywords: string[]; forbidden_keywords: string[]; require_citations: boolean };
export type EvaluationResult = { case_id: string; name: string; passed: boolean; reasons: string[]; output: string; simulated?: boolean };

export const fdeApi = {
  templates: () => apiFetch<AppTemplate[]>('/fde/templates'),
  capabilities: () => apiFetch<Record<string, unknown>>('/fde/capabilities'),
  design: (payload: { brief: string; template_key: string; llm_model_id?: string | null; base_manifest?: AppManifest }) => apiFetch<{ manifest: AppManifest; simulated: boolean; issues: ValidationIssue[] }>('/fde/design', { method: 'POST', body: JSON.stringify(payload) }),
  create: (manifest: AppManifest) => apiFetch<FDEApp>('/fde/apps', { method: 'POST', body: JSON.stringify({ manifest }) }),
  get: (id: string) => apiFetch<FDEApp>(`/fde/apps/${id}`),
  save: (id: string, manifest: AppManifest) => apiFetch<FDEApp>(`/fde/apps/${id}/manifest`, { method: 'PUT', body: JSON.stringify({ manifest }) }),
  validate: (id: string) => apiFetch<{ issues: ValidationIssue[]; publish_ready: boolean }>(`/fde/apps/${id}/validate`, { method: 'POST' }),
  preview: (id: string, payload: { message?: string; input_values: Record<string, unknown> }) => apiFetch<RunResult>(`/fde/apps/${id}/preview`, { method: 'POST', body: JSON.stringify(payload) }),
  run: (id: string, payload: { message?: string; input_values: Record<string, unknown>; conversation_id?: string }) => apiFetch<RunResult>(`/fde/apps/${id}/run`, { method: 'POST', body: JSON.stringify(payload) }),
  version: (id: string) => apiFetch<AppVersion>(`/fde/apps/${id}/versions`, { method: 'POST' }),
  publish: (id: string, versionId?: string) => apiFetch<FDEApp>(`/fde/apps/${id}/publish`, { method: 'POST', body: JSON.stringify({ version_id: versionId ?? null }) }),
  rollback: (id: string, versionId: string) => apiFetch<FDEApp>(`/fde/apps/${id}/rollback`, { method: 'POST', body: JSON.stringify({ version_id: versionId }) }),
  unpublish: (id: string) => apiFetch<FDEApp>(`/fde/apps/${id}/unpublish`, { method: 'POST' }),
  saveSuite: (id: string, name: string, cases: EvaluationCase[]) => apiFetch<{ id: string; case_count: number }>(`/fde/apps/${id}/evaluation-suite`, { method: 'PUT', body: JSON.stringify({ name, cases: cases.map(({ name: caseName, ...item }) => ({ ...item, name: caseName })) }) }),
  evaluate: (id: string) => apiFetch<{ status: string; passed_count: number; failed_count: number; simulated: boolean; results: EvaluationResult[] }>(`/fde/apps/${id}/evaluate`, { method: 'POST' }),
  feedback: (messageId: string, rating: 1 | -1, comment = '') => apiFetch<{ ok: boolean }>(`/fde/messages/${messageId}/feedback`, { method: 'POST', body: JSON.stringify({ rating, comment }) }),
};
