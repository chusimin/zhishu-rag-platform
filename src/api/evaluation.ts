import { apiFetch, type ApiEvaluationCase, type ApiEvaluationRun, type ApiEvaluationSet } from './client';

export type CaseDraft = {
  name: string;
  message: string;
  input_values?: Record<string, unknown>;
  expected_output?: string;
  expected_keywords?: string[];
  forbidden_keywords?: string[];
  require_citations?: boolean;
  tags?: string[];
};

export const evalApi = {
  list: (appId?: string) => apiFetch<ApiEvaluationSet[]>(`/evaluation-sets${appId ? `?app_id=${appId}` : ''}`),
  get: (id: string) => apiFetch<ApiEvaluationSet>(`/evaluation-sets/${id}`),
  create: (payload: { app_id: string; name: string; description?: string }) => apiFetch<ApiEvaluationSet>('/evaluation-sets', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: { name?: string; description?: string; is_release_gate?: boolean }) => apiFetch<ApiEvaluationSet>(`/evaluation-sets/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  fromLogs: (id: string, payload: { trace_ids: string[]; case_type: 'good' | 'bad'; tags?: string[] }) => apiFetch<{ created_count: number; cases: ApiEvaluationCase[] }>(`/evaluation-sets/${id}/cases/from-logs`, { method: 'POST', body: JSON.stringify(payload) }),
  createCase: (id: string, payload: CaseDraft) => apiFetch<ApiEvaluationCase>(`/evaluation-sets/${id}/cases`, { method: 'POST', body: JSON.stringify(payload) }),
  updateCase: (id: string, caseId: string, payload: Partial<CaseDraft> & { case_type?: 'good' | 'bad' | 'manual' }) => apiFetch<ApiEvaluationCase>(`/evaluation-sets/${id}/cases/${caseId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteCase: (id: string, caseId: string) => apiFetch<void>(`/evaluation-sets/${id}/cases/${caseId}`, { method: 'DELETE' }),
  run: (id: string) => apiFetch<ApiEvaluationRun>(`/evaluation-sets/${id}/run`, { method: 'POST' }),
};

export function splitList(value: string) {
  return value.split(/[\n,，、]+/).map((item) => item.trim()).filter(Boolean);
}
