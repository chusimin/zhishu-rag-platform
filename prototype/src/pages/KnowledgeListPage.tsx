import { AlertTriangle, BookText, Boxes, CheckCircle2, FileSpreadsheet, Globe, LoaderCircle, MessagesSquare, Plus, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { appById, KB_TYPE_META, KNOWLEDGE_BASES, MODELS, type KnowledgeBase } from '../data/mock';
import { Dev, Field, Modal, Tag, useToast } from '../components/ui';

const TYPE_ICON: Record<KnowledgeBase['type'], ReactNode> = {
  general: <BookText size={20} />,
  qa: <MessagesSquare size={20} />,
  table: <FileSpreadsheet size={20} />,
  web: <Globe size={20} />,
  feishu: <Boxes size={20} />,
};

const DEV_FOR_TYPE: Record<KnowledgeBase['type'], 'ready' | 'partial' | 'todo'> = { general: 'ready', qa: 'todo', table: 'partial', web: 'todo', feishu: 'todo' };

export function HealthTag({ health }: { health: KnowledgeBase['health'] }) {
  if (health === 'ok') return <Tag tone="green"><CheckCircle2 size={12} />可用</Tag>;
  if (health === 'building') return <Tag tone="blue"><LoaderCircle size={12} className="spin" />索引中</Tag>;
  return <Tag tone="orange"><AlertTriangle size={12} />1 个文件失败</Tag>;
}

export function KnowledgeListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<KnowledgeBase['type']>('general');
  const [name, setName] = useState('');

  const list = KNOWLEDGE_BASES.filter((k) => !q || `${k.name}${k.desc}`.includes(q));

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>知识库</h1>
          <p>管理企业知识资产。每个导入的文件可以使用不同的切块方式，构建前先预览效果。</p>
        </div>
        <div className="search-box" style={{ width: 260 }}><Search size={15} /><input className="input" placeholder="搜索知识库" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn primary" onClick={() => setOpen(true)}><Plus size={16} />新建知识库</button>
      </div>

      <div className="grid auto">
        {list.map((k) => (
          <article key={k.id} className="card pad hover" onClick={() => navigate(`/knowledge/${k.id}`)}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <span className="avatar-tile lg" style={{ background: k.color }}>{TYPE_ICON[k.type]}</span>
              <div className="grow">
                <strong style={{ fontSize: 15 }}>{k.name}</strong>
                <div className="row" style={{ marginTop: 4 }}><Tag>{KB_TYPE_META[k.type].name}</Tag><HealthTag health={k.health} /></div>
              </div>
            </div>
            <p className="muted clamp-2" style={{ fontSize: 13, marginTop: 10, minHeight: 42 }}>{k.desc}</p>
            <div className="row" style={{ marginTop: 12, gap: 16, fontSize: 13 }}>
              <span><strong>{k.collections}</strong> <span className="faint">个文件</span></span>
              <span><strong>{k.chunks.toLocaleString()}</strong> <span className="faint">个分块</span></span>
              <span className="grow" />
              <span className="faint">{k.embedding}</span>
            </div>
            <div className="divider" style={{ margin: '12px 0' }} />
            <div className="row faint">
              <span>被 {k.usedBy.length} 个应用引用：</span>
              <span className="ellipsis grow">{k.usedBy.map((id) => appById(id)?.name).join('、')}</span>
            </div>
          </article>
        ))}
      </div>

      <Modal open={open} title="新建知识库" onClose={() => setOpen(false)}
        footer={<><button className="btn" onClick={() => setOpen(false)}>取消</button><button className="btn primary" disabled={!name.trim()} onClick={() => { setOpen(false); toast(`已创建「${name}」，下一步导入数据`); navigate('/knowledge/kb-product/import'); }}>创建并导入数据</button></>}>
        <Field label="知识库类型" required>
          <div className="grid c3" style={{ gap: 10 }}>
            {(Object.keys(KB_TYPE_META) as KnowledgeBase['type'][]).map((t) => (
              <button key={t} type="button" className={`method-card ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>
                <span style={{ color: 'var(--primary)' }}>{TYPE_ICON[t]}</span>
                <div><h4>{KB_TYPE_META[t].name}<Dev s={DEV_FOR_TYPE[t]} /></h4><p>{KB_TYPE_META[t].desc}</p></div>
              </button>
            ))}
          </div>
        </Field>
        <Field label="名称" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：华东区域销售政策" autoFocus /></Field>
        <Field label="简介" hint="应用的 AI 会据此判断何时检索本库"><textarea className="textarea" style={{ minHeight: 64 }} placeholder="说明知识库包含哪些内容、适合回答什么问题" /></Field>
        {type === 'web' ? <Field label="站点地址" required><input className="input" placeholder="https://help.example.com/docs" /></Field> : null}
        {type === 'feishu' ? <Field label="飞书知识空间" required><select className="select"><option>产品中心 / 帮助文档</option><option>人力行政 / 制度汇编</option></select></Field> : null}
        <div className="form-grid">
          <Field label="索引模型" required hint="创建后不可更改">
            <select className="select">{MODELS.filter((m) => m.type === 'Embedding').map((m) => <option key={m.name}>{m.name} · {m.provider}</option>)}</select>
          </Field>
          <Field label="文本理解模型" hint="用于问答拆分、语义分块、索引增强">
            <select className="select">{MODELS.filter((m) => m.type === 'LLM').map((m) => <option key={m.name}>{m.name}</option>)}</select>
          </Field>
        </div>
        <Field label="图片理解模型" hint="扫描件、图片、图表的 OCR 与描述">
          <select className="select"><option>Qwen-VL-Max · 通义千问</option><option>不处理图片</option></select>
        </Field>
      </Modal>
    </div>
  );
}
