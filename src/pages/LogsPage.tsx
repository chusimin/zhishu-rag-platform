import { AlertCircle, CheckCircle2, ChevronRight, Clock3, Coins, Filter, Gauge, Search, TimerReset } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, errorMessage, type ApiLogSummary, type ApiQueryLog } from '../api/client';
import { Badge, Button, Drawer, Notice, PageHeader, StatCard } from '../components/ui';

type StatusFilter = '全部' | '成功' | '失败';

export function LogsPage() {
  const [logs, setLogs] = useState<ApiQueryLog[]>([]);
  const [summary, setSummary] = useState<ApiLogSummary | null>(null);
  const [status, setStatus] = useState<StatusFilter>('全部');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ApiQueryLog | null>(null);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50', offset: String(offset) });
      if (status !== '全部') params.set('status', status === '成功' ? 'success' : 'failed');
      if (search.trim()) params.set('search', search.trim());
      const [loadedLogs, loadedSummary] = await Promise.all([apiFetch<ApiQueryLog[]>(`/logs?${params}`), apiFetch<ApiLogSummary>('/logs/summary')]);
      setLogs(loadedLogs);
      setSummary(loadedSummary);
      setError('');
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [offset, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);
  const visible = logs;
  const statusLabel = (value: ApiQueryLog['status']) => value === 'success' ? '成功' : value === 'failed' ? '失败' : '运行中';

  return (
    <main className="page page-enter">
      <PageHeader eyebrow="可观测性" title="运行日志" description="查看用户查询、Token 消耗、总耗时以及检索到生成的完整 Trace。" actions={<Button icon={<TimerReset size={16} />} onClick={load}>刷新</Button>} />
      {error ? <Notice tone="error" title="无法读取日志">{error}</Notice> : null}
      <div className="stat-grid log-stats"><StatCard label="查询总数" value={(summary?.query_count ?? 0).toLocaleString()} detail={`${summary?.failed_count ?? 0} 次失败`} icon={<Search size={20} />} /><StatCard label="总 Tokens" value={(summary?.total_tokens ?? 0).toLocaleString()} detail={`输入 ${(summary?.input_tokens ?? 0).toLocaleString()} · 输出 ${(summary?.output_tokens ?? 0).toLocaleString()}`} icon={<Coins size={20} />} /><StatCard label="平均耗时" value={summary?.average_duration_ms == null ? '—' : `${(summary.average_duration_ms / 1000).toFixed(2)}s`} detail="仅统计已记录请求" icon={<Gauge size={20} />} /><StatCard label="成功率" value={`${(summary?.success_rate ?? 0).toFixed(1)}%`} detail={`${summary?.success_count ?? 0} 次成功`} icon={<CheckCircle2 size={20} />} /></div>
      <div className="toolbar log-toolbar"><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); }} aria-label="搜索查询内容" placeholder="搜索查询内容或 Trace ID" /></label><div className="tabs" role="tablist" aria-label="日志状态筛选">{(['全部', '成功', '失败'] as const).map((item) => <button className="tab" role="tab" aria-selected={status === item} key={item} onClick={() => { setStatus(item); setOffset(0); }}>{item}</button>)}</div><Button icon={<Filter size={16} />} onClick={load}>重新读取</Button></div>
      <section className="card table-card"><table className="data-table log-table"><thead><tr><th>时间 / Trace</th><th>查询内容</th><th>应用</th><th>Tokens</th><th>耗时</th><th>状态</th><th><span className="sr-only">查看详情</span></th></tr></thead><tbody>{visible.map((log) => <tr key={log.id} onClick={() => setSelected(log)}><td><span className="trace-cell"><strong>{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(log.started_at))}</strong><small>{log.trace_id.slice(0, 8)}</small></span></td><td><button className="log-query" onClick={() => setSelected(log)}>{log.query}</button></td><td>{log.app_name ?? '已删除应用'}</td><td className="mono">{log.total_tokens == null ? '—' : log.total_tokens.toLocaleString()}</td><td className="mono">{log.duration_ms == null ? '—' : `${log.duration_ms}ms`}</td><td><Badge tone={log.status === 'success' ? 'success' : log.status === 'failed' ? 'error' : 'warning'}>{statusLabel(log.status)}</Badge></td><td><ChevronRight size={17} /></td></tr>)}</tbody></table><div className="mobile-card-list">{visible.map((log) => <button className="mobile-data-card log-mobile-card" key={log.id} onClick={() => setSelected(log)}><span><strong>{log.query}</strong><small>{log.trace_id.slice(0, 8)} · {log.duration_ms ?? '—'}ms</small></span><Badge tone={log.status === 'success' ? 'success' : log.status === 'failed' ? 'error' : 'warning'}>{statusLabel(log.status)}</Badge></button>)}</div></section>
      <div className="pagination-bar"><span>第 {Math.floor(offset / 50) + 1} 页 · 每页 50 条</span><div><Button disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - 50))}>上一页</Button><Button disabled={logs.length < 50} onClick={() => setOffset((current) => current + 50)}>下一页</Button></div></div>
      {visible.length === 0 ? <section className="card empty-state"><Search size={28} /><h2>没有匹配的日志</h2><p>完成一次在线问答后，查询与 Trace 会出现在这里。</p></section> : null}
      <Drawer open={Boolean(selected)} title={selected ? `Trace ${selected.trace_id.slice(0, 8)}` : 'Trace 详情'} description={selected ? new Date(selected.started_at).toLocaleString('zh-CN') : undefined} onClose={() => setSelected(null)} footer={<Button variant="primary" onClick={() => setSelected(null)}>关闭</Button>}>{selected ? <div className="trace-detail"><div className="trace-query"><span>{selected.status === 'success' ? <CheckCircle2 size={19} /> : <AlertCircle size={19} />}</span><div><strong>{selected.query}</strong><small>{selected.app_name ?? '已删除应用'} · {selected.demo_role}</small></div><Badge tone={selected.status === 'success' ? 'success' : selected.status === 'failed' ? 'error' : 'warning'}>{statusLabel(selected.status)}</Badge></div><div className="trace-metrics"><div><Coins size={16} /><span><strong>{selected.total_tokens == null ? '—' : selected.total_tokens.toLocaleString()}</strong><small>总 Tokens</small></span></div><div><Clock3 size={16} /><span><strong>{selected.duration_ms == null ? '—' : `${selected.duration_ms}ms`}</strong><small>总耗时</small></span></div></div>{selected.error_message ? <div className="trace-error"><AlertCircle size={17} /><div><strong>执行失败</strong><p>{selected.error_message}</p></div></div> : null}<ol className="trace-timeline">{selected.traces.map((trace) => <li key={trace.id}><span>{trace.status === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}</span><div><strong>{trace.name}</strong><small>{trace.detail}</small></div><em>{trace.duration_ms}ms</em></li>)}</ol><div className="trace-footer"><TimerReset size={15} />Token 缺失表示模型服务商未返回用量，系统不会估算或伪造。</div></div> : null}</Drawer>
    </main>
  );
}
