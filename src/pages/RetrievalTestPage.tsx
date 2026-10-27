import { BookOpen, CheckCircle2, ChevronRight, FlaskConical, Play, SearchCheck, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch, errorMessage, type ApiKnowledgeBase, type ApiRetrievalResponse, type ApiRetrievalResult } from '../api/client';
import { KnowledgeNav } from '../components/KnowledgeNav';
import { Badge, Button, Drawer, Notice, PageHeader } from '../components/ui';

export function RetrievalTestPage() {
  const { id = '' } = useParams();
  const [kb, setKb] = useState<ApiKnowledgeBase | null>(null);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ApiRetrievalResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [citation, setCitation] = useState<ApiRetrievalResult | null>(null);
  const [topK, setTopK] = useState(8);
  const [topN, setTopN] = useState(3);
  const [threshold, setThreshold] = useState(0.35);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    apiFetch<ApiKnowledgeBase>(`/knowledge-bases/${id}`).then(setKb).catch((caught) => setError(errorMessage(caught)));
  }, [id]);

  const run = async () => {
    if (!query.trim() || !id) return;
    setRunning(true);
    setError('');
    try {
      setResult(await apiFetch<ApiRetrievalResponse>(`/knowledge-bases/${id}/retrieval-test`, { method: 'POST', body: JSON.stringify({ query: query.trim(), top_k: topK, rerank_top_n: Math.min(topN, topK), score_threshold: threshold }) }));
    } catch (caught) {
      setError(errorMessage(caught));
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  if (!kb) return <main className="page page-enter">{error ? <Notice tone="error" title="无法加载知识库">{error}</Notice> : null}</main>;

  return (
    <div className="workspace-with-resource">
      <KnowledgeNav id={kb.id} name={kb.name} />
      <main className="page page-enter resource-page">
        <PageHeader eyebrow="知识库 / 检索测试" title="检索与 Rerank 测试" description="使用真实 Embedding、pgvector 与已配置的 Rerank 服务检查召回结果。" />
        <div className="retrieval-layout">
          <section className="card retrieval-query"><header><SearchCheck size={19} /><div><h2>测试问题</h2><p>本次只运行检索链路，不调用 LLM。</p></div></header><label className="form-label">查询内容<textarea className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入一个真实用户可能提出的问题" /></label><div className="query-examples"><span>示例问题</span><button onClick={() => setQuery('差旅报销需要哪些凭证？')}>差旅报销需要哪些凭证？</button><button onClick={() => setQuery('年假可以结转到下一年吗？')}>年假可以结转吗？</button></div><Button variant="primary" icon={<Play size={17} />} disabled={!query.trim() || running} onClick={run}>{running ? '检索中…' : '运行检索测试'}</Button>
            <div className="history-block"><header><strong>检索参数</strong></header><label className="form-label">向量召回 Top K<input className="field" type="number" min="1" max="50" value={topK} onChange={(event) => setTopK(Number(event.target.value))} /></label><label className="form-label">Rerank 保留<input className="field" type="number" min="1" max="20" value={topN} onChange={(event) => setTopN(Number(event.target.value))} /></label><label className="form-label">分数阈值<input className="field" type="number" min="-1" max="1" step="0.05" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></label></div>
          </section>
          <section className="retrieval-results"><div className="card parameter-bar"><div><SlidersHorizontal size={17} /><span><strong>当前参数</strong><small>向量召回 Top {topK} → Rerank Top {Math.min(topN, topK)} · 阈值 {threshold}</small></span></div></div>{error ? <Notice tone="error" title="检索失败">{error}</Notice> : null}{running ? <div className="card result-loading"><FlaskConical size={26} /><strong>正在生成查询向量并检索</strong><div className="progress-track"><div className="progress-value loading-progress" /></div></div> : null}
            {result ? <div className="result-list"><div className="result-summary"><span><CheckCircle2 size={17} />召回 {result.recalled_count} 条，返回 {result.returned_count} 条</span><span>{result.total_duration_ms}ms{result.simulated ? ' · 测试替身' : ''}</span></div>{!result.results.length ? <Notice tone="warning" title="没有达到阈值的结果">可降低分数阈值，或检查文档是否已成功生成向量。</Notice> : null}{result.results.map((item, index) => <article className="card retrieval-card" key={item.chunk_id}><header><span className="rank">{index + 1}</span><div><h2>{item.title}</h2><button className="source-link" onClick={() => setCitation(item)}><BookOpen size={14} />{item.filename}{item.page_number ? ` · 第 ${item.page_number} 页` : ''}<ChevronRight size={14} /></button></div><div className="score-stack">{item.rerank_score != null ? <span>Rerank <strong>{item.rerank_score.toFixed(3)}</strong></span> : null}<span>向量 {item.vector_score.toFixed(3)}</span></div></header><p>{item.content}</p><footer><Badge>{item.chunk_id.slice(0, 8)}</Badge>{index === 0 ? <Badge tone="success"><Sparkles size={12} />最高相关</Badge> : null}</footer></article>)}</div> : <Notice tone="info" title="等待测试">输入问题后运行检索，结果会显示向量分数、Rerank 分数和真实耗时。</Notice>}
          </section>
        </div>
        <Drawer open={Boolean(citation)} title="来源分块" description={citation ? `${citation.filename}${citation.page_number ? ` · 第 ${citation.page_number} 页` : ''}` : undefined} onClose={() => setCitation(null)} footer={<Button variant="primary" onClick={() => setCitation(null)}>关闭</Button>}>{citation ? <div className="citation-detail"><div><Badge tone="info">最终分数 {citation.final_score.toFixed(3)}</Badge><Badge>向量 {citation.vector_score.toFixed(3)}</Badge></div><h2>{citation.title}</h2><p>{citation.content}</p><dl><div><dt>所属知识库</dt><dd>{kb.name}</dd></div><div><dt>分块 ID</dt><dd>{citation.chunk_id}</dd></div></dl></div> : null}</Drawer>
      </main>
    </div>
  );
}
