import { ArrowRight, Headset, MessageCircleWarning, ThumbsUp, Users, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { APPS, KNOWLEDGE_GAPS, LOGS, appById } from '../data/mock';
import { Dev, Tag, Tile, useToast } from '../components/ui';

const DAYS = [{ d: '10-21', v: 4820 }, { d: '10-22', v: 5310 }, { d: '10-23', v: 5980 }, { d: '10-24', v: 6240 }, { d: '10-25', v: 3120 }, { d: '10-26', v: 2870 }, { d: '10-27', v: 6930 }];

export function InsightsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const max = Math.max(...DAYS.map((x) => x.v));
  const ranked = APPS.filter((a) => a.status !== 'draft').sort((a, b) => b.stats.runs7d - a.stats.runs7d);
  return (
    <div className="page">
      <div className="page-head">
        <div className="grow"><h1>运营看板</h1><p>看清 AI 应用在业务中的使用效果，并把未解决的问题沉淀回知识库。</p></div>
        <select className="select" style={{ width: 140 }}><option>最近 7 天</option><option>最近 30 天</option></select>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {[
          { icon: <Zap size={15} />, label: '调用次数', value: '35,270', delta: '+18.2%' },
          { icon: <Users size={15} />, label: '活跃用户', value: '3,107', delta: '+9.4%' },
          { icon: <ThumbsUp size={15} />, label: '满意度', value: '90.6%', delta: '+1.2pt' },
          { icon: <MessageCircleWarning size={15} />, label: '知识命中率', value: '88.9%', delta: '-0.8pt', down: true },
          { icon: <Headset size={15} />, label: '转人工率', value: '6.3%', delta: '-2.1pt' },
        ].map((s) => <div key={s.label} className="card stat"><div className="label">{s.icon}{s.label}</div><div className="value">{s.value}</div><div className={`delta ${s.down ? 'down' : ''}`}>较上周 {s.delta}</div></div>)}
      </div>

      <div className="row" style={{ alignItems: 'stretch', gap: 16, marginTop: 16 }}>
        <div className="card pad grow">
          <div className="row" style={{ marginBottom: 20 }}><strong className="grow">每日调用</strong><span className="faint">全部应用</span></div>
          <div className="bar-chart" style={{ height: 160, marginBottom: 24 }}>
            {DAYS.map((x) => <div key={x.d} style={{ height: `${(x.v / max) * 100}%` }} title={`${x.d}：${x.v.toLocaleString()} 次`}><span>{x.d}</span></div>)}
          </div>
        </div>
        <div className="card pad" style={{ width: 420 }}>
          <strong>应用排行</strong>
          {ranked.slice(0, 5).map((a, i) => (
            <div key={a.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/apps/${a.id}?tab=logs`)}>
              <span className="faint" style={{ width: 14 }}>{i + 1}</span><Tile icon={a.icon} color={a.color} size="sm" />
              <span className="grow ellipsis">{a.name}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{a.stats.runs7d.toLocaleString()}</span>
              <Tag tone={a.stats.satisfaction >= 88 ? 'green' : 'orange'}>{a.stats.satisfaction}%</Tag>
            </div>
          ))}
        </div>
      </div>

      <div className="row" style={{ alignItems: 'stretch', gap: 16, marginTop: 16 }}>
        <div className="card pad grow">
          <div className="row"><strong className="grow">知识缺口<Dev s="todo" note="未命中问题聚类" /></strong><span className="faint">检索无结果或被点踩的问题，按相似问题聚合</span></div>
          <table className="table" style={{ marginTop: 10 }}>
            <thead><tr><th>问题</th><th>次数</th><th>来源应用</th><th>建议补充到</th><th /></tr></thead>
            <tbody>{KNOWLEDGE_GAPS.map((g) => (
              <tr key={g.q}>
                <td>{g.q}</td><td><Tag tone="red">{g.count}</Tag></td><td className="muted">{g.app}</td><td><Tag tone="blue">{g.kb}</Tag></td>
                <td><button className="btn sm" onClick={() => { toast('已带入问题，请补充答案'); navigate('/knowledge/kb-product/import'); }}>补充知识<ArrowRight size={13} /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="card pad" style={{ width: 420 }}>
          <strong>最新差评与转人工</strong>
          {LOGS.filter((l) => l.feedback === 'bad' || l.status !== 'ok').map((l) => (
            <div key={l.id} className="list-row" style={{ alignItems: 'flex-start' }}>
              <Tile icon={appById(l.app)!.icon} color={appById(l.app)!.color} size="sm" />
              <div className="grow"><div style={{ fontSize: 13 }}>{l.question}</div><div className="faint">{appById(l.app)!.name} · {l.time}</div></div>
              {l.status === 'handoff' ? <Tag tone="orange">转人工</Tag> : l.status === 'nohit' ? <Tag tone="red">未命中</Tag> : <Tag tone="red">点踩</Tag>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
