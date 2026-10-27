import { ArrowRight, BookOpen, Bot, Database, Gauge, MessagesSquare, Rocket, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, errorMessage, type ApiKnowledgeBase, type ApiLogSummary, type ApiQAApp, type ApiQueryLog } from '../api/client';
import { Badge, Notice, PageHeader, StatCard } from '../components/ui';
import type { Role } from '../types';

export function DashboardPage({ role }: { role: Role }) {
  const userView = role === 'user';
  const [knowledge, setKnowledge] = useState<ApiKnowledgeBase[]>([]);
  const [apps, setApps] = useState<ApiQAApp[]>([]);
  const [logs, setLogs] = useState<ApiQueryLog[]>([]);
  const [summary, setSummary] = useState<ApiLogSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        if (userView) setApps(await apiFetch<ApiQAApp[]>('/apps'));
        else {
          const [loadedKnowledge, loadedApps, loadedLogs, loadedSummary] = await Promise.all([apiFetch<ApiKnowledgeBase[]>('/knowledge-bases'), apiFetch<ApiQAApp[]>('/apps'), apiFetch<ApiQueryLog[]>('/logs?limit=5'), apiFetch<ApiLogSummary>('/logs/summary')]);
          setKnowledge(loadedKnowledge);
          setApps(loadedApps);
          setLogs(loadedLogs);
          setSummary(loadedSummary);
        }
        setError('');
      } catch (caught) { setError(errorMessage(caught)); }
    };
    void load();
  }, [userView, role]);

  const chunkCount = knowledge.reduce((sum, kb) => sum + kb.chunk_count, 0);
  const readyCount = knowledge.filter((kb) => kb.chunk_count > 0).length;
  const published = apps.filter((app) => app.is_enabled).length;

  return <main className="page page-enter"><PageHeader eyebrow="FDE DELIVERY" title={userView ? '业务应用工作台' : '应用交付总览'} description={userView ? '选择已发布的应用，完成问答、内容生成和业务任务。' : '关注应用交付、知识健康与运行质量，而不只是资源数量。'} actions={userView ? <Link className="button button--primary" to="/portal">全部应用<ArrowRight size={16} /></Link> : <><Link className="button button--secondary" to="/portal"><Rocket size={16} />业务使用端</Link><Link className="button button--primary" to="/studio"><Sparkles size={16} />AI 设计应用</Link></>} />{error ? <Notice tone="error" title="无法读取实时数据">{error}</Notice> : null}{userView ? <div className="portal-app-grid dashboard-app-grid">{apps.map((app) => <Link className="portal-app-card" to={`/portal/apps/${app.id}`} key={app.id}><div className="portal-app-icon"><Bot size={22} /></div><h2>{app.name}</h2><p>{app.description || '企业 AI 应用'}</p><footer><span>打开应用</span><ArrowRight size={17} /></footer></Link>)}</div> : <><div className="stat-grid"><StatCard label="已发布应用" value={`${published} / ${apps.length}`} detail={`${apps.length - published} 个草稿或待交付`} icon={<Rocket size={20} />} /><StatCard label="知识资产" value={knowledge.length.toLocaleString()} detail={`${readyCount} 个知识库 · ${chunkCount.toLocaleString()} 分块`} icon={<Database size={20} />} /><StatCard label="运行次数" value={(summary?.query_count ?? 0).toLocaleString()} detail={`成功率 ${(summary?.success_rate ?? 0).toFixed(1)}%`} icon={<Bot size={20} />} /><StatCard label="平均耗时" value={summary?.average_duration_ms == null ? '—' : `${(summary.average_duration_ms / 1000).toFixed(2)}s`} detail={`${summary?.failed_count ?? 0} 次失败`} icon={<Gauge size={20} />} /></div><div className="dashboard-grid"><section className="card dashboard-panel"><header className="section-header"><div><h2>应用交付状态</h2><p>继续设计、评测或发布应用</p></div><Link className="text-link" to="/apps">全部应用</Link></header><div className="compact-list">{apps.slice(0, 5).map((app) => <Link className="compact-row" to={`/studio?app=${app.id}`} key={app.id}><span className="row-icon"><Bot size={17} /></span><span className="row-main"><strong>{app.name}</strong><small>{app.conversation_count} 个对话 · {app.scenario_type}</small></span><Badge tone={app.is_enabled ? 'success' : 'warning'}>{app.is_enabled ? '已发布' : '待交付'}</Badge></Link>)}</div>{!apps.length ? <div className="empty-state"><Sparkles size={24} /><h2>从第一个业务需求开始</h2><Link className="text-link" to="/studio">打开 AI 设计室</Link></div> : null}</section><section className="card dashboard-panel"><header className="section-header"><div><h2>知识健康</h2><p>实时文件与索引状态</p></div><Link className="text-link" to="/knowledge">管理知识</Link></header><div className="compact-list">{knowledge.slice(0, 5).map((kb) => <Link className="compact-row" to={`/knowledge/${kb.id}`} key={kb.id}><span className="row-icon"><Database size={17} /></span><span className="row-main"><strong>{kb.name}</strong><small>{kb.file_count} 个文件 · {kb.chunk_count} 个分块</small></span><Badge tone={kb.chunk_count > 0 ? 'success' : 'warning'}>{kb.chunk_count > 0 ? '可用' : '待构建'}</Badge></Link>)}</div></section></div></>}{!userView ? <section className="card dashboard-panel"><header className="section-header"><div><h2>最近运行</h2><p>真实 Token、耗时与执行状态</p></div><Link className="text-link" to="/logs">运行与质量</Link></header><div className="compact-list">{logs.slice(0, 5).map((log) => <div className="compact-row" key={log.id}><span className="row-icon"><MessagesSquare size={17} /></span><span className="row-main"><strong>{log.query}</strong><small>{log.total_tokens == null ? 'Token 未返回' : `${log.total_tokens.toLocaleString()} Tokens`} · {log.duration_ms ?? '—'}ms</small></span><Badge tone={log.status === 'success' ? 'success' : log.status === 'failed' ? 'error' : 'warning'}>{log.status === 'success' ? '成功' : log.status === 'failed' ? '失败' : '运行中'}</Badge></div>)}</div></section> : null}{userView && !apps.length ? <section className="card empty-state"><BookOpen size={28} /><h2>暂无已发布应用</h2><p>请联系业务空间管理员完成应用评测与发布。</p></section> : null}</main>;
}
