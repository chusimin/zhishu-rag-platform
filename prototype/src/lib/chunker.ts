// 浏览器端切块预览：在原型里真实执行各策略，用于演示参数对结果的影响。
// 生产环境应由后端 `POST /knowledge-bases/{id}/chunk-preview` 返回同结构结果。
import { SAMPLE_QA, type ChunkMethodKey } from '../data/mock';

export interface ChunkParams {
  size: number;
  overlap: number;
  headingLevel: 1 | 2 | 3;
  separators: string[];
  parentSize: number;
  childSize: number;
  injectTitle: boolean;
  headerAsContext: boolean;
  rowsPerChunk: number;
}

export const DEFAULT_PARAMS: ChunkParams = {
  size: 300,
  overlap: 40,
  headingLevel: 2,
  separators: ['\\n\\n'],
  parentSize: 260,
  childSize: 90,
  injectTitle: true,
  headerAsContext: true,
  rowsPerChunk: 1,
};

export interface PreviewChunk {
  title?: string;
  content: string;
  children?: string[];
  q?: string;
  page?: number;
}

const PAGE = '<!-- page -->';

function clean(text: string) {
  return text.replaceAll(PAGE, '').replace(/\n{3,}/g, '\n\n').trim();
}

function docTitle(text: string) {
  return text.match(/^#\s+(.+)$/m)?.[1] ?? '未命名文档';
}

interface Section { path: string[]; body: string }

function sections(text: string, maxLevel: number): Section[] {
  const out: Section[] = [];
  const path: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) out.push({ path: [...path], body });
    buf = [];
  };
  for (const line of clean(text).split('\n')) {
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m && m[1].length <= maxLevel) {
      flush();
      const level = m[1].length;
      path.length = level - 1;
      path[level - 1] = m[2];
      continue;
    }
    if (m) { buf.push(m[2]); continue; }
    buf.push(line);
  }
  flush();
  return out;
}

function packParagraphs(body: string, size: number): string[] {
  const paras = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const p of paras) {
    if (p.length > size) {
      if (cur) { out.push(cur); cur = ''; }
      out.push(...slide(p, size, 0));
      continue;
    }
    if (cur && cur.length + p.length + 2 > size) { out.push(cur); cur = p; } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

function slide(text: string, size: number, overlap: number): string[] {
  const step = Math.max(1, size - Math.min(overlap, size - 1));
  const out: string[] = [];
  for (let i = 0; i < text.length; i += step) {
    out.push(text.slice(i, i + size).trim());
    if (i + size >= text.length) break;
  }
  return out.filter(Boolean);
}

function withTitle(title: string, content: string, inject: boolean): PreviewChunk {
  return { title, content: inject ? `【${title}】\n${content}` : content };
}

function unescapeSep(s: string) {
  return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

export function chunkDocument(method: ChunkMethodKey, text: string, p: ChunkParams): PreviewChunk[] {
  const title = docTitle(text);
  switch (method) {
    case 'auto':
      return sections(text, 3).flatMap((s) =>
        packParagraphs(s.body, p.size).map((c) => withTitle([title, ...s.path.slice(1)].filter(Boolean).join(' > '), c, p.injectTitle)));
    case 'heading':
      return sections(text, p.headingLevel).flatMap((s) => {
        const t = s.path.filter(Boolean).join(' > ') || title;
        return packParagraphs(s.body, Math.max(p.size, 200)).map((c) => withTitle(t, c, p.injectTitle));
      });
    case 'separator': {
      const seps = p.separators.map(unescapeSep).filter(Boolean);
      if (!seps.length) return [{ content: clean(text) }];
      const pattern = new RegExp(seps.map((s) => s.startsWith('re:') ? s.slice(3) : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
      return clean(text).split(pattern).map((c) => c.replace(/^#+\s*/gm, '').trim()).filter(Boolean)
        .flatMap((c) => (c.length > p.size ? slide(c, p.size, 0) : [c])).map((content) => ({ content }));
    }
    case 'fixed':
      return slide(clean(text).replace(/^#+\s*/gm, ''), p.size, p.overlap).map((content) => ({ content }));
    case 'parent_child': {
      const body = clean(text).replace(/^#+\s*/gm, '');
      return packParagraphs(body, p.parentSize).map((parent) => ({
        content: parent,
        children: slide(parent.replace(/\n+/g, ' '), p.childSize, Math.min(p.overlap, 40)),
      }));
    }
    case 'semantic':
      // 原型用「章」近似模型识别出的主题边界；真实实现见 backend/app/services/chunking.py::_semantic_chunks
      return sections(text, 2).map((s) => ({ title: `主题：${s.path[1] ?? s.path[0] ?? title}`, content: s.body }));
    case 'qa':
      return SAMPLE_QA.map((item) => ({ q: item.q, content: item.a }));
    case 'page':
      return text.split(PAGE).map((pg, i) => ({ page: i + 1, title: `第 ${i + 1} 页`, content: pg.replace(/^#+\s*/gm, '').trim() }));
    case 'table_row': {
      const [head, ...rows] = text.trim().split('\n').map((r) => r.split(','));
      const out: PreviewChunk[] = [];
      for (let i = 0; i < rows.length; i += p.rowsPerChunk) {
        const group = rows.slice(i, i + p.rowsPerChunk);
        const content = group.map((r) => p.headerAsContext ? head.map((h, j) => `${h}：${r[j] ?? ''}`).join('；') : r.join(' | ')).join('\n');
        out.push({ title: `第 ${i + 2}${group.length > 1 ? `–${i + 1 + group.length}` : ''} 行`, content });
      }
      return out;
    }
    default:
      return [];
  }
}

export function approxTokens(text: string) {
  return Math.round(text.length * 0.7);
}
