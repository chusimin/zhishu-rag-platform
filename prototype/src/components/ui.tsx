import {
  BookOpen, BrainCircuit, CalendarCheck, Contact, Database, FileDown, FileStack, FileText, Globe, Headset, Heading,
  Megaphone, MessagesSquare, Network, NotebookPen, PackageSearch, Ruler, Send, SeparatorHorizontal, ShieldCheck,
  Sparkles, Table, Target, TicketPlus, X, type LucideIcon,
} from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';

const ICONS: Record<string, LucideIcon> = {
  BookOpen, BrainCircuit, CalendarCheck, Contact, Database, FileDown, FileStack, FileText, Globe, Headset, Heading,
  Megaphone, MessagesSquare, Network, NotebookPen, PackageSearch, Ruler, Send, SeparatorHorizontal, ShieldCheck,
  Sparkles, Table, Target, TicketPlus,
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const Cmp = ICONS[name] ?? Sparkles;
  return <Cmp size={size} aria-hidden="true" />;
}

export function Tile({ icon, color, size = 'md' }: { icon: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'sm' ? 15 : size === 'lg' ? 22 : 19;
  return <span className={`avatar-tile ${size === 'md' ? '' : size}`} style={{ background: color }}><Icon name={icon} size={px} /></span>;
}

export function Tag({ tone = '', children }: PropsWithChildren<{ tone?: string }>) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

/* -------- 开发标注：评审时显示每个功能的后端就绪度 -------- */

const AnnotateCtx = createContext<{ on: boolean; toggle: () => void }>({ on: false, toggle: () => undefined });

export function AnnotateProvider({ children }: PropsWithChildren) {
  const [on, setOn] = useState(() => localStorage.getItem('zs-annotate') === '1');
  const toggle = useCallback(() => setOn((v) => { localStorage.setItem('zs-annotate', v ? '0' : '1'); return !v; }), []);
  return <AnnotateCtx.Provider value={{ on, toggle }}>{children}</AnnotateCtx.Provider>;
}

export const useAnnotate = () => useContext(AnnotateCtx);

const DEV_TEXT = { ready: '后端已有', partial: '后端部分', todo: '需新开发' };

export function Dev({ s, note }: { s: 'ready' | 'partial' | 'todo'; note?: string }) {
  const { on } = useAnnotate();
  if (!on) return null;
  return <span className={`dev-note ${s}`} title={note}>{DEV_TEXT[s]}{note ? ` · ${note}` : ''}</span>;
}

/* -------- Toast -------- */

const ToastCtx = createContext<(text: string) => void>(() => undefined);

export function ToastProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  const show = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list, { id, text }]);
    window.setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 2400);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-wrap" aria-live="polite">{items.map((i) => <div className="toast" key={i.id}>{i.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* -------- Modal / Drawer -------- */

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);
}

export function Modal({ open, title, onClose, children, footer, wide, icon }: PropsWithChildren<{ open: boolean; title: string; onClose: () => void; footer?: ReactNode; wide?: boolean; icon?: ReactNode }>) {
  useEscape(open, onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">{icon}<h3>{title}</h3><button className="btn ghost sm icon" aria-label="关闭" onClick={onClose}><X size={16} /></button></div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Drawer({ open, title, onClose, children, footer }: PropsWithChildren<{ open: boolean; title: ReactNode; onClose: () => void; footer?: ReactNode }>) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <>
      <div className="overlay" style={{ background: 'rgba(16,24,40,.18)' }} onMouseDown={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="modal-head" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14 }}><h3>{title}</h3><button className="btn ghost sm icon" aria-label="关闭" onClick={onClose}><X size={16} /></button></div>
        <div className="modal-body" style={{ flex: 1, paddingTop: 16 }}>{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </aside>
    </>
  );
}

export function Field({ label, required, hint, children }: PropsWithChildren<{ label: ReactNode; required?: boolean; hint?: ReactNode }>) {
  return (
    <div className="form-item">
      <div className="field-label">{label}{required ? <span className="req">*</span> : null}{hint ? <span className="hint">{hint}</span> : null}</div>
      {children}
    </div>
  );
}

export function Slider({ value, min, max, step = 1, onChange, suffix }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="slider-row">
      <input className="range" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="row" style={{ flex: 'none' }}>
        <input className="input sm" type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        {suffix ? <span className="faint">{suffix}</span> : null}
      </div>
    </div>
  );
}

export function Empty({ icon, title, desc, action }: { icon: ReactNode; title: string; desc?: string; action?: ReactNode }) {
  return <div className="empty">{icon}<strong style={{ color: 'var(--text-1)' }}>{title}</strong>{desc ? <span>{desc}</span> : null}{action}</div>;
}
