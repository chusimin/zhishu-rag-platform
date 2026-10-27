import { Bot, BookOpen, Brain, ChevronDown, ChevronRight, Headset, RotateCcw, Send, ThumbsDown, ThumbsUp, Wrench } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppItem } from '../data/mock';
import { scriptedReply, type Citation, type Step } from '../lib/mockChat';
import { Markdown } from './Markdown';
import { Drawer, Icon, useToast } from './ui';

interface Msg { id: number; role: 'user' | 'bot'; content: string; steps?: Step[]; citations?: Citation[]; handoff?: boolean; done?: boolean }

const STEP_ICON: Record<Step['kind'], ReactNode> = {
  kb: <BookOpen size={13} color="#12b76a" />,
  tool: <Wrench size={13} color="#3370ff" />,
  think: <Brain size={13} color="#7a5af8" />,
  node: <ChevronRight size={13} />,
  handoff: <Headset size={13} color="#f79009" />,
};

export function useStream() {
  const timer = useRef<number>();
  useEffect(() => () => window.clearInterval(timer.current), []);
  return (full: string, onChunk: (text: string, done: boolean) => void) => {
    let n = 0;
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      n = Math.min(full.length, n + 6);
      onChunk(full.slice(0, n), n >= full.length);
      if (n >= full.length) window.clearInterval(timer.current);
    }, 24);
  };
}

export function StepsView({ steps, defaultOpen = false }: { steps: Step[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 8 }}>
      <button className="tool-step" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {steps.map((s) => <span key={s.name} className="row" style={{ gap: 3 }}>{STEP_ICON[s.kind]}{s.name}</span>)}
        <span className="faint">· {(steps.reduce((a, s) => a + s.ms, 0) / 1000).toFixed(1)}s</span>
      </button>
      {open ? (
        <div className="col" style={{ gap: 4, marginTop: 6, paddingLeft: 8, borderLeft: '2px solid var(--border)' }}>
          {steps.map((s) => <div key={s.name} style={{ fontSize: 12 }}><span className="row" style={{ gap: 4, fontWeight: 500 }}>{STEP_ICON[s.kind]}{s.name}<span className="faint">{s.ms} ms</span></span><div className="muted mono" style={{ marginLeft: 17, whiteSpace: 'pre-wrap' }}>{s.detail}</div></div>)}
        </div>
      ) : null}
    </div>
  );
}

export function ChatPanel({ app, debug = false, title }: { app: AppItem; debug?: boolean; title?: ReactNode }) {
  const toast = useToast();
  const stream = useStream();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [cite, setCite] = useState<Citation | null>(null);
  const [rated, setRated] = useState<Record<number, 'up' | 'down'>>({});
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [msgs]);

  const send = (text: string) => {
    if (!text.trim() || busy) return;
    const reply = scriptedReply(app.id, text);
    const id = Date.now();
    setMsgs((m) => [...m, { id: id - 1, role: 'user', content: text }, { id, role: 'bot', content: '', steps: reply.steps, citations: reply.citations, handoff: reply.handoff }]);
    setInput('');
    setBusy(true);
    const wait = reply.steps.reduce((a, s) => a + s.ms, 0);
    window.setTimeout(() => stream(reply.content, (t, done) => {
      setMsgs((m) => m.map((x) => (x.id === id ? { ...x, content: t, done } : x)));
      if (done) setBusy(false);
    }), Math.min(wait, 1400));
  };

  return (
    <div className="chat">
      {title !== undefined ? (
        <div className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          {title}<span className="grow" />
          <button className="btn ghost sm" onClick={() => setMsgs([])}><RotateCcw size={14} />清空</button>
        </div>
      ) : null}
      <div className="chat-scroll" ref={scroller}>
        {app.opening ? (
          <div className="msg"><span className="who" style={{ background: app.color }}><Icon name={app.icon} size={16} /></span>
            <div><div className="bubble">{app.opening}</div>
              {app.suggestions?.length && !msgs.length ? <div className="suggest" style={{ marginTop: 10 }}>{app.suggestions.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}</div> : null}
            </div>
          </div>
        ) : null}
        {msgs.map((m) => m.role === 'user' ? (
          <div key={m.id} className="msg user"><span className="who" style={{ background: '#ffd8b5', color: '#93370d', fontSize: 13, fontWeight: 600 }}>周</span><div className="bubble">{m.content}</div></div>
        ) : (
          <div key={m.id} className="msg">
            <span className="who" style={{ background: app.color }}><Icon name={app.icon} size={16} /></span>
            <div style={{ maxWidth: 'min(680px, 86%)' }}>
              {m.steps?.length ? <StepsView steps={m.steps} defaultOpen={debug} /> : null}
              <div className="bubble" style={{ maxWidth: '100%', whiteSpace: 'normal' }}>
                {m.content ? <Markdown text={m.content} /> : <span className="typing muted">{m.steps?.length ? `正在${m.steps[m.steps.length - 1].name}` : '思考中'}</span>}
                {m.done && m.citations?.length ? (
                  <div className="msg-meta" style={{ borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                    <span className="faint">引用</span>
                    {m.citations.map((c, i) => <button key={c.title} className="cite" onClick={() => setCite(c)}>[{i + 1}] {c.file}</button>)}
                  </div>
                ) : null}
              </div>
              {m.done ? (
                <div className="row" style={{ marginTop: 6, gap: 2 }}>
                  {m.handoff ? <span className="tag orange" style={{ marginRight: 6 }}><Headset size={12} />已转人工</span> : null}
                  <button className={`btn ghost sm icon ${rated[m.id] === 'up' ? 'active' : ''}`} aria-label="有帮助" onClick={() => { setRated({ ...rated, [m.id]: 'up' }); toast('感谢反馈'); }}><ThumbsUp size={14} color={rated[m.id] === 'up' ? '#3370ff' : undefined} /></button>
                  <button className="btn ghost sm icon" aria-label="没帮助" onClick={() => { setRated({ ...rated, [m.id]: 'down' }); toast('已记录，问题会进入知识缺口列表'); }}><ThumbsDown size={14} color={rated[m.id] === 'down' ? '#f04438' : undefined} /></button>
                  {debug ? <span className="faint" style={{ marginLeft: 8 }}>1,284 tokens · {app.model}</span> : null}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea rows={1} value={input} placeholder={debug ? '输入问题调试当前配置（未发布）' : '输入你的问题，Enter 发送'} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); } }} />
        <button className="btn primary icon" disabled={!input.trim() || busy} aria-label="发送"><Send size={15} /></button>
      </form>
      <Drawer open={!!cite} title="引用来源" onClose={() => setCite(null)}>
        {cite ? <div className="col" style={{ gap: 12 }}>
          <div className="row"><Bot size={16} className="muted" /><strong>{cite.file}</strong></div>
          <div className="faint">{cite.title} · 相关度 {cite.score}</div>
          <div className="chunk-card"><div className="body">{cite.content}</div></div>
          <button className="btn" style={{ alignSelf: 'flex-start' }}>在知识库中打开</button>
        </div> : null}
      </Drawer>
    </div>
  );
}
