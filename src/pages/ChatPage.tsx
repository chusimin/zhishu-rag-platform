import { BookOpen, Bot, Check, Clock3, Coins, Copy, FileText, Menu, MessageSquarePlus, RotateCcw, Send, Sparkles, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch, errorMessage, streamChat, type ApiCitation, type ApiConversation, type ApiConversationDetail, type ApiQAApp } from '../api/client';
import { Badge, Button, Drawer, IconButton, Notice } from '../components/ui';
import { MarkdownText } from '../components/MarkdownText';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: ApiCitation[];
  tokens: number | null;
  duration: number | null;
  simulated?: boolean;
};

export function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [apps, setApps] = useState<ApiQAApp[]>([]);
  const [appId, setAppId] = useState(searchParams.get('app') ?? '');
  const [conversations, setConversations] = useState<ApiConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [selectedKnowledge, setSelectedKnowledge] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<ApiCitation | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [error, setError] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    apiFetch<ApiQAApp[]>('/apps').then((loaded) => {
      setApps(loaded);
      const requested = searchParams.get('app');
      setAppId((current) => loaded.some((app) => app.id === requested) ? requested! : current || loaded[0]?.id || '');
    }).catch((caught) => setError(errorMessage(caught)));
  }, [searchParams]);

  const loadConversations = useCallback(async () => {
    if (!appId) return;
    try {
      setConversations(await apiFetch<ApiConversation[]>(`/apps/${appId}/conversations`));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [appId]);

  useEffect(() => { void loadConversations(); }, [loadConversations]);

  const selectedApp = apps.find((app) => app.id === appId);
  useEffect(() => {
    if (!selectedApp) return;
    const storageKey = `knowledge-hub-chat-kbs:${selectedApp.id}`;
    const saved = window.localStorage.getItem(storageKey);
    let parsed: string[] = [];
    try {
      const value = saved ? JSON.parse(saved) : [];
      parsed = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    } catch {
      window.localStorage.removeItem(storageKey);
    }
    const allowed = new Set(selectedApp.knowledge_base_ids);
    const valid = parsed.filter((item) => allowed.has(item));
    setSelectedKnowledge(valid.length ? valid : selectedApp.knowledge_base_ids);
  }, [selectedApp?.id]);

  const stopGeneration = () => abortRef.current?.abort();

  const openConversation = async (id: string) => {
    stopGeneration();
    try {
      const detail = await apiFetch<ApiConversationDetail>(`/conversations/${id}`);
      setConversationId(id);
      setMessages(detail.messages.map((message) => ({ id: message.id, role: message.role, content: message.content, citations: message.citations, tokens: message.input_tokens != null && message.output_tokens != null ? message.input_tokens + message.output_tokens : null, duration: message.duration_ms, simulated: message.simulated })));
      setSessionsOpen(false);
      setError('');
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const newConversation = () => {
    stopGeneration();
    setConversationId(undefined);
    setMessages([]);
    setSessionsOpen(false);
    setError('');
  };

  const generate = async (text: string, baseMessages: ChatMessage[], includeUser: boolean) => {
    if (thinking || !appId) return;
    const timestamp = Date.now();
    const userId = `local-user-${timestamp}`;
    const assistantId = `local-assistant-${timestamp}`;
    const userMessage: ChatMessage = { id: userId, role: 'user', content: text, citations: [], tokens: null, duration: null };
    const assistantMessage: ChatMessage = { id: assistantId, role: 'assistant', content: '', citations: [], tokens: null, duration: null };
    const controller = new AbortController();
    abortRef.current = controller;
    setMessages([...baseMessages, ...(includeUser ? [userMessage] : []), assistantMessage]);
    setInput('');
    setThinking(true);
    setError('');
    try {
      await streamChat(appId, { message: text, conversation_id: conversationId, knowledge_base_ids: selectedKnowledge }, (streamEvent) => {
        if (streamEvent.event === 'meta') setConversationId(streamEvent.data.conversation_id);
        if (streamEvent.event === 'citations') setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, citations: streamEvent.data.items } : message));
        if (streamEvent.event === 'token') setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: message.content + streamEvent.data.text } : message));
        if (streamEvent.event === 'done') setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, id: streamEvent.data.message_id, tokens: streamEvent.data.total_tokens, duration: streamEvent.data.duration_ms, simulated: streamEvent.data.simulated } : message));
        if (streamEvent.event === 'error') throw new Error(streamEvent.data.detail);
      }, controller.signal);
      if (!controller.signal.aborted) await loadConversations();
    } catch (caught) {
      if (controller.signal.aborted) {
        setMessages((current) => current.map((item) => item.id === assistantId && !item.content ? { ...item, content: '已停止生成。' } : item));
      } else {
        const message = errorMessage(caught);
        setError(message);
        setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: `回答失败：${message}` } : item));
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setThinking(false);
      }
    }
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = input.trim();
    if (text) await generate(text, messages, true);
  };

  const regenerate = async (assistantId: string) => {
    const index = messages.findIndex((message) => message.id === assistantId);
    const prompt = messages.slice(0, index).reverse().find((message) => message.role === 'user');
    if (prompt) await generate(prompt.content, messages.slice(0, index), false);
  };

  const copyMessage = async (message: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId((current) => current === message.id ? '' : current), 1600);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const toggleKnowledgeBase = (knowledgeBaseId: string) => {
    if (!selectedApp) return;
    setSelectedKnowledge((current) => {
      const next = current.includes(knowledgeBaseId)
        ? current.filter((item) => item !== knowledgeBaseId)
        : [...current, knowledgeBaseId];
      if (!next.length) return current;
      window.localStorage.setItem(`knowledge-hub-chat-kbs:${selectedApp.id}`, JSON.stringify(next));
      return next;
    });
  };
  const switchApp = (next: string) => {
    stopGeneration();
    setAppId(next);
    setSearchParams({ app: next });
    setConversationId(undefined);
    setMessages([]);
  };

  const lastAssistantId = messages.filter((message) => message.role === 'assistant').at(-1)?.id;

  return (
    <main className="chat-page page-enter">
      <aside className={`chat-sessions ${sessionsOpen ? 'chat-sessions--open' : ''}`}><header><div><span className="preview-avatar"><Bot size={17} /></span><span><strong>{selectedApp?.name ?? '知识助手'}</strong><small>企业内部问答</small></span></div><IconButton label="关闭会话列表" className="session-close" onClick={() => setSessionsOpen(false)}><Menu size={18} /></IconButton></header><Button icon={<MessageSquarePlus size={17} />} onClick={newConversation}>新建对话</Button><div className="session-group"><span>最近对话</span>{conversations.map((conversation) => <button className={`session-item ${conversation.id === conversationId ? 'active' : ''}`} key={conversation.id} onClick={() => void openConversation(conversation.id)}><span>{conversation.title}</span><small>{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(conversation.updated_at))}</small></button>)}</div></aside>
      <section className="chat-main"><header className="chat-header"><IconButton label="打开会话列表" className="session-open" onClick={() => setSessionsOpen(true)}><Menu size={19} /></IconButton><div><strong>{selectedApp?.name ?? '尚无可用应用'}</strong><span><i />{selectedApp?.is_enabled ? '应用已启用' : '草稿预览'}</span></div>{apps.length ? <select className="field chat-app-select" value={appId} aria-label="选择问答应用" onChange={(event) => switchApp(event.target.value)}>{apps.map((app) => <option value={app.id} key={app.id}>{app.name}</option>)}</select> : null}</header>
        {selectedApp && selectedApp.knowledge_bases.length > 1 ? <div className="chat-kb-selector"><span>本次检索范围</span><div>{selectedApp.knowledge_bases.map((kb) => <button type="button" className={selectedKnowledge.includes(kb.id) ? 'active' : ''} aria-pressed={selectedKnowledge.includes(kb.id)} key={kb.id} onClick={() => toggleKnowledgeBase(kb.id)}><BookOpen size={14} />{kb.name}</button>)}</div><small>可组合多个知识库，至少保留一个。</small></div> : null}
        <div className="chat-scroll">
          {error ? <Notice tone="error" title="问答链路异常">{error}</Notice> : null}
          {!apps.length ? <div className="chat-empty"><span className="preview-avatar large"><Bot size={23} /></span><h1>尚无可用问答应用</h1><p>请由知识库管理人员完成应用配置并启用。</p></div> : messages.length === 0 ? <div className="chat-empty"><span className="preview-avatar large"><Sparkles size={23} /></span><h1>今天想了解什么？</h1><p>回答会依据已配置知识库生成，并标明引用来源。</p><div><button onClick={() => setInput('请介绍知识库中的主要内容')}>知识库包含哪些内容？</button><button onClick={() => setInput('请给出相关制度和来源')}>查询相关制度</button></div></div> : null}
          <div className="message-stack">{messages.map((message) => message.role === 'user' ? <div className="message message--user" key={message.id}>{message.content}</div> : <div className="message message--assistant" key={message.id}><div className="assistant-mark"><Sparkles size={15} /></div><div>
            {!message.content && thinking ? <div className="preview-thinking" role="status"><span /><span /><span /> 正在检索并生成回答</div> : <MarkdownText content={message.content} />}
            {message.citations.length ? <div className="citation-list">{message.citations.map((item) => <button className="citation" key={item.chunk_id} onClick={() => setSelectedCitation(item)}><BookOpen size={14} />{item.filename}{item.page_number ? ` · 第 ${item.page_number} 页` : ''}</button>)}</div> : null}
            {message.content ? <><div className="message-meta"><span>{message.simulated ? '测试替身回答' : '模型回答'}</span><span><Coins size={13} />{message.tokens == null ? 'Token 未返回' : `${message.tokens.toLocaleString()} Tokens`}</span><span><Clock3 size={13} />{message.duration == null ? '生成中' : `${(message.duration / 1000).toFixed(2)}s`}</span></div><div className="message-actions"><Button variant="ghost" icon={copiedMessageId === message.id ? <Check size={14} /> : <Copy size={14} />} onClick={() => void copyMessage(message)} aria-live="polite">{copiedMessageId === message.id ? '已复制' : '复制'}</Button>{message.id === lastAssistantId && !thinking ? <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={() => void regenerate(message.id)}>重新生成</Button> : null}</div></> : null}
          </div></div>)}</div>
        </div>
        <footer className="chat-composer-wrap"><form className="chat-composer" onSubmit={(event) => void send(event)}><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} aria-label="输入问题" placeholder="询问企业知识，Enter 发送，Shift + Enter 换行" />{thinking ? <Button type="button" variant="danger" icon={<Square size={15} />} onClick={stopGeneration}>停止生成</Button> : <Button type="submit" variant="primary" icon={<Send size={17} />} disabled={!input.trim() || !appId || !selectedKnowledge.length}>发送</Button>}</form><p>角色选择仅用于体验视角，不构成真实鉴权；回答请以引用原文为准。</p></footer>
      </section>
      {sessionsOpen ? <button className="session-scrim" aria-label="关闭会话列表" onClick={() => setSessionsOpen(false)} /> : null}
      <Drawer open={Boolean(selectedCitation)} title="引用来源" description={selectedCitation ? `${selectedCitation.filename}${selectedCitation.page_number ? ` · 第 ${selectedCitation.page_number} 页` : ''}` : ''} onClose={() => setSelectedCitation(null)} footer={<Button variant="primary" onClick={() => setSelectedCitation(null)}>关闭</Button>}>{selectedCitation ? <div className="citation-detail"><div><Badge tone="info">相关度 {selectedCitation.score.toFixed(3)}</Badge>{selectedCitation.rerank_score != null ? <Badge>Rerank {selectedCitation.rerank_score.toFixed(3)}</Badge> : null}</div><h2>{selectedCitation.title}</h2><p>{selectedCitation.content}</p><div className="source-preview"><FileText size={20} /><span><strong>{selectedCitation.filename}</strong><small>分块 {selectedCitation.chunk_id.slice(0, 8)}</small></span></div></div> : null}</Drawer>
    </main>
  );
}
