import { Bot, Copy, GitBranch, LayoutTemplate, MessageSquare, MoreHorizontal, Plus, Search, Sparkles, Wand2, Workflow } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { APP_TYPE_META, APPS, SCENES, STATUS_META, type AppType, type SceneKey } from '../data/mock';
import { Dev, Field, Modal, Tag, Tile, useToast } from '../components/ui';

export const TYPE_ICON: Record<AppType, ReactNode> = {
  simple: <MessageSquare size={18} />,
  chatflow: <Workflow size={18} />,
  agent: <Bot size={18} />,
};

const TEMPLATES: { name: string; type: AppType; scene: SceneKey; desc: string; icon: string; color: string; target: string }[] = [
  { name: '研究报告撰写', type: 'chatflow', scene: 'report', desc: '表单收集需求 → 检索 → 大纲确认 → 分章节撰写 → 导出 Word', icon: 'FileText', color: '#3370ff', target: 'app-report' },
  { name: '经营分析周报', type: 'chatflow', scene: 'report', desc: '查询经营数据 → 指标对比 → 归因分析 → 按模板成文', icon: 'CalendarCheck', color: '#3370ff', target: 'app-weekly' },
  { name: '智能客服', type: 'agent', scene: 'service', desc: '知识库 + 订单查询 + 工单创建 + 转人工', icon: 'Headset', color: '#12b76a', target: 'app-service' },
  { name: '合同风险审校', type: 'chatflow', scene: 'review', desc: '文档解析 → 合同分类 → 条款比对 → 风险分级', icon: 'ShieldCheck', color: '#f79009', target: 'app-contract' },
  { name: '制度问答', type: 'simple', scene: 'office', desc: '基于制度库问答，强制引用原文', icon: 'BookOpen', color: '#7a5af8', target: 'app-policy' },
  { name: '多渠道文案', type: 'simple', scene: 'marketing', desc: '表单输入卖点与渠道，一次生成多版本', icon: 'Megaphone', color: '#dd2590', target: 'app-marketing' },
  { name: '销售陪练', type: 'agent', scene: 'marketing', desc: '扮演客户提出异议，基于案例库点评话术', icon: 'Target', color: '#0e9384', target: 'app-sales' },
  { name: '会议纪要', type: 'simple', scene: 'office', desc: '转写稿 → 结论、待办、负责人', icon: 'NotebookPen', color: '#7a5af8', target: 'app-minutes' },
];

const BLANK_TARGET: Record<AppType, string> = { simple: 'app-minutes', chatflow: 'app-weekly', agent: 'app-sales' };

function CreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<'blank' | 'template' | 'ai'>('template');
  const [type, setType] = useState<AppType>('chatflow');
  const [brief, setBrief] = useState('客服部门需要一个售后助手：回答保修和退换货政策，能按订单号查物流，用户要求时创建维修工单，涉及赔偿或投诉转人工。');
  const [plan, setPlan] = useState(false);

  return (
    <Modal open={open} title="新建应用" onClose={onClose} wide
      footer={mode === 'template' ? null : <><button className="btn" onClick={onClose}>取消</button>
        {mode === 'blank' ? <button className="btn primary" onClick={() => navigate(`/apps/${BLANK_TARGET[type]}`)}>创建</button> : null}
        {mode === 'ai' && !plan ? <button className="btn primary" onClick={() => setPlan(true)}><Wand2 size={15} />生成方案</button> : null}
        {mode === 'ai' && plan ? <button className="btn primary" onClick={() => { toast('已按方案创建 Agent 应用'); navigate('/apps/app-service'); }}>按此方案创建</button> : null}</>}>
      <div className="seg" style={{ marginBottom: 18 }}>
        <button className={mode === 'template' ? 'active' : ''} onClick={() => setMode('template')}><LayoutTemplate size={14} />从业务模板</button>
        <button className={mode === 'blank' ? 'active' : ''} onClick={() => setMode('blank')}><Plus size={14} />空白应用</button>
        <button className={mode === 'ai' ? 'active' : ''} onClick={() => setMode('ai')}><Sparkles size={14} />AI 帮我搭建<Dev s="partial" note="现有 designer 只出 v1" /></button>
      </div>

      {mode === 'template' ? (
        <div className="grid c2" style={{ gap: 12 }}>
          {TEMPLATES.map((t) => (
            <button key={t.name} className="method-card" onClick={() => { toast(`已从模板「${t.name}」创建`); navigate(`/apps/${t.target}`); }}>
              <Tile icon={t.icon} color={t.color} />
              <div className="grow">
                <h4>{t.name}<Tag tone={APP_TYPE_META[t.type].color}>{APP_TYPE_META[t.type].tag}</Tag></h4>
                <p>{t.desc}</p>
                <p style={{ marginTop: 4 }}><span className="dot" style={{ color: SCENES.find((s) => s.key === t.scene)?.color, marginRight: 4 }} />{SCENES.find((s) => s.key === t.scene)?.name}</p>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {mode === 'blank' ? <>
        <Field label="应用类型" required>
          <div className="grid c3" style={{ gap: 12 }}>
            {(Object.keys(APP_TYPE_META) as AppType[]).map((k) => (
              <button key={k} className={`method-card ${type === k ? 'active' : ''}`} style={{ flexDirection: 'column' }} onClick={() => setType(k)}>
                <div className="row" style={{ color: 'var(--primary)' }}>{TYPE_ICON[k]}<h4 style={{ color: 'var(--text-1)' }}>{APP_TYPE_META[k].name}</h4></div>
                <p>{APP_TYPE_META[k].desc}</p>
                <p style={{ marginTop: 6, color: 'var(--text-2)' }}>{k === 'simple' ? '例：制度问答、文案生成、纪要整理' : k === 'chatflow' ? '例：报告撰写、合同审校、审批助手' : '例：智能客服、数据分析、销售陪练'}</p>
              </button>
            ))}
          </div>
        </Field>
        <div className="form-grid">
          <Field label="应用名称" required><input className="input" placeholder="例如：华东区经营周报" /></Field>
          <Field label="业务场景"><select className="select">{SCENES.map((s) => <option key={s.key}>{s.name}</option>)}</select></Field>
        </div>
      </> : null}

      {mode === 'ai' ? <>
        <Field label="描述你的业务需求" hint="谁用、做什么、需要哪些数据和系统"><textarea className="textarea" style={{ minHeight: 100 }} value={brief} onChange={(e) => { setBrief(e.target.value); setPlan(false); }} /></Field>
        {plan ? (
          <div className="card pad" style={{ background: 'var(--bg-soft)' }}>
            <div className="row" style={{ marginBottom: 10 }}><Sparkles size={16} color="var(--purple)" /><strong>建议方案：Agent 应用</strong><Tag tone="teal">Agent</Tag><span className="faint">需要按用户意图自主选择工具，适合 Agent</span></div>
            <div className="grid c2" style={{ gap: 12, fontSize: 13 }}>
              <div><div className="faint">知识库</div>售后服务政策、产品手册与 FAQ</div>
              <div><div className="faint">工具</div>订单查询、创建售后工单、转人工</div>
              <div><div className="faint">转人工规则</div>赔偿、投诉、连续 2 次未解决</div>
              <div><div className="faint">评测用例</div>已生成 12 条（政策 6 / 订单 3 / 转人工 3）</div>
            </div>
          </div>
        ) : null}
      </> : null}
    </Modal>
  );
}

export function AppsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [type, setType] = useState<AppType | 'all'>('all');
  const [scene, setScene] = useState<SceneKey | 'all'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => { if (params.get('create')) { setOpen(true); setParams({}, { replace: true }); } }, [params, setParams]);

  const list = APPS.filter((a) => (type === 'all' || a.type === type) && (scene === 'all' || a.scene === scene) && (!q || a.name.includes(q)));

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow"><h1>应用</h1><p>搭建、调试和发布 AI 应用。发布后出现在业务人员的工作台。</p></div>
        <button className="btn primary" onClick={() => setOpen(true)}><Plus size={16} />新建应用</button>
      </div>
      <div className="row" style={{ marginBottom: 16 }}>
        <div className="seg">
          <button className={type === 'all' ? 'active' : ''} onClick={() => setType('all')}>全部</button>
          {(Object.keys(APP_TYPE_META) as AppType[]).map((k) => <button key={k} className={type === k ? 'active' : ''} onClick={() => setType(k)}>{TYPE_ICON[k]}{APP_TYPE_META[k].name}</button>)}
        </div>
        <select className="select sm" style={{ width: 150 }} value={scene} onChange={(e) => setScene(e.target.value as SceneKey | 'all')}>
          <option value="all">全部场景</option>{SCENES.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
        </select>
        <span className="grow" />
        <div className="search-box" style={{ width: 240 }}><Search size={15} /><input className="input sm" placeholder="搜索应用" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="grid auto">
        {list.map((a) => (
          <article key={a.id} className="card pad hover" onClick={() => navigate(`/apps/${a.id}`)}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Tile icon={a.icon} color={a.color} size="lg" />
              <div className="grow">
                <strong style={{ fontSize: 15 }}>{a.name}</strong>
                <div className="row" style={{ marginTop: 4 }}>
                  <Tag tone={APP_TYPE_META[a.type].color}>{APP_TYPE_META[a.type].tag}</Tag>
                  <Tag tone={STATUS_META[a.status].tone}><span className="dot" />{STATUS_META[a.status].name}{a.version ? ` · ${a.version}` : ''}</Tag>
                </div>
              </div>
              <button className="btn ghost sm icon" aria-label="更多" onClick={(e) => e.stopPropagation()}><MoreHorizontal size={16} /></button>
            </div>
            <p className="muted clamp-2" style={{ fontSize: 13, margin: '10px 0 12px', minHeight: 42 }}>{a.desc}</p>
            <div className="row faint" style={{ gap: 14 }}>
              {a.status === 'draft' ? <span>尚未发布</span> : <>
                <span>7 天 <strong style={{ color: 'var(--text-1)' }}>{a.stats.runs7d.toLocaleString()}</strong> 次</span>
                <span>满意度 <strong style={{ color: 'var(--text-1)' }}>{a.stats.satisfaction}%</strong></span>
              </>}
              <span className="grow" />
              <span>{a.owner.split(' · ')[1]} · {a.updatedAt}</span>
            </div>
            <div className="divider" style={{ margin: '12px 0 10px' }} />
            <div className="row" onClick={(e) => e.stopPropagation()}>
              <button className="btn sm" onClick={() => navigate(`/apps/${a.id}`)}>{a.type === 'simple' ? <MessageSquare size={13} /> : <GitBranch size={13} />}编排</button>
              <button className="btn sm ghost" onClick={() => navigate(`/chat/${a.id}`)}>试用</button>
              <span className="grow" />
              <button className="btn sm ghost icon" aria-label="复制应用"><Copy size={14} /></button>
            </div>
          </article>
        ))}
      </div>
      <CreateModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
