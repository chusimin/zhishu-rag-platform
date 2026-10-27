import { useEffect, useId, useRef, type ButtonHTMLAttributes, type PropsWithChildren, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', icon, className = '', children, ...props }: ButtonProps) {
  return (
    <button className={`button button--${variant} ${className}`.trim()} {...props}>
      {icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className = '', ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>) {
  return (
    <button className={`icon-button ${className}`.trim()} aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

export function Badge({ tone = 'neutral', children }: PropsWithChildren<{ tone?: 'neutral' | 'success' | 'warning' | 'error' | 'info' }>) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'warning' || tone === 'error' ? AlertCircle : tone === 'info' ? Info : null;
  return (
    <span className={`badge badge--${tone}`}>
      {Icon ? <Icon size={13} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function PageHeader({ title, description, eyebrow, actions }: { title: string; description: string; eyebrow?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function StatCard({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: ReactNode }) {
  return (
    <section className="card stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <span className="stat-label">{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </section>
  );
}

type OverlayEntry = {
  element: HTMLElement;
  close: () => void;
};

const overlayStack: OverlayEntry[] = [];
let previousBodyOverflow = '';
let rootWasInert = false;
let rootAriaHidden: string | null = null;

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function visibleFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
}

function useOverlayLifecycle(open: boolean, onClose: () => void, dialogRef: React.RefObject<HTMLElement>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || !dialogRef.current) return undefined;
    const element = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const entry: OverlayEntry = { element, close: () => closeRef.current() };
    overlayStack.push(entry);
    if (overlayStack.length === 1) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const root = document.getElementById('root');
      if (root) {
        rootWasInert = root.hasAttribute('inert');
        rootAriaHidden = root.getAttribute('aria-hidden');
        root.setAttribute('inert', '');
        root.setAttribute('aria-hidden', 'true');
      }
    }

    const focusTimer = window.setTimeout(() => {
      (visibleFocusableElements(element)[0] ?? element).focus();
    }, 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (overlayStack.at(-1) !== entry) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = visibleFocusableElements(element);
      if (!focusable.length) {
        event.preventDefault();
        element.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown, true);
      const index = overlayStack.indexOf(entry);
      if (index >= 0) overlayStack.splice(index, 1);
      if (!overlayStack.length) {
        document.body.style.overflow = previousBodyOverflow;
        const root = document.getElementById('root');
        if (root) {
          if (!rootWasInert) root.removeAttribute('inert');
          if (rootAriaHidden == null) root.removeAttribute('aria-hidden');
          else root.setAttribute('aria-hidden', rootAriaHidden);
        }
        if (previousFocus?.isConnected) previousFocus.focus();
      }
    };
  }, [open]);
}

function Overlay({ kind, title, description, children, footer, onClose }: PropsWithChildren<{ kind: 'modal' | 'drawer'; title: string; description?: string; footer?: ReactNode; onClose: () => void }>) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  useOverlayLifecycle(true, onClose, dialogRef);
  const closeFromBackdrop = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && overlayStack.at(-1)?.element === dialogRef.current) onClose();
  };
  return createPortal(
    <div className={`overlay ${kind === 'drawer' ? 'overlay--drawer' : ''}`} data-overlay-root role="presentation" onMouseDown={closeFromBackdrop}>
      <section ref={dialogRef} tabIndex={-1} className={kind === 'drawer' ? 'drawer' : 'dialog'} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
        <header className="overlay-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <IconButton className="overlay-close" label={kind === 'drawer' ? '关闭抽屉' : '关闭弹窗'} onClick={onClose}><X size={18} /></IconButton>
        </header>
        <div className="overlay-body">{children}</div>
        {footer ? <footer className="overlay-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}

export function Modal(props: PropsWithChildren<{ open: boolean; title: string; description?: string; footer?: ReactNode; onClose: () => void }>) {
  if (!props.open || typeof document === 'undefined') return null;
  return <Overlay kind="modal" {...props} />;
}

export function Drawer(props: PropsWithChildren<{ open: boolean; title: string; description?: string; footer?: ReactNode; onClose: () => void }>) {
  if (!props.open || typeof document === 'undefined') return null;
  return <Overlay kind="drawer" {...props} />;
}

export function Notice({ tone = 'info', title, children }: PropsWithChildren<{ tone?: 'info' | 'warning' | 'error' | 'success'; title: string }>) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertCircle;
  return (
    <div className={`notice notice--${tone}`}>
      <Icon size={18} aria-hidden="true" />
      <div><strong>{title}</strong><p>{children}</p></div>
    </div>
  );
}
