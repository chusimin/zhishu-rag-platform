import { AlertTriangle, ArrowLeft, Bell, CheckCircle2, Copy, FileDown, FileText, LoaderCircle, MessageSquarePlus, Pencil, Send, UploadCloud } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChatPanel } from '../components/ChatPanel';
import { Markdown } from '../components/Markdown';
import { Field, Icon, Switch, Tag, Tile, useToast } from '../components/ui';
import { APP_TYPE_META, appById, APPS, type AppItem } from '../data/mock';

const HISTORY: Record<string, string[]> = {
  'app-report': ['2026 年储能行业竞争格局分析', '华东区域 Q3 经营分析', '工商业储能政策梳理'],
  'app-contract': ['《年度框架采购合同-华东》审校', '《技术服务协议-某园区》审校'],
  'app-service': ['E07 报警怎么处理', '退货运费'],
  'app-policy': ['出差深圳住宿标准', '年假可以跨年吗'],
};

export function ChatRunPage() {
  const { appId = '' } = useParams();
  const app = appById(appId) ?? APPS[0];
  const [session, setSession] = useState(0);
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <aside className="sub-side" style={{ width: 248 }}>
        <Link className="back" to="/workbench"><ArrowLeft size={14} />工作台</Link>
        <div className="row" style={{ padding: '0 6px 12px', alignItems: 'flex-start' }}>
          <Tile icon={app.icon} color={app.color} />
          <div className="grow"><strong style={{ display: 'block' }}>{app.name}</strong><span className="faint">{app.owner}</span></div>
        </div>
        <p className="faint" style={{ padding: '0 6px 12px' }}>{app.desc}</p>
        <button className="btn" style={{ margin: '0 4px 12px' }} onClick={() => setSession((s) => s + 1)}><MessageSquarePlus size={15} />新对话</button>
        <div className="faint" style={{ padding: '0 6px 4px' }}>历史记录</div>
        {(HISTORY[app.id] ?? ['上一次对话']).map((h, i) => <button key={h} className={`sub-link ${i === 0 && session === 0 ? 'active' : ''}`} style={{ fontSize: 13 }}><span className="ellipsis">{h}</span></button>)}
      </aside>
      <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="row" style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <strong>{app.name}</strong><Tag tone={APP_TYPE_META[app.type].color}>{APP_TYPE_META[app.type].tag}</Tag>{app.version ? <span className="faint">线上 {app.version}</span> : <Tag tone="orange">草稿预览</Tag>}
          <span className="grow" />
          <Link to={`/apps/${app.id}`} className="btn sm ghost"><Pencil size={13} />编排</Link>
        </div>
        <div style={{ flex: 1, minHeight: 0 }} key={`${app.id}-${session}`}>
          {app.id === 'app-report' ? <ReportRun app={app} /> : app.id === 'app-contract' ? <ContractRun app={app} /> : <ChatPanel app={app} />}
        </div>
      </section>
    </div>
  );
}

/* --------------------------- 公共：流程进度 --------------------------- */

function useSteps(names: string[], active: boolean, onDone: () => void) {
  const [n, setN] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!active) return undefined;
    setN(0);
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= names.length) { window.clearInterval(t); window.setTimeout(() => done.current(), 300); }
    }, 700);
    return () => window.clearInterval(t);
  }, [active, names.length]);
  return n;
}

function Progress({ names, n }: { names: string[]; n: number }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      {names.map((s, i) => (
        <div key={s} className="row" style={{ fontSize: 13, color: i < n ? 'var(--text-1)' : 'var(--text-4)' }}>
          {i < n ? <CheckCircle2 size={14} color="#12b76a" /> : i === n ? <LoaderCircle size={14} className="spin" color="#3370ff" /> : <span style={{ width: 14 }} />}{s}
        </div>
      ))}
    </div>
  );
}

function Bot({ app, children }: { app: AppItem; children: ReactNode }) {
  return <div className="msg"><span className="who" style={{ background: app.color }}><Icon name={app.icon} size={16} /></span><div style={{ flex: 1, minWidth: 0, maxWidth: 820 }}>{children}</div></div>;
}

function User({ children }: { children: ReactNode }) {
  return <div className="msg user"><span className="who" style={{ background: '#ffd8b5', color: '#93370d', fontSize: 13, fontWeight: 600 }}>周</span><div className="bubble">{children}</div></div>;
}

/* --------------------------- 报告撰写（Chat Flow） --------------------------- */

const OUTLINE = ['行业概况与 2026 年装机预测', '竞争格局：集成商、电芯厂与新进入者', '价格与毛利趋势', '对公司的机会与建议'];

const REPORT_MD = `# 2026 年储能行业竞争格局分析

## 一、行业概况与 2026 年装机预测
2026 年国内新型储能新增装机预计达 **68 GWh**，同比增长约 35%，其中工商业储能占比由 12% 提升至 18%。[1] 驱动因素主要是分时电价峰谷差扩大与容量电价机制落地。[2]

## 二、竞争格局
| 梯队 | 代表企业 | 市场份额 | 核心优势 |
|---|---|---|---|
| 第一梯队 | 头部电芯厂系集成商 | 约 45% | 电芯成本与产能 |
| 第二梯队 | 专业集成商 | 约 30% | 系统设计与渠道 |
| 新进入者 | 光伏逆变器厂商 | 约 15% | 光储一体方案 |

行业集中度持续提升，CR5 由 2025 年的 52% 升至 58%。[3]

## 三、价格与毛利趋势
系统均价降至 **0.62 元/Wh**，较 2025 年下降 18%；集成环节毛利率承压，普遍在 12%–16% 区间。[1]

## 四、对公司的机会与建议
1. 聚焦工商业场景，以「设备 + 能效运营」提升单客价值；
2. 与电芯厂签订长协锁定成本；
3. 在华东、华南建设区域服务中心，把售后响应控制在 24 小时内。`;

function ReportRun({ app }: { app: AppItem }) {
  const toast = useToast();
  const [stage, setStage] = useState(0);
  const [topic, setTopic] = useState('2026 年储能行业竞争格局');
  const [extra, setExtra] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const s1 = ['理解需求', '检索行业研究库（召回 14 条）', '联网搜索最新动态（6 条）', '生成大纲'];
  const s3 = OUTLINE.map((o, i) => `撰写第 ${i + 1} 章：${o}`).concat(['合并全文与参考文献', '导出 Word']);
  const n1 = useSteps(s1, stage === 1, () => setStage(2));
  const n3 = useSteps(s3, stage === 3, () => setStage(4));
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [stage, n1, n3]);

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scroller}>
        <Bot app={app}>
          <div className="bubble" style={{ maxWidth: '100%' }}>{app.opening}</div>
          {stage === 0 ? (
            <div className="card pad" style={{ marginTop: 10, maxWidth: 520 }}>
              <div className="row" style={{ marginBottom: 12 }}><FileText size={16} color="var(--primary)" /><strong>报告需求</strong></div>
              <Field label="报告主题" required><input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} /></Field>
              <div className="form-grid">
                <Field label="读者" required><select className="select"><option>公司管理层</option><option>业务部门</option><option>外部客户</option></select></Field>
                <Field label="篇幅" required><select className="select"><option>约 6000 字</option><option>约 3000 字</option><option>约 10000 字</option></select></Field>
              </div>
              <div className="row form-item"><span className="grow">联网补充最新动态</span><Switch on onChange={() => undefined} label="联网" /></div>
              <button className="btn primary" style={{ width: '100%' }} onClick={() => setStage(1)}>提交</button>
            </div>
          ) : null}
        </Bot>
        {stage >= 1 ? <User>主题：{topic}；读者：公司管理层；篇幅：约 6000 字；联网补充：是</User> : null}
        {stage >= 1 ? (
          <Bot app={app}>
            <div className="bubble" style={{ maxWidth: '100%' }}>
              {stage === 1 ? <Progress names={s1} n={n1} /> : <>
                <div style={{ marginBottom: 8 }}>基于 <strong>14 篇研报</strong> 与 <strong>6 条近期公开信息</strong>，建议大纲如下：</div>
                <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>{OUTLINE.map((o) => <li key={o}>{o}</li>)}</ol>
              </>}
            </div>
            {stage === 2 ? (
              <div className="card pad" style={{ marginTop: 10, maxWidth: 560 }}>
                <textarea className="textarea" style={{ minHeight: 56 }} placeholder="可选：补充要求，例如「第二章加入海外市场对比」" value={extra} onChange={(e) => setExtra(e.target.value)} />
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn primary" onClick={() => setStage(3)}><CheckCircle2 size={15} />确认，开始撰写</button>
                  <button className="btn" onClick={() => { setStage(1); toast('正在按补充要求重新生成大纲'); }}>修改后重新生成</button>
                </div>
              </div>
            ) : null}
          </Bot>
        ) : null}
        {stage >= 3 ? <User>确认大纲，开始撰写{extra ? `（${extra}）` : ''}</User> : null}
        {stage >= 3 ? (
          <Bot app={app}>
            {stage === 3 ? (
              <div className="bubble" style={{ maxWidth: '100%' }}>
                <div className="row" style={{ marginBottom: 10 }}><strong className="grow">正在撰写</strong><span className="faint">{Math.min(n3, s3.length)} / {s3.length}</span></div>
                <div className="progress" style={{ marginBottom: 12 }}><i style={{ width: `${(n3 / s3.length) * 100}%` }} /></div>
                <Progress names={s3} n={n3} />
              </div>
            ) : (
              <div className="card" style={{ overflow: 'hidden' }}>
                <div className="row" style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-soft)' }}>
                  <FileText size={16} color="var(--primary)" /><strong className="grow">2026储能行业竞争格局.docx</strong><span className="faint">6,240 字 · 14 条引用 · 用时 2 分 18 秒</span>
                </div>
                <div style={{ padding: '8px 24px 16px', maxHeight: 520, overflow: 'auto' }}><Markdown text={REPORT_MD} /></div>
                <div className="row wrap" style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
                  <button className="btn primary sm" onClick={() => toast('已下载 2026储能行业竞争格局.docx')}><FileDown size={14} />下载 Word</button>
                  <button className="btn sm" onClick={() => toast('已复制全文')}><Copy size={14} />复制</button>
                  <span className="grow" />
                  <span className="faint">引用：</span>
                  {['[1] 高工储能 2026 年度报告', '[2] 发改委分时电价通知', '[3] 某券商行业深度'].map((c) => <span key={c} className="cite">{c}</span>)}
                </div>
              </div>
            )}
          </Bot>
        ) : null}
      </div>
      <div className="composer" style={{ opacity: stage === 4 ? 1 : 0.6 }}>
        <textarea rows={1} disabled={stage !== 4} placeholder={stage === 4 ? '继续修改，例如「第三章补充海外价格对比」' : '请先完成上方的交互步骤'} />
        <button className="btn primary icon" disabled aria-label="发送"><Send size={15} /></button>
      </div>
    </div>
  );
}

/* --------------------------- 合同审校（Chat Flow） --------------------------- */

const RISKS = [
  { level: '高', clause: '第 9.2 条 违约责任', quote: '乙方逾期交货的，每日按合同总额 0.05% 支付违约金，上限为合同总额的 5%。', issue: '违约金上限 5% 低于公司采购红线（≥ 10%），无法覆盖停产损失。', fix: '将上限调整为合同总额的 10%，并增加「逾期超过 30 日甲方有权解除合同」。', ref: '采购合同条款红线 · 第 3 条' },
  { level: '高', clause: '第 5.4 条 价格调整', quote: '如原材料价格波动超过 5%，乙方有权调整供货价格。', issue: '单方调价权且无上限，与框架合同「年度锁价」原则冲突。', fix: '改为「双方协商一致后调整，单次调整幅度不超过 3%，每年不超过一次」。', ref: '历史审校意见 · 2025-华东-017' },
  { level: '中', clause: '第 12 条 争议解决', quote: '争议提交乙方所在地人民法院诉讼解决。', issue: '管辖地约定于对方所在地，增加诉讼成本。', fix: '改为甲方所在地人民法院，或约定杭州仲裁委员会仲裁。', ref: '标准采购合同模板 V4 · 第 12 条' },
  { level: '低', clause: '第 3.1 条 交付地点', quote: '交付至甲方指定仓库。', issue: '未明确仓库地址与卸货责任。', fix: '补充具体地址，并约定卸货费用由乙方承担。', ref: '标准采购合同模板 V4 · 第 3 条' },
];

function ContractRun({ app }: { app: AppItem }) {
  const toast = useToast();
  const [stage, setStage] = useState(0);
  const steps = ['解析合同文本（18 页 · 42 个条款）', '提取合同要素', '识别合同类型：采购合同', '检索采购条款库（命中 26 条）', '逐条比对与风险分级', '高风险 → 已通知法务负责人'];
  const n = useSteps(steps, stage === 1, () => setStage(2));
  const tone = (l: string) => (l === '高' ? 'red' : l === '中' ? 'orange' : '');
  return (
    <div className="chat">
      <div className="chat-scroll">
        <Bot app={app}>
          <div className="bubble" style={{ maxWidth: '100%' }}>{app.opening}</div>
          {stage === 0 ? (
            <label className="upload-zone" style={{ marginTop: 10, maxWidth: 520 }} onClick={() => setStage(1)}>
              <UploadCloud size={28} color="var(--primary)" /><strong style={{ color: 'var(--text-1)' }}>上传合同文件</strong><span>PDF / DOCX，支持扫描件 · 点击使用示例《年度框架采购合同-华东.pdf》</span>
            </label>
          ) : null}
        </Bot>
        {stage >= 1 ? <User>📎 年度框架采购合同-华东.pdf（2.1 MB）</User> : null}
        {stage === 1 ? <Bot app={app}><div className="bubble" style={{ maxWidth: '100%' }}><Progress names={steps} n={n} /></div></Bot> : null}
        {stage >= 2 ? (
          <Bot app={app}>
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-soft)' }}>
                <AlertTriangle size={16} color="#f04438" /><strong className="grow">审校结论：发现 2 项高风险，建议修改后签署</strong>
                <Tag tone="red">高 2</Tag><Tag tone="orange">中 1</Tag><Tag>低 1</Tag>
              </div>
              <div style={{ padding: 16 }}>
                <div className="grid c4" style={{ gap: 12, fontSize: 13, marginBottom: 16 }}>
                  <div><div className="faint">合同类型</div>年度框架采购合同</div>
                  <div><div className="faint">相对方</div>华东某电芯供应商</div>
                  <div><div className="faint">合同金额</div>¥ 3,860,000（含税）</div>
                  <div><div className="faint">期限</div>2026-11 至 2027-10</div>
                </div>
                <div className="col" style={{ gap: 10 }}>
                  {RISKS.map((r) => (
                    <div key={r.clause} className="chunk-card" style={{ borderLeft: `3px solid ${r.level === '高' ? '#f04438' : r.level === '中' ? '#f79009' : '#d0d5dd'}` }}>
                      <div className="row" style={{ marginBottom: 6 }}><Tag tone={tone(r.level)}>{r.level}风险</Tag><strong>{r.clause}</strong><span className="grow" /><span className="cite">依据：{r.ref}</span></div>
                      <div style={{ fontSize: 13, color: 'var(--text-3)', background: 'var(--bg-soft)', padding: '6px 10px', borderRadius: 6 }}>原文：{r.quote}</div>
                      <div style={{ fontSize: 13, marginTop: 6 }}><strong>问题：</strong>{r.issue}</div>
                      <div style={{ fontSize: 13, marginTop: 4, color: '#039855' }}><strong>建议：</strong>{r.fix}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="row" style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
                <button className="btn primary sm" onClick={() => toast('已生成带修订痕迹的 Word')}><FileDown size={14} />导出修订版 Word</button>
                <button className="btn sm" onClick={() => toast('已发起法务复核')}><Bell size={14} />提交法务复核</button>
                <span className="grow" /><span className="faint">AI 审校仅供参考，签署前须经法务确认</span>
              </div>
            </div>
          </Bot>
        ) : null}
      </div>
      <div className="composer">
        <textarea rows={1} placeholder="追问，例如「第 5.4 条有没有更温和的改法」" />
        <button className="btn primary icon" disabled aria-label="发送"><Send size={15} /></button>
      </div>
    </div>
  );
}
