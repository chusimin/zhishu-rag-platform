import type { ReactNode } from 'react';

function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[\d+\])/g).filter(Boolean).map((part, i) => {
    if (part.startsWith('**')) return <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>;
    if (/^\[\d+\]$/.test(part)) return <sup key={`${key}-${i}`}>{part}</sup>;
    return part;
  });
}

// 原型用的极简 Markdown：标题、加粗、列表、表格、引用角标。
export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `l${i}`;
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|[\s|:-]+\|$/.test(lines[i])) rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
        i += 1;
      }
      const [head, ...body] = rows;
      out.push(<table key={k}><thead><tr>{head.map((h, j) => <th key={j}>{inline(h, `${k}h${j}`)}</th>)}</tr></thead><tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, `${k}${ri}${j}`)}</td>)}</tr>)}</tbody></table>);
      continue;
    }
    if (/^(\d+\.|-)\s/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^(\d+\.|-)\s/.test(lines[i])) { items.push(lines[i].replace(/^(\d+\.|-)\s/, '')); i += 1; }
      const List = ordered ? 'ol' : 'ul';
      out.push(<List key={k} style={{ margin: '6px 0', paddingLeft: 20 }}>{items.map((it, j) => <li key={j}>{inline(it, `${k}${j}`)}</li>)}</List>);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.+)/);
    if (h) {
      const H = (`h${h[1].length}`) as 'h1' | 'h2' | 'h3';
      out.push(<H key={k}>{inline(h[2], k)}</H>);
    } else if (line.trim()) {
      out.push(<p key={k} style={{ margin: '4px 0' }}>{inline(line, k)}</p>);
    }
    i += 1;
  }
  return <div className="doc" style={{ lineHeight: 1.75 }}>{out}</div>;
}
