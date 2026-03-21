import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Terminal, Send, Server, User, Cpu, ShieldCheck, Paintbrush, Activity } from 'lucide-react';

const icons = {
  candy: <Server className="text-blue-500" size={24} />,
  panda: <User className="text-green-500" size={24} />,
  banana: <ShieldCheck className="text-yellow-500" size={24} />,
  apple: <Paintbrush className="text-pink-500" size={24} />,
  codex: <Cpu className="text-purple-500" size={24} />
};

export default function App() {
  const [agents, setAgents] = useState({});
  const [selectedAgent, setSelectedAgent] = useState('candy');
  const [taskMessage, setTaskMessage] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios.get('http://localhost:3001/api/status')
      .then(res => setAgents(res.data.data))
      .catch(err => console.error(err));
  }, []);

  const handleDispatch = async () => {
    if (!taskMessage.trim()) return;
    setLoading(true);
    setLogs(prev => [...prev, `[发送] 致 ${agents[selectedAgent]?.name}: ${taskMessage}`]);
    
    try {
      const res = await axios.post('http://localhost:3001/api/dispatch', {
        target: selectedAgent,
        message: taskMessage
      });
      setLogs(prev => [...prev, `[成功] ${agents[selectedAgent]?.name} 回复: 任务已接收`]);
    } catch (error) {
      setLogs(prev => [...prev, `[错误] ${agents[selectedAgent]?.name}: 通信失败`]);
    }
    
    setTaskMessage('');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex items-center space-x-3 pb-4 border-b border-gray-800">
          <Terminal size={32} className="text-green-400" />
          <h1 className="text-3xl font-bold">Agent Dashboard <span className="text-gray-500 text-xl font-normal">多智能体总指挥台</span></h1>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(agents).map(([id, agent]) => (
            <div 
              key={id} 
              onClick={() => setSelectedAgent(id)}
              className={`p-6 rounded-xl border-2 cursor-pointer transition-all duration-200 ${selectedAgent === id ? 'border-green-500 bg-gray-800 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'}`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-gray-900 rounded-lg">{icons[id]}</div>
                <span className={`px-3 py-1 text-xs font-semibold rounded-full ${agent.status === 'online' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                  {agent.status.toUpperCase()}
                </span>
              </div>
              <h2 className="text-xl font-bold mb-1">{agent.name}</h2>
              <p className="text-gray-400 text-sm flex items-center"><Activity size={14} className="mr-1"/> {agent.role}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-96">
          {/* Dispatch Center */}
          <div className="lg:col-span-2 flex flex-col bg-gray-800 rounded-xl border border-gray-700 p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center"><Send size={18} className="mr-2"/> 任务下发控制台</h3>
            <div className="flex-1 overflow-y-auto bg-gray-900 rounded-lg p-4 font-mono text-sm mb-4 border border-gray-700">
              {logs.length === 0 ? <span className="text-gray-500">暂无通信记录...</span> : 
                logs.map((log, i) => (
                  <div key={i} className={`mb-2 ${log.includes('[错误]') ? 'text-red-400' : log.includes('[成功]') ? 'text-green-400' : 'text-gray-300'}`}>
                    <span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span> {log}
                  </div>
                ))}
            </div>
            <div className="flex space-x-2">
              <input 
                type="text" 
                value={taskMessage}
                onChange={e => setTaskMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleDispatch()}
                placeholder={`指派任务给 ${agents[selectedAgent]?.name || '...'} (按下回车发送)`}
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
              />
              <button 
                onClick={handleDispatch}
                disabled={loading}
                className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center"
              >
                {loading ? '发送中...' : '发送指令'}
              </button>
            </div>
          </div>

          {/* System Info */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-bold mb-4">系统状态</h3>
              <div className="space-y-4 text-sm">
                <div className="flex justify-between border-b border-gray-700 pb-2">
                  <span className="text-gray-400">主控节点</span>
                  <span className="font-mono text-green-400">LEMON-MAIN-01</span>
                </div>
                <div className="flex justify-between border-b border-gray-700 pb-2">
                  <span className="text-gray-400">活跃智能体</span>
                  <span className="font-mono">{Object.values(agents).filter(a => a.status === 'online').length} / 5</span>
                </div>
                <div className="flex justify-between border-b border-gray-700 pb-2">
                  <span className="text-gray-400">通信通道</span>
                  <span className="font-mono text-blue-400">WebSocket / IPC</span>
                </div>
              </div>
            </div>
            <div className="mt-6 p-4 bg-gray-900 rounded-lg text-xs text-gray-500 font-mono">
              <p>v1.0.0-beta</p>
              <p>Powered by OpenClaw Framework</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
