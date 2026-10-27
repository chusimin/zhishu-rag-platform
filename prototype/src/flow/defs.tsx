import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import {
  Bot, Braces, CheckCircle2, CircleDot, Code2, Combine, Database, FileDown, FileSearch, FormInput, GitFork, Globe, Hourglass, ListChecks,
  LoaderCircle, MessageSquareReply, PencilLine, Puzzle, Repeat, Settings, Split, Variable, Wand2, Wrench, type LucideIcon,
} from 'lucide-react';
import { memo } from 'react';

export type NodeKind =
  | 'sys' | 'start' | 'answer'
  | 'llm' | 'classify' | 'extract' | 'rewrite' | 'agent'
  | 'kb' | 'doc_parse'
  | 'ifelse' | 'loop' | 'var' | 'template' | 'code'
  | 'form' | 'choice'
  | 'http' | 'tool' | 'subapp' | 'export';

export interface NodeDef { kind: NodeKind; name: string; icon: LucideIcon; color: string; cat: string; desc: string; dev: 'ready' | 'partial' | 'todo' }

export const NODE_DEFS: NodeDef[] = [
  { kind: 'start', name: '流程开始', icon: CircleDot, color: '#3370ff', cat: '基础', desc: '用户输入的问题和文件', dev: 'todo' },
  { kind: 'answer', name: '指定回复', icon: MessageSquareReply, color: '#12b76a', cat: '基础', desc: '向用户输出固定或拼接的内容', dev: 'todo' },
  { kind: 'llm', name: 'AI 对话', icon: Bot, color: '#7a5af8', cat: 'AI 能力', desc: '调用大模型生成回复', dev: 'partial' },
  { kind: 'classify', name: '问题分类', icon: Split, color: '#7a5af8', cat: 'AI 能力', desc: '按语义把问题分到不同分支', dev: 'todo' },
  { kind: 'extract', name: '文本内容提取', icon: Braces, color: '#7a5af8', cat: 'AI 能力', desc: '从文本中抽取结构化字段', dev: 'todo' },
  { kind: 'rewrite', name: '问题优化', icon: Wand2, color: '#7a5af8', cat: 'AI 能力', desc: '结合上下文补全和改写问题', dev: 'todo' },
  { kind: 'agent', name: '工具调用', icon: Wrench, color: '#0e9384', cat: 'AI 能力', desc: '让模型自主选择并调用工具', dev: 'todo' },
  { kind: 'kb', name: '知识库搜索', icon: Database, color: '#12b76a', cat: '知识', desc: '语义 / 全文 / 混合检索', dev: 'ready' },
  { kind: 'doc_parse', name: '文档解析', icon: FileSearch, color: '#12b76a', cat: '知识', desc: '读取用户上传文件的文本', dev: 'ready' },
  { kind: 'ifelse', name: '判断器', icon: GitFork, color: '#f79009', cat: '逻辑', desc: '按条件进入不同分支', dev: 'todo' },
  { kind: 'loop', name: '循环', icon: Repeat, color: '#f79009', cat: '逻辑', desc: '对数组逐项执行子流程', dev: 'todo' },
  { kind: 'var', name: '变量更新', icon: Variable, color: '#f79009', cat: '逻辑', desc: '修改全局或节点变量', dev: 'todo' },
  { kind: 'template', name: '文本拼接', icon: Combine, color: '#f79009', cat: '逻辑', desc: '用模板组合多个变量', dev: 'todo' },
  { kind: 'code', name: '代码运行', icon: Code2, color: '#f79009', cat: '逻辑', desc: '沙箱执行 JS / Python', dev: 'todo' },
  { kind: 'form', name: '表单输入', icon: FormInput, color: '#dd2590', cat: '交互', desc: '暂停流程，让用户填写表单', dev: 'todo' },
  { kind: 'choice', name: '用户选择', icon: ListChecks, color: '#dd2590', cat: '交互', desc: '暂停流程，让用户确认或选择', dev: 'todo' },
  { kind: 'http', name: 'HTTP 请求', icon: Globe, color: '#3370ff', cat: '外部', desc: '调用业务系统接口', dev: 'todo' },
  { kind: 'tool', name: '工具', icon: Puzzle, color: '#3370ff', cat: '外部', desc: '使用工具库中的工具', dev: 'todo' },
  { kind: 'subapp', name: '子应用', icon: PencilLine, color: '#3370ff', cat: '外部', desc: '调用另一个已发布应用', dev: 'todo' },
  { kind: 'export', name: '导出文件', icon: FileDown, color: '#3370ff', cat: '外部', desc: '按模板生成 Word / PDF / Excel', dev: 'todo' },
  { kind: 'sys', name: '系统配置', icon: Settings, color: '#667085', cat: '基础', desc: '开场白、全局变量、文件上传', dev: 'partial' },
];

export const DEF = Object.fromEntries(NODE_DEFS.map((d) => [d.kind, d])) as Record<NodeKind, NodeDef>;

export type RunStatus = 'idle' | 'running' | 'success' | 'waiting' | 'skipped';

export interface FlowData extends Record<string, unknown> {
  kind: NodeKind;
  title: string;
  lines: string[];
  branches?: string[];
  status?: RunStatus;
  ms?: number;
}

export type FlowNode = Node<FlowData, 'flow'>;

const STATUS_RING: Record<RunStatus, string> = {
  idle: 'var(--border)', running: '#3370ff', success: '#12b76a', waiting: '#dd2590', skipped: 'var(--border)',
};

function StatusIcon({ s }: { s?: RunStatus }) {
  if (s === 'running') return <LoaderCircle size={15} className="spin" color="#3370ff" />;
  if (s === 'success') return <CheckCircle2 size={15} color="#12b76a" />;
  if (s === 'waiting') return <Hourglass size={15} color="#dd2590" />;
  return null;
}

export const FlowNodeView = memo(function FlowNodeView({ data, selected }: NodeProps<FlowNode>) {
  const def = DEF[data.kind];
  const I = def.icon;
  const status = data.status ?? 'idle';
  const isEntry = data.kind === 'start' || data.kind === 'sys';
  return (
    <div style={{
      width: 248, background: '#fff', borderRadius: 12, padding: '10px 12px 12px',
      border: `1.5px solid ${selected ? 'var(--primary)' : STATUS_RING[status]}`,
      boxShadow: selected ? '0 0 0 3px var(--primary-50), var(--shadow)' : 'var(--shadow)',
      opacity: status === 'skipped' ? 0.45 : 1, transition: 'border-color .2s, opacity .2s',
    }}>
      {!isEntry ? <Handle type="target" position={Position.Left} style={{ top: 22 }} /> : null}
      <div className="row" style={{ gap: 8 }}>
        <span className="avatar-tile sm" style={{ background: def.color, width: 24, height: 24 }}><I size={13} /></span>
        <strong style={{ fontSize: 13 }} className="grow ellipsis">{data.title}</strong>
        {data.ms && status === 'success' ? <span className="faint" style={{ fontSize: 11 }}>{data.ms}ms</span> : null}
        <StatusIcon s={status} />
      </div>
      {data.lines.length ? (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.lines.map((l) => <div key={l} className="ellipsis" style={{ fontSize: 12, color: 'var(--text-3)', background: 'var(--bg-soft)', borderRadius: 6, padding: '3px 8px' }}>{l}</div>)}
        </div>
      ) : null}
      {data.branches ? (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.branches.map((b, i) => (
            <div key={b} style={{ position: 'relative', fontSize: 12, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, marginRight: -12, borderRight: 0, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>
              <span style={{ color: def.color, fontWeight: 600, marginRight: 6 }}>{data.kind === 'ifelse' ? (i === 0 ? 'IF' : 'ELSE') : `#${i + 1}`}</span>{b}
              <Handle type="source" id={`b${i}`} position={Position.Right} style={{ right: -5 }} />
            </div>
          ))}
        </div>
      ) : data.kind !== 'sys' && data.kind !== 'answer' ? <Handle type="source" position={Position.Right} style={{ top: 22 }} /> : null}
    </div>
  );
});

export const nodeTypes = { flow: FlowNodeView };
