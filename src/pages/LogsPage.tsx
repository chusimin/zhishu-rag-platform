import { AlertCircle, CheckCircle2, ChevronRight, Clock3, Coins, Filter, Gauge, Search, ThumbsDown, ThumbsUp, TimerReset } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, errorMessage, type ApiEvaluationSet, type ApiLogSummary, type ApiQueryLog } from '../api/client';
import { Badge, Button, Drawer, Modal, Notice, PageHeader, StatCard } from '../components/ui';
import { useToast } from '../components/Toast';

type StatusFilter = '全部' | '成功' | '失败';
type CaseType = 'good' | 'bad';
type ReturnState = { logs: ApiQueryLog[]; caseType: CaseType } | null;

export function LogsPage() {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<ApiQueryLog[]>([]);
  const [summary, setSummary] = useState<ApiLogSummary | null>(null);
  const [evaluationSets, setEvaluationSets] = useState<ApiEvaluationSet[]>([]);
  const [status, setStatus] = useState<StatusFilter>('全部');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ApiQueryLog | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [returnState, setReturnState] = useState<ReturnState>(null);
  const [targetSetId, setTargetSetId] = useState('');
  const [newSetName, setNewSetName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50', offset: String(offset) });
      if (status !== '全部') params.set('status', status === '成功' ? 'success' : 'failed');
      if (search.trim()) params.set('search', search.trim());
      const [loadedLogs, loadedSummary, loadedSets] = await Promise.all([
        apiFetch<ApiQueryLog[]>(`/logs?${params}`),
        apiFetch<ApiLogSummary>('/logs/summary'),
        apiFetch<ApiEvaluationSet[]>('/evaluation-sets'),
      ]);
      setLogs(loadedLogs);
      setSummary(loadedSummary);
      setEvaluationSets(loadedSets);
      setChecked((current) => new Set([...current].filter((id) => loadedLogs.some((log) => log.id === id))));
      setError('');
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [offset, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const statusLabel = (value: ApiQueryLog['status']) => value === 'success' ? '成功' : value === 'failed' ? '失败' : '运行中';
  const checkedLogs = useMemo(() => logs.filter((log) => checked.has(log.id)), [checked, logs]);
  const eligibleSets = useMemo(() => {
    const appId = returnState?.logs[0]?.app_id;
    return appId ? evaluationSets.filter((item) => item.app_id === appId) : [];
  }, [evaluationSets, returnState]);

  const openReturn = (items: ApiQueryLog[], caseType: CaseType) => {
    const appIds = new Set(items.map((item) => item.app_id).filter(Boolean));
    if (!items.length) return;
    if (appIds.size !== 1 || items.some((item) => !item.app_id)) {
      showToast('批量回流必须选择同一应用且应用仍然存在的日志', 'error');
      return;
    }
    const matches = evaluationSets.filter((item) => item.app_id === items[0].app_id);
    setReturnState({ logs: items, caseType });
    setTargetSetId(matches[0]?.id ?? '__new__');
    setNewSetName(`${new Date().toLocaleDateString('zh-CN')} 线上 Case`);
  };

  const saveCases = async () => {
    if (!returnState) return;
    setSaving(true);
    try {
      let suiteId = targetSetId;
      if (suiteId === '__new__' || !suiteId) {
        if (!newSetName.trim()) throw new Error('请输入新评测集名称');
        const created = await apiFetch<ApiEvaluationSet>('/evaluation-sets', {
          method: 'POST',
          body: JSON.stringify({ app_id: returnState.logs[0].app_id, name: newSetName.trim(), description: '从线上运行日志手动回流' }),
        });
        suiteId = created.id;
      }
      await apiFetch(`/evaluation-sets/${suiteId}/cases/from-logs`, {
        method: 'POST',
        body: JSON.stringify({ trace_ids: returnState.logs.map((item) => item.trace_id), case_type: returnState.caseType }),
      });
      showToast(`已保存 ${returnState.logs.length} 条 ${returnState.caseType === 'good' ? 'Good' : 'Bad'} Case`);
      setReturnState(null);
      setChecked(new Set());
      await load();
    } catch (caught) {
      showToast(errorMessage(caught), 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleChecked = (id: string) => setChecked((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <main className="page page-enter">
      <PageHeader eyebrow="可观测性" title="运行日志" description="查看用户查询、Token 消耗和完整 Trace，并把线上 Good / Bad Case 回流到评测集。" actions={<Button icon={<TimerReset size={16} />} onClick={load}>刷新</Button>} />
      {error ? <Notice tone="error" title="无法读取日志">{error}</Notice> : null}
      <div className="stat-grid log-stats"><StatCard label="查询总数" value={(summary?.query_count ?? 0).toLocaleString()} detail={`${summary?.failed_count ?? 0} 次失败`} icon={<Search size={20} />} /><StatCard label="总 Tokens" value={(summary?.total_tokens ?? 0).toLocaleString()} detail={`输入 ${(summary?.input_tokens ?? 0).toLocaleString()} · 输出 ${(summary?.output_tokens ?? 0).toLocaleString()}`} icon={<Coins size={20} />} /><StatCard label="平均耗时" value={summary?.average_duration_ms == null ? '—' : `${(summary.average_duration_ms / 1000).toFixed(2)}s`} detail="仅统计已记录请求" icon={<Gauge size={20} />} /><StatCard label="成功率" value={`${(summary?.success_rate ?? 0).toFixed(1)}%`} detail={`${summary?.success_count ?? 0} 次成功`} icon={<CheckCircle2 size={20} />} /></div>
      <div className="toolbar log-toolbar"><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); }} aria-label="搜索查询内容" placeholder="搜索查询内容或 Trace ID" /></label><div className="tabs" role="tablist" aria-label="日志状态筛选">{(['全部', '成功', '失败'] as const).map((item) => <button className="tab" role="tab" aria-selected={status === item} key={item} onClick={() => { setStatus(item); setOffset(0); }}>{item}</button>)}</div>{checkedLogs.length ? <div className="case-batch-actions"><span>已选 {checkedLogs.length} 条</span><Button icon={<ThumbsUp size={15} />} onClick={() => openReturn(checkedLogs, 'good')}>Good Case</Button><Button icon={<ThumbsDown size={15} />} onClick={() => openReturn(checkedLogs, 'bad')}>Bad Case</Button></div> : <Button icon={<Filter size={16} />} onClick={load}>重新读取</Button>}</div>
      <section className="card table-card"><table className="data-table log-table"><thead><tr><th className="selection-cell"><input type="checkbox" aria-label="选择当前页全部日志" checked={logs.length > 0 && checked.size === logs.length} onChange={(event) => setChecked(event.target.checked ? new Set(logs.map((item) => item.id)) : new Set())} /></th><th>时间 / Trace</th><th>查询内容</th><th>应用</th><th>Tokens</th><th>耗时</th><th>状态</th><th><span className="sr-only">查看详情</span></th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} className={checked.has(log.id) ? 'is-selected' : ''} onClick={() => setSelected(log)}><td className="selection-cell" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`选择 ${log.query}`} checked={checked.has(log.id)} onChange={() => toggleChecked(log.id)} /></td><td><span className="trace-cell"><strong>{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(log.started_at))}</strong><small>{log.trace_id.slice(0, 8)}</small></span></td><td><button className="log-query" onClick={() => setSelected(log)}>{log.query}</button></td><td>{log.app_name ?? '已删除应用'}</td><td className="mono">{log.total_tokens == null ? '—' : log.total_tokens.toLocaleString()}</td><td className="mono">{log.duration_ms == null ? '—' : `${log.duration_ms}ms`}</td><td><Badge tone={log.status === 'success' ? 'success' : log.status === 'failed' ? 'error' : 'warning'}>{statusLabel(log.status)}</Badge></td><td><ChevronRight size={17} /></td></tr>)}</tbody></table><div className="mobile-card-list">{logs.map((log) => <div className={`mobile-data-card log-mobile-card ${checked.has(log.id) ? 'is-selected' : ''}`} key={log.id}><input type="checkbox" aria-label={`选择 ${log.query}`} checked={checked.has(log.id)} onChange={() => toggleChecked(log.id)} /><button onClick={() => setSelected(log)}><span><strong>{log.query}</strong><small>{log.trace_id.slice(0, 8)} · {log.duration_ms ?? '—'}ms</small></span><Badge tone={log.status === 'success' ? 'success' : log.status === 'failed' ? 'error' : 'warning'}>{statusLabel(log.status)}</Badge></button></div>)}</div></section>
      <div className="pagination-bar"><span>第 {Math.floor(offset / 50) + 1} 页 · 每页 50 条</span><div><Button disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - 50))}>上一页</Button><Button disabled={logs.length < 50} onClick={() => setOffset((current) => current + 50)}>下一页</Button></div></div>
      {logs.length === 0 ? <section className="card empty-state"><Search size={28} /><h2>没有匹配的日志</h2><p>完成一次在线问答后，查询与 Trace 会出现在这里。</p></section> : null}
      <Drawer open={Boolean(selected)} title={selected ? `Trace ${selected.trace_id.slice(0, 8)}` : 'Trace 详情'} description={selected ? new Date(selected.started_at).toLocaleString('zh-CN') : undefined} onClose={() => setSelected(null)} footer={selected ? <><Button icon={<ThumbsUp size={15} />} disabled={!selected.app_id} onClick={() => openReturn([selected], 'good')}>保存 Good Case</Button><Button icon={<ThumbsDown size={15} />} disabled={!selected.app_id} onClick={() => openReturn([selected], 'bad')}>保存 Bad Case</Button><Button variant="primary" onClick={() => setSelected(null)}>关闭</Button></> : null}>{selected ? <div className="trace-detail"><div className="trace-query"><span>{selected.status === 'success' ? <CheckCircle2 size={19} /> : <AlertCircle size={19} />}</span><div><strong>{selected.query}</strong><small>{selected.app_name ?? '已删除应用'} · {selected.demo_role}</small></div><Badge tone={selected.status === 'success' ? 'success' : selected.status === 'failed' ? 'error' : 'warning'}>{statusLabel(selected.status)}</Badge></div><div className="trace-metrics"><div><Coins size={16} /><span><strong>{selected.total_tokens == null ? '—' : selected.total_tokens.toLocaleString()}</strong><small>总 Tokens</small></span></div><div><Clock3 size={16} /><span><strong>{selected.duration_ms == null ? '—' : `${selected.duration_ms}ms`}</strong><small>总耗时</small></span></div></div>{selected.error_message ? <div className="trace-error"><AlertCircle size={17} /><div><strong>执行失败</strong><p>{selected.error_message}</p></div></div> : null}<ol className="trace-timeline">{selected.traces.map((trace) => <li key={trace.id}><span>{trace.status === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}</span><div><strong>{trace.name}</strong><small>{trace.detail}</small></div><em>{trace.duration_ms}ms</em></li>)}</ol><div className="trace-footer"><TimerReset size={15} />Token 缺失表示模型服务商未返回用量，系统不会估算或伪造。</div></div> : null}</Drawer>
      <Modal open={Boolean(returnState)} title={`保存为 ${returnState?.caseType === 'good' ? 'Good' : 'Bad'} Case`} description={returnState ? `将 ${returnState.logs.length} 条线上 Trace 回流到同一应用的评测集` : undefined} onClose={() => !saving && setReturnState(null)} footer={<><Button onClick={() => setReturnState(null)} disabled={saving}>取消</Button><Button variant="primary" onClick={saveCases} disabled={saving}>{saving ? '保存中…' : '确认保存'}</Button></>}>
        {returnState?.caseType === 'bad' ? <Notice tone="warning" title="Bad Case 需要评测标准">保存后若没有期望输出或断言，会标记为“待补标准”，不能直接运行评测。</Notice> : <Notice tone="success" title="Good Case 使用本次回答作为参考">默认验证应用可成功执行；本次输出用于人工对照。需要自动判断内容时，可在评测集中补充关键词、禁词或引用要求。</Notice>}
        <label className="form-label">目标评测集<select className="field" value={targetSetId} onChange={(event) => setTargetSetId(event.target.value)}>{eligibleSets.map((item) => <option value={item.id} key={item.id}>{item.name}（{item.case_count} Cases）</option>)}<option value="__new__">＋ 新建评测集</option></select></label>
        {targetSetId === '__new__' || eligibleSets.length === 0 ? <label className="form-label">新评测集名称<input className="field" value={newSetName} onChange={(event) => setNewSetName(event.target.value)} placeholder="例如：10 月线上问题回归集" /></label> : null}
        <div className="return-case-preview"><strong>将保存的 Trace</strong>{returnState?.logs.map((item) => <span key={item.id}><code>{item.trace_id.slice(0, 8)}</code>{item.query}</span>)}</div>
      </Modal>
    </main>
  );
}
