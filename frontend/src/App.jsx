import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  Terminal,
  Send,
  Server,
  User,
  Cpu,
  ShieldCheck,
  Paintbrush,
  Activity,
  Radar,
  Wifi,
  Database,
  CircleDashed,
  Bot,
  ChevronRight,
} from 'lucide-react';

const icons = {
  candy: <Server className="text-cyan-300" size={22} />,
  panda: <User className="text-emerald-300" size={22} />,
  banana: <ShieldCheck className="text-amber-300" size={22} />,
  apple: <Paintbrush className="text-fuchsia-300" size={22} />,
  codex: <Cpu className="text-indigo-300" size={22} />,
};

const panelBase =
  'rounded-2xl border border-cyan-400/20 bg-slate-950/70 backdrop-blur-xl shadow-[0_0_0_1px_rgba(14,116,144,0.1),0_18px_45px_rgba(2,6,23,0.75)]';

const toLog = (level, text) => ({
  level,
  text,
  time: new Date().toLocaleTimeString(),
});

export default function App() {
  const [agents, setAgents] = useState({});
  const [selectedAgent, setSelectedAgent] = useState('candy');
  const [taskMessage, setTaskMessage] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchStatus = () => {
      axios
        .get('/api/status')
        .then((res) => setAgents(res.data.data))
        .catch(() => {
          setLogs((prev) => [...prev, toLog('error', '状态同步失败，无法连接主控网关')]);
        });
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = useMemo(
    () => Object.values(agents).filter((a) => a.status === 'online').length,
    [agents],
  );

  const selectedName = agents[selectedAgent]?.name || '目标智能体';

  const handleDispatch = async () => {
    if (!taskMessage.trim() || loading) return;
    setLoading(true);

    setLogs((prev) => [...prev, toLog('send', `Dispatch -> ${selectedName}: ${taskMessage}`)]);

    try {
      await axios.post('/api/dispatch', {
        target: selectedAgent,
        message: taskMessage,
      });
      setLogs((prev) => [...prev, toLog('ok', `Ack <- ${selectedName}: 任务已接收并排队执行`)]);
    } catch {
      setLogs((prev) => [...prev, toLog('error', `NACK <- ${selectedName}: 通信失败或目标离线`)]);
    }

    setTaskMessage('');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-28 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-cyan-500/20 blur-[110px]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-indigo-500/20 blur-[100px]" />
        <div className="absolute left-0 top-1/3 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-[100px]" />
      </div>

      <main className="relative mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <header className={`${panelBase} mb-6 p-5 md:p-6`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-xl border border-cyan-300/40 bg-cyan-500/10 p-3 shadow-[0_0_25px_rgba(6,182,212,0.35)]">
                <Radar className="text-cyan-300" size={28} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Lemon Command Grid</p>
                <h1 className="text-2xl font-semibold md:text-3xl">多智能体作战监控仪表盘</h1>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs md:w-[27rem]">
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2">
                <p className="text-emerald-200/70">在线智能体</p>
                <p className="mt-1 font-mono text-lg text-emerald-300">
                  {onlineCount} <span className="text-emerald-200/60">/ {Object.keys(agents).length || 5}</span>
                </p>
              </div>
              <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2">
                <p className="text-cyan-200/70">控制链路</p>
                <p className="mt-1 flex items-center gap-1 font-mono text-cyan-300">
                  <Wifi size={14} /> WS / IPC
                </p>
              </div>
              <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 px-3 py-2">
                <p className="text-indigo-200/70">主控节点</p>
                <p className="mt-1 font-mono text-indigo-300">LEMON-MAIN-01</p>
              </div>
              <div className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2">
                <p className="text-fuchsia-200/70">任务吞吐</p>
                <p className="mt-1 font-mono text-fuchsia-300">{logs.length} events</p>
              </div>
            </div>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Object.entries(agents).map(([id, agent]) => {
            const isOnline = agent.status === 'online';
            const isSelected = selectedAgent === id;

            return (
              <button
                key={id}
                onClick={() => setSelectedAgent(id)}
                className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 ${
                  isSelected
                    ? 'border-cyan-300/70 bg-cyan-500/10 shadow-[0_0_35px_rgba(34,211,238,0.28)]'
                    : 'border-slate-700/80 bg-slate-900/60 hover:border-cyan-400/50 hover:bg-slate-900/90'
                }`}
              >
                <div className="absolute right-0 top-0 h-24 w-24 translate-x-10 -translate-y-10 rounded-full bg-cyan-400/10 blur-2xl" />
                <div className="relative">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="rounded-xl border border-slate-700/80 bg-slate-950/90 p-2.5">{icons[id] || <Bot size={22} />}</div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${
                        isOnline
                          ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-rose-400/40 bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      <CircleDashed size={12} className={isOnline ? 'animate-spin [animation-duration:2.6s]' : ''} />
                      {isOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>

                  <h2 className="text-lg font-semibold text-slate-100">{agent.name}</h2>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                    <Activity size={13} /> {agent.role}
                  </p>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-700/70 pt-3 text-xs text-slate-400">
                    <span className="font-mono">ID: {id}</span>
                    <span className="inline-flex items-center gap-1 text-cyan-300/90">
                      LOCK
                      <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className={`${panelBase} xl:col-span-2 p-5 md:p-6`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-cyan-200">
                <Send size={18} /> 任务下发控制台
              </h3>
              <span className="rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 font-mono text-[11px] text-slate-300">
                target::{selectedName}
              </span>
            </div>

            <div className="rounded-xl border border-slate-700/80 bg-[#030712]/95 p-4 shadow-inner shadow-cyan-900/20">
              <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                <Terminal size={14} /> dispatch-shell@lemon-main
              </div>
              <div className="text-[13px] font-mono leading-6 text-slate-300">
                <div className="mb-2 text-cyan-300/90">$ attach --agent {selectedAgent}</div>
                <div className="mb-2 text-emerald-300/90">channel status: stable</div>
                <div className="text-slate-500">请输入任务指令并发送至目标智能体。</div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 md:flex-row">
              <input
                type="text"
                value={taskMessage}
                onChange={(e) => setTaskMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDispatch()}
                placeholder={`输入任务并发送给 ${selectedName}`}
                className="h-12 flex-1 rounded-xl border border-cyan-500/30 bg-slate-900/80 px-4 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
              <button
                onClick={handleDispatch}
                disabled={loading}
                className="h-12 rounded-xl border border-cyan-300/50 bg-cyan-500/20 px-5 font-semibold text-cyan-100 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? '发送中...' : '发送指令'}
              </button>
            </div>
          </div>

          <div className={`${panelBase} p-5 md:p-6`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-indigo-200">
                <Database size={18} /> 日志控制台
              </h3>
              <span className="rounded-md border border-slate-700 bg-slate-900/80 px-2 py-1 font-mono text-[11px] text-slate-400">
                stream::{logs.length}
              </span>
            </div>

            <div className="h-[360px] overflow-y-auto rounded-xl border border-slate-700/80 bg-[#020617]/95 p-3 font-mono text-[12px] leading-6 md:h-[410px]">
              {logs.length === 0 ? (
                <div className="text-slate-500">[SYS] 暂无通信记录，等待任务下发...</div>
              ) : (
                logs.map((log, i) => (
                  <div
                    key={`${log.time}-${i}`}
                    className={`border-b border-slate-800/70 py-1 last:border-b-0 ${
                      log.level === 'error'
                        ? 'text-rose-300'
                        : log.level === 'ok'
                          ? 'text-emerald-300'
                          : 'text-cyan-200'
                    }`}
                  >
                    <span className="mr-2 text-slate-500">[{log.time}]</span>
                    {log.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
