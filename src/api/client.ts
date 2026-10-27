import type { Role } from '../types';

const defaultApiHost = typeof window === 'undefined' ? '127.0.0.1' : window.location.hostname;
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? `http://${defaultApiHost}:8001/api/v1`;
const roleStorageKey = 'knowledge-hub-demo-role';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function currentRole(): Role {
  const role = window.localStorage.getItem(roleStorageKey);
  return role === 'admin' || role === 'manager' || role === 'user' ? role : 'user';
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-Demo-Role', currentRole());
  const accessToken = window.localStorage.getItem('fde-access-token');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    let detail = `请求失败（HTTP ${response.status}）`;
    try {
      const body = await response.json() as { detail?: string | Array<{ msg?: string }> | { message?: string; issues?: Array<{ message?: string }> } };
      if (typeof body.detail === 'string') detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail.map((item) => item.msg).filter(Boolean).join('；') || detail;
      else if (body.detail && typeof body.detail === 'object') detail = [body.detail.message, ...(body.detail.issues ?? []).map((item) => item.message)].filter(Boolean).join('；') || detail;
    } catch {
      // Keep the HTTP fallback when the server did not return JSON.
    }
    throw new ApiError(response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export interface ApiModelConfig {
  id: string;
  display_name: string;
  provider: 'openrouter' | 'aihubmix' | 'deepseek' | 'tongyi' | 'mock';
  model_type: 'llm' | 'embedding' | 'rerank' | 'ocr';
  model_name: string;
  base_url: string;
  api_key_masked: string | null;
  is_enabled: boolean;
  connection_status: 'untested' | 'connected' | 'error' | 'mock';
  last_tested_at: string | null;
  last_error: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  simulated: boolean;
}

export interface ApiOpenRouterCatalogModel {
  id: string;
  name: string;
  description: string;
  model_type: 'llm' | 'embedding' | 'rerank' | 'ocr';
  context_length: number | null;
  modality: string;
  prompt_price: string | null;
  is_free: boolean;
}

export interface ApiOpenRouterCatalog {
  ok: true;
  detail: string;
  latency_ms: number;
  models: ApiOpenRouterCatalogModel[];
}

export interface ApiModelOption {
  id: string;
  display_name: string;
  provider: ApiModelConfig['provider'];
  model_type: ApiModelConfig['model_type'];
  model_name: string;
  is_enabled: boolean;
  connection_status: ApiModelConfig['connection_status'];
}

export interface ApiKnowledgeBase {
  id: string;
  name: string;
  description: string;
  embedding_model_id: string | null;
  rerank_model_id: string | null;
  ocr_model_id: string | null;
  chunk_size: number;
  chunk_overlap: number;
  chunk_method: 'recursive' | 'parent_child' | 'semantic';
  parent_chunk_size: number;
  child_chunk_size: number;
  semantic_llm_model_id: string | null;
  metadata_llm_model_id: string | null;
  file_count: number;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface ApiKnowledgeFile {
  id: string;
  knowledge_base_id: string;
  filename: string;
  content_type: string;
  extension: string;
  size_bytes: number;
  checksum_sha256: string;
  status: string;
  error_message: string | null;
  page_count: number | null;
  chunk_count: number;
  document_metadata: {
    document_time?: string | null;
    version?: string | null;
    subjects?: string[];
    owner?: string | null;
    keywords?: string[];
    likely_questions?: string[];
    extraction_method?: 'rules' | 'llm' | 'manual';
    extraction_status?: string;
    extracted_at?: string;
    model_id?: string | null;
  };
  created_at: string;
  updated_at: string;
}

export interface ApiImportJob {
  id: string;
  file_id: string;
  status: string;
  progress: number;
  current_stage: string;
  stage_details: Array<{ name: string; status: string; detail: string }>;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  simulated: boolean;
}

export interface ApiChunk {
  id: string;
  knowledge_base_id: string;
  file_id: string;
  ordinal: number;
  title: string;
  content: string;
  page_number: number | null;
  char_count: number;
  metadata_json: Record<string, unknown>;
  indexed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiRetrievalResult {
  chunk_id: string;
  knowledge_base_id: string;
  file_id: string;
  filename: string;
  title: string;
  content: string;
  page_number: number | null;
  vector_score: number;
  rerank_score: number | null;
  final_score: number;
  metadata: Record<string, unknown>;
}

export interface ApiRetrievalResponse {
  query: string;
  results: ApiRetrievalResult[];
  recalled_count: number;
  returned_count: number;
  embedding_duration_ms: number;
  vector_duration_ms: number;
  rerank_duration_ms: number | null;
  total_duration_ms: number;
  rerank_applied: boolean;
  simulated: boolean;
}

export interface ApiQAApp {
  id: string;
  name: string;
  description: string;
  scenario_type: 'qa' | 'report' | 'content' | 'review' | 'customer_service';
  system_prompt: string;
  llm_model_id: string | null;
  knowledge_base_ids: string[];
  knowledge_bases: Array<{ id: string; name: string; description: string }>;
  top_k: number;
  rerank_top_n: number;
  score_threshold: number;
  is_enabled: boolean;
  conversation_count: number;
  created_at: string;
  updated_at: string;
}

export interface ApiCitation {
  chunk_id: string;
  knowledge_base_id: string;
  file_id: string;
  filename: string;
  title: string;
  page_number: number | null;
  content: string;
  vector_score: number;
  rerank_score: number | null;
  score: number;
  metadata: Record<string, unknown>;
}

export interface ApiMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: ApiCitation[];
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  simulated: boolean;
  app_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiConversation {
  id: string;
  app_id: string;
  title: string;
  demo_role: Role;
  created_at: string;
  updated_at: string;
}

export interface ApiConversationDetail extends ApiConversation {
  messages: ApiMessage[];
}

export interface ApiTraceStep {
  id: string;
  ordinal: number;
  name: string;
  status: string;
  duration_ms: number;
  detail: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface ApiQueryLog {
  id: string;
  trace_id: string;
  app_id: string | null;
  app_name: string | null;
  conversation_id: string | null;
  demo_role: Role;
  query: string;
  status: 'running' | 'success' | 'failed';
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  duration_ms: number | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  traces: ApiTraceStep[];
}

export interface ApiLogSummary {
  query_count: number;
  success_count: number;
  failed_count: number;
  success_rate: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  average_duration_ms: number | null;
}

export type SseEvent =
  | { event: 'meta'; data: { conversation_id: string; trace_id: string; app_id: string; knowledge_base_ids: string[] } }
  | { event: 'citations'; data: { items: ApiCitation[] } }
  | { event: 'token'; data: { text: string } }
  | { event: 'done'; data: { message_id: string; input_tokens: number | null; output_tokens: number | null; total_tokens: number | null; duration_ms: number; simulated: boolean; simulation: { llm: boolean; retrieval: boolean } } }
  | { event: 'error'; data: { detail: string; trace_id: string } };

export async function streamChat(
  appId: string,
  payload: { message: string; conversation_id?: string; knowledge_base_ids?: string[] },
  onEvent: (event: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const accessToken = window.localStorage.getItem('fde-access-token');
  const response = await fetch(`${API_BASE_URL}/apps/${appId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Demo-Role': currentRole(), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: string };
    throw new ApiError(response.status, body.detail ?? `请求失败（HTTP ${response.status}）`);
  }
  if (!response.body) throw new ApiError(500, '浏览器未提供流式响应体');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const consume = (block: string) => {
    const lines = block.replace(/\r/g, '').split('\n');
    const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
    const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
    if (event && data) onEvent({ event, data: JSON.parse(data) } as SseEvent);
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? '';
    blocks.forEach(consume);
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
}

export function formatDateTime(value: string | null): string {
  if (!value) return '尚未测试';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '发生未知错误';
}
