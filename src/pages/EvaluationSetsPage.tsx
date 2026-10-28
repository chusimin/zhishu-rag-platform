import { AlertCircle, CheckCircle2, ChevronRight, ClipboardCheck, FlaskConical, Play, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, errorMessage, type ApiEvaluationCase, type ApiEvaluationRun, type ApiEvaluationSet, type ApiQAApp } from '../api/client';
import { Badge, Button, Drawer, Modal, Notice, PageHeader, StatCard } from '../components/ui';
import { useToast } from '../components/Toast';

function splitLines(value: string) {
  return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
}

export function EvaluationSetsPage() {
  const { showToast } = useToast();
  const [sets, setSets] = useState<ApiEvaluationSet[]>([]);
  const [apps, setApps] = useState<ApiQAApp[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<ApiEvaluationSet | null>(null);
  const [editing, setEditing] = useState<ApiEvaluationCase | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ app_id: '', name: '', description: '' });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadList = useCallback(async () => {
    try {
      const [loadedSets, loadedApps] = await Promise.all([
        apiFetch<ApiEvaluationSet[]>('/evaluation-sets'),
        apiFetch<ApiQAApp[]>('/apps'),
      ]);
      setSets(loadedSets);
      setApps(loadedApps);
      setSelectedId((current) => current && loadedSets.some((item) => item.id === current) ? current : loadedSets[0]?.id ?? '');
      setCreateForm((current) => ({ ...current, app_id: current.app_id || loadedApps[0]?.id || '' }));
      setError('');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) {
      setDetail(null);
      return;
    }
    try {
      setDetail(await apiFetch<ApiEvaluationSet>(`/evaluation-sets/${id}`));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { void loadDetail(selectedId); }, [loadDetail, selectedId]);

  const visibleSets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? sets.filter((item) => `${item.name} ${item.app_name} ${item.description}`.toLowerCase().includes(term)) : sets;
  }, [search, sets]);
  const totalCases = sets.reduce((sum, item) => sum + item.case_count, 0);
  const pendingCases = sets.reduce((sum, item) => sum + item.needs_standard_count, 0);

  const createSet = async () => {
    if (!createForm.app_id || !createForm.name.trim()) return;
    setBusy(true);
    try {
      const created = await apiFetch<ApiEvaluationSet>('/evaluation-sets', { method: 'POST', body: JSON.stringify(createForm) });
      setCreateOpen(false);
      setCreateForm((current) => ({ ...current, name: '', description: '' }));
      await loadList();
      setSelectedId(created.id);
      showToast('评测集已创建');
    } catch (caught) {
      showToast(errorMessage(caught), 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveCase = async () => {
    if (!editing || !detail) return;
    setBusy(true);
    try {
      await apiFetch(`/evaluation-sets/${detail.id}/cases/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editing.name,
          message: editing.message,
          expected_output: editing.expected_output,
          expected_keywords: editing.expected_keywords,
          forbidden_keywords: editing.forbidden_keywords,
          require_citations: editing.require_citations,
          tags: editing.tags,
        }),
      });
      setEditing(null);
      await Promise.all([loadDetail(detail.id), loadList()]);
      showToast('Case 标准已保存');
    } catch (caught) {
      showToast(errorMessage(caught), 'error');
    } finally {
      setBusy(false);
    }
  };

  const runSet = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const run = await apiFetch<ApiEvaluationRun>(`/evaluation-sets/${detail.id}/run`, { method: 'POST' });
      await Promise.all([loadDetail(detail.id), loadList()]);
      showToast(`评测完成：${run.passed_count} 通过，${run.failed_count} 失败`, run.failed_count ? 'info' : 'success');
    } catch (caught) {
      showToast(errorMessage(caught), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page page-enter">
      <PageHeader eyebrow="质量评测" title="评测集" description="汇总线上 Good / Bad Case，补齐可执行标准，并对绑定应用运行回归评测。" actions={<><Link className="button button--secondary" to="/logs">查看线上日志</Link><Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>新建评测集</Button></>} />
      {error ? <Notice tone="error" title="评测集读取失败">{error}</Notice> : null}
      <div className="stat-grid evaluation-stats"><StatCard label="评测集" value={sets.length.toLocaleString()} detail="按应用隔离运行" icon={<FlaskConical size={20} />} /><StatCard label="全部 Case" value={totalCases.toLocaleString()} detail={`${totalCases - pendingCases} 个可运行`} icon={<ClipboardCheck size={20} />} /><StatCard label="待补标准" value={pendingCases.toLocaleString()} detail="补齐前禁止评测" icon={<AlertCircle size={20} />} /><StatCard label="最近通过" value={sets.filter((item) => item.latest_run?.failed_count === 0).length.toLocaleString()} detail="以各评测集最近一次为准" icon={<CheckCircle2 size={20} />} /></div>
      <div className="evaluation-layout">
        <aside className="card evaluation-sidebar">
          <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索评测集或应用" aria-label="搜索评测集" /></label>
          <div className="evaluation-set-list">{visibleSets.map((item) => <button key={item.id} className={selectedId === item.id ? 'active' : ''} onClick={() => setSelectedId(item.id)}><span><strong>{item.name}</strong><small>{item.app_name} · {item.case_count} Cases</small></span>{item.needs_standard_count ? <Badge tone="warning">{item.needs_standard_count} 待补</Badge> : <ChevronRight size={16} />}</button>)}</div>
          {!loading && !visibleSets.length ? <div className="evaluation-empty"><FlaskConical size={24} /><strong>暂无评测集</strong><small>从线上日志保存 Case，或先新建空评测集。</small></div> : null}
        </aside>
        <section className="card evaluation-detail">
          {detail ? <>
            <header className="evaluation-detail-head"><div><div className="eyebrow">{detail.app_name}</div><h2>{detail.name}</h2><p>{detail.description || '暂无说明'}</p></div><div><Badge tone={detail.needs_standard_count ? 'warning' : 'success'}>{detail.needs_standard_count ? `${detail.needs_standard_count} 个待补标准` : '全部可运行'}</Badge><Button variant="primary" icon={<Play size={15} />} disabled={busy || detail.case_count === 0 || detail.needs_standard_count > 0} onClick={runSet}>{busy ? '运行中…' : '运行评测'}</Button></div></header>
            {detail.needs_standard_count ? <Notice tone="warning" title="评测暂不可运行">先补齐所有 Bad Case 的期望输出、关键词、禁止关键词或引用要求，避免无标准评测产生假通过。</Notice> : null}
            <div className="evaluation-case-list">{detail.cases?.map((item) => <button key={item.id} onClick={() => setEditing(item)}><span className={`case-type case-type--${item.case_type}`}>{item.case_type === 'good' ? 'GOOD' : item.case_type === 'bad' ? 'BAD' : 'MANUAL'}</span><span className="case-main"><strong>{item.name}</strong><small>{item.message}</small><em>{item.source_trace_id ? `Trace ${item.source_trace_id.slice(0, 8)}` : '手动 Case'}{item.tags.length ? ` · ${item.tags.join(' / ')}` : ''}</em></span><Badge tone={item.readiness === 'ready' ? 'success' : 'warning'}>{item.readiness === 'ready' ? '可运行' : '待补标准'}</Badge><ChevronRight size={16} /></button>)}</div>
            {!detail.case_count ? <div className="evaluation-empty large"><ClipboardCheck size={30} /><strong>评测集还没有 Case</strong><small>前往运行日志，选择同一应用的 Trace 保存为 Good 或 Bad Case。</small><Link className="button button--primary" to="/logs">前往运行日志</Link></div> : null}
            {detail.latest_run ? <section className="evaluation-run"><header><div><strong>最近一次评测</strong><small>{new Date(detail.latest_run.created_at).toLocaleString('zh-CN')}{detail.latest_run.simulated ? ' · 包含测试替身' : ''}</small></div><Badge tone={detail.latest_run.failed_count ? 'error' : 'success'}>{detail.latest_run.passed_count} 通过 / {detail.latest_run.failed_count} 失败</Badge></header>{detail.latest_run.results.map((result) => <div key={result.case_id}><span>{result.passed ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}</span><div><strong>{result.name}</strong><small>{result.passed ? '通过全部断言' : result.reasons.join('；')}</small></div></div>)}</section> : null}
          </> : <div className="evaluation-empty large"><FlaskConical size={30} /><strong>选择一个评测集</strong><small>查看 Case、来源快照和最近运行结果。</small></div>}
        </section>
      </div>

      <Modal open={createOpen} title="新建评测集" description="评测集绑定一个应用，Case 只从该应用的日志回流。" onClose={() => !busy && setCreateOpen(false)} footer={<><Button disabled={busy} onClick={() => setCreateOpen(false)}>取消</Button><Button variant="primary" disabled={busy || !createForm.app_id || !createForm.name.trim()} onClick={createSet}>{busy ? '创建中…' : '创建'}</Button></>}>
        <label className="form-label">绑定应用<select className="field" value={createForm.app_id} onChange={(event) => setCreateForm((current) => ({ ...current, app_id: event.target.value }))}><option value="">请选择应用</option>{apps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label>
        <label className="form-label">评测集名称<input className="field" value={createForm.name} onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))} placeholder="例如：10 月线上 Bad Case 回归" /></label>
        <label className="form-label">说明<textarea className="field" value={createForm.description} onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))} placeholder="说明来源、范围和使用方式" /></label>
      </Modal>

      <Drawer open={Boolean(editing)} title={editing?.name ?? 'Case 详情'} description={editing?.source_trace_id ? `来源 Trace ${editing.source_trace_id}` : '手动 Case'} onClose={() => !busy && setEditing(null)} footer={<><Button disabled={busy} onClick={() => setEditing(null)}>取消</Button><Button variant="primary" disabled={busy} onClick={saveCase}>{busy ? '保存中…' : '保存标准'}</Button></>}>
        {editing ? <div className="case-editor">
          <div className="case-editor-meta"><Badge tone={editing.case_type === 'good' ? 'success' : 'error'}>{editing.case_type === 'good' ? 'Good Case' : editing.case_type === 'bad' ? 'Bad Case' : 'Manual Case'}</Badge><Badge tone={editing.readiness === 'ready' ? 'success' : 'warning'}>{editing.readiness === 'ready' ? '可运行' : '待补标准'}</Badge></div>
          <label className="form-label">Case 名称<input className="field" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
          <label className="form-label">输入<textarea className="field" value={editing.message} onChange={(event) => setEditing({ ...editing, message: event.target.value })} /></label>
          <label className="form-label">线上实际输出<textarea className="field case-output" value={editing.actual_output} disabled /></label>
          <label className="form-label">标准答案<textarea className="field case-output" value={editing.expected_output} onChange={(event) => setEditing({ ...editing, expected_output: event.target.value })} placeholder="可填写期望完整输出；若同时设置关键词断言，则完整输出只作为参考。" /></label>
          <div className="inline-fields"><label className="form-label">期望关键词<textarea className="field compact-textarea" value={editing.expected_keywords.join('\n')} onChange={(event) => setEditing({ ...editing, expected_keywords: splitLines(event.target.value) })} placeholder="每行一个" /></label><label className="form-label">禁止关键词<textarea className="field compact-textarea" value={editing.forbidden_keywords.join('\n')} onChange={(event) => setEditing({ ...editing, forbidden_keywords: splitLines(event.target.value) })} placeholder="每行一个" /></label></div>
          <label className="check-card compact"><input type="checkbox" checked={editing.require_citations} onChange={(event) => setEditing({ ...editing, require_citations: event.target.checked })} /><span><strong>必须包含引用</strong><small>输出没有引用来源时判定失败。</small></span></label>
          <label className="form-label">标签<input className="field" value={editing.tags.join(', ')} onChange={(event) => setEditing({ ...editing, tags: splitLines(event.target.value) })} placeholder="用逗号分隔" /></label>
          <details className="source-snapshot"><summary>查看来源快照与 Trace</summary><div><span>应用</span><strong>{editing.source_snapshot.application?.name ?? '—'}</strong><span>模型</span><strong>{editing.source_snapshot.model?.model ?? '—'}</strong><span>渠道</span><strong>{editing.source_snapshot.channel ?? '—'}</strong><span>时间</span><strong>{editing.source_snapshot.started_at ? new Date(editing.source_snapshot.started_at).toLocaleString('zh-CN') : '—'}</strong></div>{editing.source_snapshot.trace?.map((step) => <section key={`${step.ordinal}-${step.name}`}><header><strong>{step.ordinal}. {step.name}</strong><Badge tone={step.status === 'success' ? 'success' : 'error'}>{step.status}</Badge></header><p>{step.detail}</p><pre>{JSON.stringify(step.metadata, null, 2)}</pre></section>)}</details>
        </div> : null}
      </Drawer>
    </main>
  );
}
