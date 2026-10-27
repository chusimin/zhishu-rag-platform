import { ChevronDown, Database, Plus, Settings2, Wand2, X } from 'lucide-react';
import { useState, type PropsWithChildren, type ReactNode } from 'react';
import { KNOWLEDGE_BASES, kbById, MODELS } from '../data/mock';
import { Dev, Field, Modal, Slider, Switch, Tag, useToast } from '../components/ui';

export function Section({ icon, title, extra, children, defaultOpen = true }: PropsWithChildren<{ icon: ReactNode; title: ReactNode; extra?: ReactNode; defaultOpen?: boolean }>) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ borderBottom: '1px solid var(--border)', padding: '14px 0' }}>
      <div className="row" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <span style={{ color: 'var(--primary)', display: 'flex' }}>{icon}</span>
        <strong className="grow">{title}</strong>
        <span onClick={(e) => e.stopPropagation()}>{extra}</span>
        <ChevronDown size={15} className="muted" style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
      </div>
      {open ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </section>
  );
}

export function ModelPicker({ value, toolCalling }: { value: string; toolCalling?: boolean }) {
  const [temp, setTemp] = useState(0.3);
  const [max, setMax] = useState(2000);
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="row">
        <select className="select grow" defaultValue={value}>
          {MODELS.filter((m) => m.type === 'LLM').map((m) => <option key={m.name} value={m.name}>{m.name} · {m.provider} · {m.ctx}</option>)}
        </select>
        <button className="btn icon" aria-label="模型参数" onClick={() => setOpen(true)}><Settings2 size={15} /></button>
      </div>
      {toolCalling ? <div className="faint" style={{ marginTop: 6 }}>Agent 需要支持工具调用（Function Calling）的模型。</div> : null}
      <Modal open={open} title="模型参数" onClose={() => setOpen(false)} footer={<button className="btn primary" onClick={() => setOpen(false)}>确定</button>}>
        <Field label="温度" hint="越低越稳定"><Slider value={temp} min={0} max={1} step={0.1} onChange={setTemp} /></Field>
        <Field label="回复上限" hint="tokens"><Slider value={max} min={256} max={8000} step={256} onChange={setMax} /></Field>
        <Field label="思考模式"><select className="select"><option>自动</option><option>关闭</option><option>开启（更慢、更准）</option></select></Field>
      </Modal>
    </>
  );
}

export function PromptBox({ value, rows = 8, vars = [] }: { value: string; rows?: number; vars?: string[] }) {
  const toast = useToast();
  return (
    <div style={{ border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden' }}>
      <textarea className="textarea" style={{ border: 0, borderRadius: 0, boxShadow: 'none', minHeight: rows * 22 }} defaultValue={value} />
      <div className="row" style={{ padding: '6px 8px', background: 'var(--bg-soft)', borderTop: '1px solid var(--border)' }}>
        {vars.map((v) => <button key={v} className="tag" style={{ cursor: 'pointer' }} title="插入变量">{`{{${v}}}`}</button>)}
        <span className="grow" />
        <button className="btn sm ghost" style={{ color: 'var(--purple)' }} onClick={() => toast('AI 已优化提示词结构：角色 / 任务 / 约束 / 输出格式')}><Wand2 size={13} />AI 优化</button>
      </div>
    </div>
  );
}

export function KnowledgePicker({ initial, agentMode }: { initial: string[]; agentMode?: boolean }) {
  const [ids, setIds] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [params, setParams] = useState(false);
  const [mode, setMode] = useState('hybrid');
  const [limit, setLimit] = useState(3000);
  const [score, setScore] = useState(0.4);
  return (
    <>
      <div className="col" style={{ gap: 6 }}>
        {ids.map((id) => {
          const kb = kbById(id)!;
          return (
            <div key={id} className="row" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
              <span className="avatar-tile sm" style={{ background: kb.color }}><Database size={14} /></span>
              <span className="grow">{kb.name}<span className="faint"> · {kb.chunks.toLocaleString()} 块</span></span>
              <button className="btn ghost sm icon" aria-label="移除" onClick={() => setIds(ids.filter((x) => x !== id))}><X size={14} /></button>
            </div>
          );
        })}
        <div className="row">
          <button className="btn sm" onClick={() => setAdding(true)}><Plus size={13} />关联知识库</button>
          <button className="btn sm ghost" onClick={() => setParams(true)}><Settings2 size={13} />检索参数</button>
          <span className="grow" />
          <span className="faint">{mode === 'hybrid' ? '混合检索' : mode === 'semantic' ? '语义检索' : '全文检索'} · Rerank · {limit} tokens</span>
        </div>
        {agentMode ? <div className="faint">作为「知识库搜索」工具提供给 Agent，由模型决定何时检索、用什么关键词检索。</div> : null}
      </div>
      <Modal open={adding} title="关联知识库" onClose={() => setAdding(false)} footer={<button className="btn primary" onClick={() => setAdding(false)}>完成</button>}>
        <p className="faint" style={{ marginBottom: 10 }}>只能选择索引模型相同的知识库（当前：bge-m3）。</p>
        <div className="col">
          {KNOWLEDGE_BASES.map((kb) => {
            const on = ids.includes(kb.id);
            const disabled = kb.embedding !== 'bge-m3';
            return (
              <button key={kb.id} disabled={disabled} className={`method-card ${on ? 'active' : ''}`} style={{ opacity: disabled ? 0.45 : 1, alignItems: 'center' }} onClick={() => setIds(on ? ids.filter((x) => x !== kb.id) : [...ids, kb.id])}>
                <span className="avatar-tile sm" style={{ background: kb.color }}><Database size={14} /></span>
                <div className="grow"><h4>{kb.name}</h4><p>{kb.desc}{disabled ? ` · 索引模型 ${kb.embedding} 不一致` : ''}</p></div>
                {on ? <Tag tone="blue">已选</Tag> : null}
              </button>
            );
          })}
        </div>
      </Modal>
      <Modal open={params} title="检索参数" onClose={() => setParams(false)} footer={<button className="btn primary" onClick={() => setParams(false)}>确定</button>}>
        <Field label={<>检索模式<Dev s="partial" note="仅语义" /></>}>
          <div className="seg">
            {[['semantic', '语义检索'], ['fulltext', '全文检索'], ['hybrid', '混合检索']].map(([k, l]) => <button key={k} className={mode === k ? 'active' : ''} onClick={() => setMode(k)}>{l}</button>)}
          </div>
        </Field>
        <Field label="引用上限" hint="tokens"><Slider value={limit} min={500} max={12000} step={500} onChange={setLimit} /></Field>
        <Field label="最低相关度"><Slider value={score} min={0} max={1} step={0.05} onChange={setScore} /></Field>
        <div className="row form-item"><span className="grow">结果重排</span><Switch on onChange={() => undefined} label="重排" /></div>
        <div className="row form-item"><span className="grow">问题优化<div className="faint">结合对话历史补全「它」「这个」等指代</div></span><Switch on onChange={() => undefined} label="问题优化" /></div>
        <div className="row"><span className="grow">无引用时<div className="faint">检索不到依据时的处理方式</div></span><select className="select sm" style={{ width: 160 }}><option>回复「暂无相关信息」</option><option>允许模型自由回答</option><option>转人工</option></select></div>
      </Modal>
    </>
  );
}

export function ListEditor({ items, placeholder }: { items: string[]; placeholder: string }) {
  const [list, setList] = useState(items);
  const [val, setVal] = useState('');
  return (
    <div className="col" style={{ gap: 6 }}>
      {list.map((s) => <div key={s} className="row" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}><span className="grow">{s}</span><button className="btn ghost sm icon" aria-label="删除" onClick={() => setList(list.filter((x) => x !== s))}><X size={13} /></button></div>)}
      <div className="row"><input className="input sm" value={val} placeholder={placeholder} onChange={(e) => setVal(e.target.value)} /><button className="btn sm" onClick={() => { if (val) { setList([...list, val]); setVal(''); } }}>添加</button></div>
    </div>
  );
}
