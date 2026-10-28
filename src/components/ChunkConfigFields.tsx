import type { ApiChunkConfig, ApiKnowledgeBase } from '../api/client';
import { CHUNK_METHODS } from '../lib/knowledge';
import { Field, Slider, Tag } from './ui';

export function MethodPicker({ value, kb, onChange, recommended, disabled = [] }: { value: ApiChunkConfig['method']; kb: ApiKnowledgeBase; onChange: (method: ApiChunkConfig['method']) => void; recommended?: string; disabled?: string[] }) {
  return (
    <div className="grid c2" style={{ gap: 8 }}>
      {CHUNK_METHODS.map((method) => {
        const blocked = disabled.includes(method.value) || (method.needsLlm && !kb.semantic_llm_model_id);
        return (
          <button key={method.value} type="button" disabled={blocked} title={blocked ? (method.needsLlm ? '需要先在知识库配置中设置文本理解模型' : '不适用于当前文件') : method.description}
            className={`method-card ${value === method.value ? 'active' : ''}`} style={{ padding: 10, opacity: blocked ? 0.45 : 1, cursor: blocked ? 'not-allowed' : 'pointer' }} onClick={() => onChange(method.value)}>
            <div>
              <h4 style={{ fontSize: 13 }}>{method.label}{recommended === method.value ? <Tag tone="green">推荐</Tag> : null}{method.needsLlm ? <Tag tone="purple">LLM</Tag> : null}</h4>
              <p>{method.bestFor}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function ChunkConfigFields({ config, patch }: { config: ApiChunkConfig; patch: (value: Partial<ApiChunkConfig>) => void }) {
  const sized = ['recursive', 'heading', 'separator', 'fixed'].includes(config.method);
  return (
    <div>
      {sized ? <>
        <Field label={config.method === 'heading' ? '单块超长时继续切分' : '块大小'} hint="字"><Slider label="块大小" value={config.chunk_size} min={100} max={4000} step={50} onChange={(v) => patch({ chunk_size: v })} /></Field>
        <Field label="重叠长度" hint="字"><Slider label="重叠长度" value={config.chunk_overlap} min={0} max={Math.min(1000, config.chunk_size - 1)} step={10} onChange={(v) => patch({ chunk_overlap: v })} /></Field>
      </> : null}
      {config.method === 'heading' ? (
        <Field label="按哪一级标题切分">
          <div className="seg">{[1, 2, 3, 4].map((level) => <button type="button" key={level} className={config.heading_level === level ? 'active' : ''} onClick={() => patch({ heading_level: level })}>H1{level > 1 ? `–H${level}` : ''}</button>)}</div>
        </Field>
      ) : null}
      {config.method === 'separator' ? (
        <Field label="分隔符" hint="每行一个；正则以 re: 开头，\n 表示换行">
          <textarea className="textarea mono" style={{ minHeight: 80 }} value={config.separators.map((item) => item.replace(/\n/g, '\\n')).join('\n')} onChange={(event) => patch({ separators: event.target.value.split('\n').map((item) => item.replace(/\\n/g, '\n')).filter(Boolean) })} />
          <div className="row wrap" style={{ marginTop: 6, gap: 6 }}>
            {[['空行', '\n\n'], ['句号', '。'], ['「第X条」', 're:(?=第[一二三四五六七八九十百]+条)'], ['## 标题', '## ']].map(([label, value]) => (
              <button type="button" key={label} className="tag" style={{ cursor: 'pointer' }} onClick={() => !config.separators.includes(value) && patch({ separators: [...config.separators, value] })}>+ {label}</button>
            ))}
          </div>
        </Field>
      ) : null}
      {config.method === 'parent_child' ? <>
        <Field label="父块大小" hint="返回给模型的上下文"><Slider label="父块大小" value={config.parent_chunk_size} min={200} max={12000} step={100} onChange={(v) => patch({ parent_chunk_size: v })} /></Field>
        <Field label="子块大小" hint="用于向量匹配"><Slider label="子块大小" value={config.child_chunk_size} min={80} max={4000} step={20} onChange={(v) => patch({ child_chunk_size: v })} /></Field>
        <Field label="重叠长度" hint="字"><Slider label="重叠长度" value={config.chunk_overlap} min={0} max={Math.min(1000, config.chunk_size - 1)} step={10} onChange={(v) => patch({ chunk_overlap: v })} /></Field>
      </> : null}
      {config.method === 'table_row' ? <Field label="每块行数"><Slider label="每块行数" value={config.rows_per_chunk} min={1} max={20} onChange={(v) => patch({ rows_per_chunk: v })} /></Field> : null}
      {config.method === 'semantic' ? <p className="faint">由知识库配置的文本理解模型按主题切分；结果必须与原文逐字一致，否则构建失败。会产生额外模型调用。</p> : null}
      {config.method === 'page' ? <p className="faint">PDF 每页一块并保留页码；其他格式按段落处理。</p> : null}
      {config.method === 'qa' ? <p className="faint">CSV / Excel 第一列为问题、第二列为答案，每行一个问答分块。</p> : null}
    </div>
  );
}
