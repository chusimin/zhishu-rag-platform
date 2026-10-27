import { ArrowRight, Clock, Lightbulb, Search, Star, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_TYPE_META, APPS, SCENES, type SceneKey } from '../data/mock';
import { Dev, Tag, Tile, useToast } from '../components/ui';

const RECENT = [
  { app: 'app-report', title: '2026 年储能行业竞争格局分析', time: '09:58' },
  { app: 'app-policy', title: '出差深圳住宿标准是多少', time: '昨天' },
  { app: 'app-contract', title: '《年度框架采购合同-华东》审校', time: '昨天' },
  { app: 'app-minutes', title: '10-24 产品评审会纪要', time: '10-24' },
];

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? '早上好' : h < 13 ? '中午好' : h < 18 ? '下午好' : '晚上好';
}

export function WorkbenchPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [scene, setScene] = useState<SceneKey | 'all'>('all');
  const [query, setQuery] = useState('');
  const [starred, setStarred] = useState<string[]>(['app-policy', 'app-report']);

  const visible = useMemo(
    () => APPS.filter((a) => a.status !== 'draft')
      .filter((a) => scene === 'all' || a.scene === scene)
      .filter((a) => !query || `${a.name}${a.desc}`.includes(query)),
    [scene, query],
  );

  const toggleStar = (id: string) => setStarred((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="page" style={{ background: 'linear-gradient(180deg, #eef3ff 0, #fff 220px)' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div className="row" style={{ alignItems: 'flex-end', marginTop: 8 }}>
          <div className="grow">
            <h1 style={{ fontSize: 24, fontWeight: 600 }}>{greeting()}，周敏</h1>
            <p className="muted" style={{ marginTop: 6 }}>选择一个业务应用开始工作，或直接描述你要完成的事。</p>
          </div>
          <Dev s="todo" note="业务门户 + 收藏/最近" />
        </div>

        <form className="search-box" style={{ marginTop: 18, maxWidth: 720 }} onSubmit={(e) => { e.preventDefault(); if (query) navigate('/chat/app-policy'); }}>
          <Search size={17} />
          <input className="input" style={{ height: 46, borderRadius: 12, paddingLeft: 38, fontSize: 15, boxShadow: 'var(--shadow)' }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索应用，例如「报告」「合同」「客服」" />
        </form>

        <div className="row" style={{ marginTop: 28, alignItems: 'flex-start', gap: 24 }}>
          <div className="grow">

            <div className="grid c3" style={{ marginTop: 0, gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
              {SCENES.map((s) => {
                const count = APPS.filter((a) => a.scene === s.key && a.status !== 'draft').length;
                return (
                  <button key={s.key} className="card hover" onClick={() => setScene(scene === s.key ? 'all' : s.key)}
                    style={{ padding: '12px 14px', textAlign: 'left', borderColor: scene === s.key ? s.color : undefined, background: scene === s.key ? `${s.color}0d` : undefined }}>
                    <div className="row"><span style={{ width: 4, height: 16, borderRadius: 2, background: s.color }} /><strong>{s.name}</strong></div>
                    <div className="faint" style={{ marginTop: 6 }}>{s.desc}</div>
                    <div style={{ marginTop: 8, fontSize: 12, color: s.color, fontWeight: 500 }}>{count} 个应用</div>
                  </button>
                );
              })}
            </div>

            <div className="section-title">{scene === 'all' ? '全部应用' : SCENES.find((s) => s.key === scene)?.name}<small>{visible.length} 个</small></div>
            <div className="grid c3">
              {visible.map((a) => {
                const sc = SCENES.find((s) => s.key === a.scene)!;
                return (
                  <article key={a.id} className="card pad hover" onClick={() => navigate(`/chat/${a.id}`)}>
                    <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                      <Tile icon={a.icon} color={a.color} size="lg" />
                      <div className="grow">
                        <strong style={{ fontSize: 15 }} className="ellipsis">{a.name}</strong>
                        <div className="row" style={{ marginTop: 4 }}>
                          <Tag tone={APP_TYPE_META[a.type].color}>{APP_TYPE_META[a.type].tag}</Tag>
                          {a.status === 'testing' ? <Tag tone="orange">内测</Tag> : null}
                        </div>
                      </div>
                      <button className="btn ghost sm icon" aria-label={starred.includes(a.id) ? '取消收藏' : '收藏'} onClick={(e) => { e.stopPropagation(); toggleStar(a.id); toast(starred.includes(a.id) ? '已取消收藏' : '已加入收藏'); }}>
                        <Star size={16} fill={starred.includes(a.id) ? '#fdb022' : 'none'} color={starred.includes(a.id) ? '#fdb022' : 'currentColor'} />
                      </button>
                    </div>
                    <p className="muted clamp-2" style={{ fontSize: 13, marginTop: 10, minHeight: 42 }}>{a.desc}</p>
                    <div className="row faint" style={{ marginTop: 12 }}>
                      <span className="dot" style={{ color: sc.color }} /><span>{sc.name}</span><span>·</span><span>{a.stats.users7d.toLocaleString()} 人在用</span>
                      <span className="grow" />
                      <span style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13 }}>开始使用<ArrowRight size={14} /></span>
                    </div>
                  </article>
                );
              })}
            </div>
            {!visible.length ? <div className="empty">没有匹配的应用，换个关键词试试。</div> : null}
          </div>

          <aside style={{ width: 300, flex: 'none', display: 'flex', flexDirection: 'column', gap: 16, marginTop: 2 }}>
            <div className="card pad">
              <div className="row" style={{ fontWeight: 600, marginBottom: 6 }}><Star size={16} color="#fdb022" />我的收藏</div>
              {starred.map((id) => APPS.find((a) => a.id === id)).filter(Boolean).map((a) => (
                <div key={a!.id} className="list-row" style={{ cursor: 'pointer', padding: '10px 0' }} onClick={() => navigate(`/chat/${a!.id}`)}>
                  <Tile icon={a!.icon} color={a!.color} size="sm" /><span className="grow ellipsis">{a!.name}</span><ArrowRight size={14} className="muted" />
                </div>
              ))}
              {!starred.length ? <p className="faint">点击应用卡片右上角的星标收藏。</p> : null}
            </div>
            <div className="card pad">
              <div className="row" style={{ fontWeight: 600, marginBottom: 6 }}><Clock size={16} className="muted" />最近使用</div>
              {RECENT.map((r) => {
                const a = APPS.find((x) => x.id === r.app)!;
                return (
                  <div key={r.title} className="list-row" style={{ cursor: 'pointer', padding: '10px 0', alignItems: 'flex-start' }} onClick={() => navigate(`/chat/${a.id}`)}>
                    <Tile icon={a.icon} color={a.color} size="sm" />
                    <div className="grow"><div className="ellipsis" style={{ fontSize: 13 }}>{r.title}</div><div className="faint">{a.name} · {r.time}</div></div>
                  </div>
                );
              })}
            </div>
            <div className="card pad" style={{ background: 'linear-gradient(135deg, #f0f4ff, #f4f3ff)', borderColor: 'var(--primary-100)' }}>
              <div className="row" style={{ fontWeight: 600 }}><TrendingUp size={16} color="var(--primary)" />本月业务沉淀</div>
              <div className="grid c2" style={{ gap: 12, marginTop: 12 }}>
                <div><div className="faint">应用调用</div><strong style={{ fontSize: 20 }}>4.2 万</strong></div>
                <div><div className="faint">覆盖员工</div><strong style={{ fontSize: 20 }}>1,286</strong></div>
                <div><div className="faint">新增知识</div><strong style={{ fontSize: 20 }}>2,914 条</strong></div>
                <div><div className="faint">估算节省</div><strong style={{ fontSize: 20 }}>3,180 h</strong></div>
              </div>
            </div>
            <button className="card pad hover" style={{ textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center' }} onClick={() => navigate('/apps?create=1')}>
              <Lightbulb size={20} color="#f79009" />
              <div className="grow"><strong>没有合适的应用？</strong><div className="faint">描述需求，AI 帮你生成第一版</div></div>
              <ArrowRight size={16} className="muted" />
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
