import { Fragment, type ReactNode } from 'react';

function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>);
}

export function MarkdownText({ content }: { content: string }) {
  const lines = content.split('\n');
  return <div className="markdown-text">{lines.map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return <div className="markdown-space" key={index} />;
    if (trimmed.startsWith('### ')) return <h3 key={index}>{inline(trimmed.slice(4))}</h3>;
    if (trimmed.startsWith('## ')) return <h2 key={index}>{inline(trimmed.slice(3))}</h2>;
    if (trimmed.startsWith('# ')) return <h2 key={index}>{inline(trimmed.slice(2))}</h2>;
    if (/^[-*]\s+/.test(trimmed)) return <div className="markdown-list-item" key={index}><span>•</span><p>{inline(trimmed.replace(/^[-*]\s+/, ''))}</p></div>;
    if (/^\d+\.\s+/.test(trimmed)) return <div className="markdown-list-item" key={index}><span>{trimmed.match(/^\d+/)?.[0]}.</span><p>{inline(trimmed.replace(/^\d+\.\s+/, ''))}</p></div>;
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) return <div className="markdown-table-row" key={index}>{trimmed.split('|').slice(1, -1).map((cell, cellIndex) => <span key={cellIndex}>{inline(cell.trim())}</span>)}</div>;
    return <p key={index}>{inline(trimmed)}</p>;
  })}</div>;
}
