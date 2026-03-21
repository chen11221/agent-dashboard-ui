const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// 团队成员信息配置
const agents = {
  candy: { 
    name: '糖果 🍬', status: 'online', role: 'Coder / Git 管理员',
    cmd: (msg) => `openclaw --profile coder agent --agent main --message "${msg}"`
  },
  panda: { 
    name: '熊猫 🐼', status: 'online', role: '调研与文档分析员',
    cmd: (msg) => `openclaw gateway call agent --url ws://127.0.0.1:18790 --token 1322b66337c046d7db0c1ddfa02996987a5181d6f5a0e011 --params '{"to": "agent:main:main", "message": "${msg}", "idempotencyKey": "${crypto.randomUUID()}"}' --expect-final --timeout 60000`
  },
  banana: { 
    name: '香蕉 🍌', status: 'online', role: '质量保证与安全守卫',
    cmd: (msg) => `openclaw gateway call agent --url ws://127.0.0.1:18892 --token ad925de81f8b80458eccd2d34e5af4b4664168e7af4432f5 --params '{"to": "agent:main:main", "message": "${msg}", "idempotencyKey": "${crypto.randomUUID()}"}' --expect-final --timeout 60000`
  },
  apple: { 
    name: '苹果 🍎', status: 'online', role: 'UI 与前端工程师',
    cmd: (msg) => `openclaw gateway call agent --url ws://127.0.0.1:18899 --token aedfdc31fcb72b9cf35d3b0bbb9edfaffb44d02107fa90d4 --params '{"to": "agent:main:main", "message": "${msg}", "idempotencyKey": "${crypto.randomUUID()}"}' --expect-final --timeout 60000`
  },
  codex: { 
    name: 'Codex 💻', status: 'online', role: '复杂代码架构师',
    cmd: (msg) => `echo "Codex 需要在 Git 环境中运行: codex exec \\"${msg}\\""` 
  }
};

app.get('/api/status', (req, res) => {
  const statusData = {};
  Object.keys(agents).forEach(k => {
    statusData[k] = { name: agents[k].name, status: agents[k].status, role: agents[k].role };
  });
  res.json({ success: true, data: statusData });
});

app.post('/api/dispatch', (req, res) => {
  const { target, message } = req.body;
  const agent = agents[target];
  
  if (!agent) {
    return res.status(404).json({ success: false, error: '未找到该智能体' });
  }

  const command = agent.cmd(message.replace(/"/g, '\\"'));
  console.log(`[Dispatch] 正在向 ${agent.name} 发送任务...`);

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`[Error] ${target}:`, error);
      return res.status(500).json({ success: false, error: stderr || error.message });
    }
    res.json({ success: true, message: `任务已送达 ${agent.name}`, result: stdout });
  });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`🚀 Agent API running on http://localhost:${PORT}`));
