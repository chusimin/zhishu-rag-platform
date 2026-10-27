import { ArrowRight, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { login } from '../api/auth';
import { Button, Notice } from '../components/ui';

export function LoginPage({ onLogin }: { onLogin: (role: 'admin' | 'manager' | 'user') => void }) {
  const [email, setEmail] = useState('admin@fde.local');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await login(email, password);
      onLogin(response.user.memberships[0]?.role ?? 'user');
      navigate('/dashboard');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return <main className="login-page"><section className="login-intro"><div className="role-brand"><span className="brand-mark">知</span><span>知枢 FDE</span></div><BadgeLine /><h1>让 AI 应用交付<br />成为标准流程</h1><p>从业务需求到应用协议、评测和发布，人与 AI 共用同一套交付工作台。</p><div className="login-proof"><span><ShieldCheck size={17} />工作区与资源权限隔离</span><span><KeyRound size={17} />支持 Agent API Token</span></div></section><section className="card login-card"><header><span>业务空间登录</span><h2>欢迎回来</h2><p>使用管理员或业务成员账号进入。</p></header>{error ? <Notice tone="error" title="登录失败">{error}</Notice> : null}<form className="form-stack" onSubmit={(event) => void submit(event)}><label className="form-label">邮箱<input className="field" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label className="form-label">密码<input className="field" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></label><Button variant="primary" type="submit" disabled={busy} icon={busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}>{busy ? '正在登录…' : '进入工作台'}</Button></form><footer><span>开发环境初始账号：admin@fde.local</span><small>密码由 APP_BOOTSTRAP_ADMIN_PASSWORD 配置；生产环境请使用企业账号。</small></footer></section></main>;
}

function BadgeLine() {
  return <div className="login-version"><span>FDE APPLICATION PLATFORM</span><i />2.0</div>;
}
