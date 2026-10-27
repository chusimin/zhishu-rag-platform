import { AlertTriangle, ArrowLeft, CheckCircle2, Cloud, Play, Rocket } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { APP_TYPE_META, appById, APPS, STATUS_META } from '../data/mock';
import { AgentEditor } from '../editors/AgentEditor';
import { FlowEditor } from '../editors/FlowEditor';
import { SimpleEditor } from '../editors/SimpleEditor';
import { Field, Modal, Tag, Tile, useToast } from '../components/ui';
import { EvalView, LogsView, PublishView, VersionsView } from './AppOpsViews';

const TABS = [
  { key: 'edit', name: '编排' },
  { key: 'publish', name: '发布渠道' },
  { key: 'logs', name: '对话日志' },
  { key: 'eval', name: '评测' },
  { key: 'versions', name: '版本' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function AppEditorPage() {
  const { appId = '' } = useParams();
  const app = appById(appId) ?? APPS[0];
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabKey) || 'edit';
  const [publishing, setPublishing] = useState(false);
  const evalFailed = app.status === 'testing';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="topbar">
        <button className="btn ghost sm icon" aria-label="返回" onClick={() => navigate('/apps')}><ArrowLeft size={16} /></button>
        <Tile icon={app.icon} color={app.color} size="sm" />
        <div>
          <div className="title row" style={{ gap: 6 }}>{app.name}<Tag tone={APP_TYPE_META[app.type].color}>{APP_TYPE_META[app.type].tag}</Tag></div>
        </div>
        <div className="tabs" style={{ marginLeft: 16 }}>
          {TABS.map((t) => <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setParams(t.key === 'edit' ? {} : { tab: t.key })}>{t.name}</button>)}
        </div>
        <span className="grow" />
        <span className="faint row" style={{ gap: 4 }}><Cloud size={13} />草稿已自动保存 10:42</span>
        <Tag tone={STATUS_META[app.status].tone}>线上 {app.version ?? '未发布'}</Tag>
        <button className="btn" onClick={() => navigate(`/chat/${app.id}`)}><Play size={14} />试用线上版</button>
        <button className="btn primary" onClick={() => setPublishing(true)}><Rocket size={14} />发布</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: tab === 'edit' ? 'hidden' : 'auto' }}>
        {tab === 'edit' ? (app.type === 'chatflow' ? <FlowEditor app={app} /> : app.type === 'agent' ? <AgentEditor app={app} /> : <SimpleEditor app={app} />) : null}
        {tab === 'publish' ? <PublishView app={app} /> : null}
        {tab === 'logs' ? <LogsView app={app} /> : null}
        {tab === 'eval' ? <EvalView app={app} /> : null}
        {tab === 'versions' ? <VersionsView app={app} /> : null}
      </div>

      <Modal open={publishing} title="发布新版本" onClose={() => setPublishing(false)}
        footer={<><button className="btn" onClick={() => setPublishing(false)}>取消</button><button className="btn primary" onClick={() => { setPublishing(false); toast(`已发布 ${app.version ? `v${Number(app.version.slice(1)) + 1}` : 'v1'}，工作台与各渠道即时生效`); }}>{evalFailed ? '仍然发布' : '确认发布'}</button></>}>
        <div className="card pad" style={{ background: evalFailed ? 'var(--orange-50)' : 'var(--green-50)', borderColor: evalFailed ? '#fef0c7' : '#d1fadf', marginBottom: 16 }}>
          <div className="row">
            {evalFailed ? <AlertTriangle size={18} color="#f79009" /> : <CheckCircle2 size={18} color="#12b76a" />}
            <strong>{evalFailed ? '评测 21 / 24 通过，有 3 条未通过' : '评测 24 / 24 全部通过'}</strong>
            <span className="grow" />
            <button className="btn sm ghost" onClick={() => { setPublishing(false); setParams({ tab: 'eval' }); }}>查看评测</button>
          </div>
          <p className="faint" style={{ marginTop: 4 }}>{evalFailed ? '未通过用例：价格调整条款识别、违约金上限、管辖法院。建议修复后再发布。' : '基于当前草稿运行，耗时 48 秒。'}</p>
        </div>
        <Field label="版本说明" required><textarea className="textarea" style={{ minHeight: 70 }} defaultValue={app.type === 'chatflow' ? '大纲确认节点增加「补充要求」输入；章节撰写改为并行执行。' : '新增订单查询工具；竞品比价自动转人工。'} /></Field>
        <div className="kv">
          <dt>变更内容</dt><dd>{app.type === 'chatflow' ? '修改 2 个节点、新增 1 条连线' : '提示词、工具 +1、转人工规则 +1'}</dd>
          <dt>生效渠道</dt><dd>工作台、官网嵌入、企业微信、API</dd>
          <dt>回滚</dt><dd>可随时一键回滚到 {app.version ?? '上一版本'}</dd>
        </div>
      </Modal>
    </div>
  );
}
