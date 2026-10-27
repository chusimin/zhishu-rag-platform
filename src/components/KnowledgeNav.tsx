import { ArrowLeft, Files, Scissors, SearchCheck } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';

export function KnowledgeNav({ id, name }: { id: string; name: string }) {
  const items = [
    { to: `/knowledge/${id}`, label: '文件与任务', icon: Files, end: true },
    { to: `/knowledge/${id}/chunks`, label: '分块预览', icon: Scissors, end: false },
    { to: `/knowledge/${id}/test`, label: '检索测试', icon: SearchCheck, end: false },
  ];
  return (
    <div className="resource-nav">
      <Link className="resource-back" to="/knowledge"><ArrowLeft size={16} />全部知识库</Link>
      <div className="resource-title"><span className="resource-avatar">知</span><div><strong>{name}</strong><small>知识库工作区</small></div></div>
      <nav aria-label={`${name} 二级导航`}>
        {items.map((item) => {
          const Icon = item.icon;
          return <NavLink key={item.to} end={item.end} to={item.to}><Icon size={17} />{item.label}</NavLink>;
        })}
      </nav>
    </div>
  );
}
