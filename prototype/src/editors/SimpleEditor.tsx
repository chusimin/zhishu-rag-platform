import { Bot, BookOpen, FileUp, FormInput, MessageSquareText, Plus, Shield, Sparkles, Wrench } from 'lucide-react';
import { ChatPanel } from '../components/ChatPanel';
import { Dev, Switch, Tag } from '../components/ui';
import type { AppItem } from '../data/mock';
import { KnowledgePicker, ListEditor, ModelPicker, PromptBox, Section } from './common';

const FIELDS_BY_APP: Record<string, { key: string; label: string; type: string; required: boolean }[]> = {
  'app-marketing': [
    { key: 'product', label: '产品 / 活动', type: '单行文本', required: true },
    { key: 'selling_points', label: '核心卖点', type: '多行文本', required: true },
    { key: 'channels', label: '发布渠道', type: '多选', required: true },
    { key: 'tone', label: '语气', type: '下拉', required: false },
  ],
  'app-minutes': [
    { key: 'transcript', label: '会议转写稿', type: '多行文本', required: true },
    { key: 'meeting_type', label: '会议类型', type: '下拉', required: false },
  ],
};

export function SimpleEditor({ app }: { app: AppItem }) {
  const fields = FIELDS_BY_APP[app.id] ?? [];
  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <div style={{ width: 560, flex: 'none', overflow: 'auto', padding: '4px 24px 24px', borderRight: '1px solid var(--border)' }}>
        <Section icon={<Bot size={16} />} title="AI 配置">
          <div className="field-label">对话模型</div>
          <ModelPicker value={app.model} />
          <div className="field-label" style={{ marginTop: 14 }}>提示词<span className="hint">可用 {'{{变量}}'} 引用表单输入</span></div>
          <PromptBox vars={fields.map((f) => f.key).concat(['当前时间', '用户部门'])} value={app.id === 'app-policy'
            ? '# 角色\n你是公司的制度问答助手，服务对象是公司员工。\n\n# 要求\n1. 只依据知识库中的制度原文回答，先给结论，再说明依据条款。\n2. 涉及金额、天数、审批层级时必须原样引用，不得推算。\n3. 制度未覆盖的问题，回答「制度中暂无明确规定」，并建议联系 {{用户部门}} 的 HRBP。'
            : '# 角色\n你是资深的品牌内容编辑。\n\n# 任务\n根据 {{product}} 和 {{selling_points}}，分别为 {{channels}} 生成文案，语气为 {{tone}}。\n\n# 约束\n- 产品参数必须与知识库一致，不得夸大功效\n- 每个渠道遵循平台风格与字数限制'} />
        </Section>

        <Section icon={<BookOpen size={16} />} title="知识库" extra={<Tag>{app.knowledge.length} 个</Tag>}>
          <KnowledgePicker initial={app.knowledge} />
        </Section>

        <Section icon={<FormInput size={16} />} title={<>表单输入<span className="faint" style={{ fontWeight: 400 }}> · 用户开始前需填写</span></>} extra={<button className="btn sm ghost"><Plus size={13} />添加字段</button>}>
          {fields.length ? (
            <table className="table" style={{ fontSize: 13 }}>
              <thead><tr><th>变量</th><th>名称</th><th>类型</th><th>必填</th></tr></thead>
              <tbody>{fields.map((f) => <tr key={f.key}><td className="mono">{f.key}</td><td>{f.label}</td><td><Tag>{f.type}</Tag></td><td>{f.required ? '是' : '否'}</td></tr>)}</tbody>
            </table>
          ) : <p className="faint">未配置表单，用户直接对话。适合问答类应用。</p>}
        </Section>

        <Section icon={<Wrench size={16} />} title="工具" defaultOpen={false} extra={<Tag>0 个</Tag>}>
          <p className="faint">简易应用可挂载少量工具。需要多步骤或自主决策时，建议<a style={{ color: 'var(--primary)' }}>转换为 Chat Flow</a>。</p>
        </Section>

        <Section icon={<MessageSquareText size={16} />} title="对话体验">
          <div className="field-label">开场白</div>
          <textarea className="textarea" style={{ minHeight: 60 }} defaultValue={app.opening ?? ''} placeholder="用户进入时看到的第一句话" />
          <div className="field-label" style={{ marginTop: 12 }}>猜你想问</div>
          <ListEditor items={app.suggestions ?? []} placeholder="添加一个推荐问题" />
          <div className="col" style={{ gap: 10, marginTop: 14 }}>
            <div className="row"><Sparkles size={14} className="muted" /><span className="grow">回答后推荐追问<Dev s="todo" /></span><Switch on onChange={() => undefined} label="追问" /></div>
            <div className="row"><FileUp size={14} className="muted" /><span className="grow">允许上传文件 / 图片<Dev s="todo" /></span><Switch on={app.id === 'app-minutes'} onChange={() => undefined} label="上传" /></div>
            <div className="row"><span className="grow">输出格式</span><select className="select sm" style={{ width: 140 }}><option>Markdown</option><option>纯文本</option><option>JSON</option></select></div>
          </div>
        </Section>

        <Section icon={<Shield size={16} />} title="安全与合规" defaultOpen={false}>
          <div className="col" style={{ gap: 10 }}>
            <div className="row"><span className="grow">回答必须附引用<Dev s="ready" /></span><Switch on={app.knowledge.length > 0} onChange={() => undefined} label="必须引用" /></div>
            <div className="row"><span className="grow">无依据时拒答<Dev s="ready" /></span><Switch on={app.id === 'app-policy'} onChange={() => undefined} label="拒答" /></div>
            <div className="field-label" style={{ marginBottom: 0 }}>禁止话题</div>
            <ListEditor items={['薪资明细', '未公开的人事任免']} placeholder="添加禁止话题" />
          </div>
        </Section>
      </div>
      <div className="grow" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-soft)' }}>
        <ChatPanel app={app} debug title={<><strong>调试预览</strong><Tag tone="orange">草稿</Tag></>} />
      </div>
    </div>
  );
}
