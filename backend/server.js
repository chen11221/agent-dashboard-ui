const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const crypto = require('crypto');
const net = require('net');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const scoresPath = path.join(__dirname, 'scores.json');
const defaultScores = {
  candy: { score: 100, history: [] },
  panda: { score: 100, history: [] },
  banana: { score: 100, history: [] },
  apple: { score: 100, history: [] },
  codex: { score: 100, history: [] },
};

function loadScores() {
  if (!fs.existsSync(scoresPath)) {
    fs.writeFileSync(scoresPath, JSON.stringify(defaultScores, null, 2));
    return { ...defaultScores };
  }
  return JSON.parse(fs.readFileSync(scoresPath, 'utf-8'));
}

function saveScores(data) {
  fs.writeFileSync(scoresPath, JSON.stringify(data, null, 2));
}

// 团队成员信息配置
const agents = {
  candy: { 
    name: '糖果 🍬', status: 'offline', role: 'Coder / Git 管理员',
    cmd: (msg) => `openclaw --profile coder agent --agent main --message "${msg}"`
  },
  panda: { 
    name: '熊猫 🐼', status: 'offline', role: '调研与文档分析员',
    cmd: (msg) => `openclaw gateway call agent --url ws://127.0.0.1:18790 --token 1322b66337c046d7db0c1ddfa02996987a5181d6f5a0e011 --params '{"to": "agent:main:main", "message": "${msg}", "idempotencyKey": "${crypto.randomUUID()}"}' --expect-final --timeout 60000`
  },
  banana: { 
    name: '香蕉 🍌', status: 'offline', role: '质量保证与安全守卫',
    cmd: (msg) => `openclaw gateway call agent --url ws://127.0.0.1:18892 --token ad925de81f8b80458eccd2d34e5af4b4664168e7af4432f5 --params '{"to": "agent:main:main", "message": "${msg}", "idempotencyKey": "${crypto.randomUUID()}"}' --expect-final --timeout 60000`
  },
  apple: { 
    name: '苹果 🍎', status: 'offline', role: 'UI 与前端工程师',
    cmd: (msg) => `openclaw gateway call agent --url ws://127.0.0.1:18899 --token aedfdc31fcb72b9cf35d3b0bbb9edfaffb44d02107fa90d4 --params '{"to": "agent:main:main", "message": "${msg}", "idempotencyKey": "${crypto.randomUUID()}"}' --expect-final --timeout 60000`
  },
  codex: { 
    name: 'Codex 💻', status: 'online', role: '复杂代码架构师',
    cmd: (msg) => `echo "Codex 需要在 Git 环境中运行: codex exec \\"${msg}\\""` 
  }
};

const probeTargets = {
  candy: 19003,
  panda: 18790,
  banana: 18892,
  apple: 18899
};

function checkPort(port, host = '127.0.0.1', timeout = 2500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finalize = (isOnline) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(isOnline);
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));
    socket.connect(port, host);
  });
}

async function refreshStatusCache() {
  const checks = Object.entries(probeTargets).map(async ([key, port]) => {
    const online = await checkPort(port);
    agents[key].status = online ? 'online' : 'offline';
  });

  await Promise.all(checks);
  agents.codex.status = 'online';
}

app.get('/api/status', (req, res) => {
  const statusData = {};
  Object.keys(agents).forEach(k => {
    statusData[k] = { name: agents[k].name, status: agents[k].status, role: agents[k].role };
  });
  res.json({ success: true, data: statusData });
});

app.get('/api/scores', (req, res) => {
  const scores = loadScores();
  const result = {};
  Object.keys(scores).forEach((k) => {
    result[k] = { name: agents[k].name, score: scores[k].score, history: scores[k].history };
  });
  res.json({ success: true, data: result });
});

app.post('/api/scores/confirm', (req, res) => {
  const { target, delta, reason } = req.body;
  const scores = loadScores();
  if (!scores[target]) return res.status(404).json({ success: false, error: '未找到该智能体' });

  scores[target].score = Math.max(0, scores[target].score + delta);
  scores[target].history.unshift({ delta, reason, time: new Date().toLocaleTimeString() });
  if (scores[target].history.length > 20) scores[target].history = scores[target].history.slice(0, 20);

  saveScores(scores);
  res.json({ success: true, score: scores[target].score });
});

app.post('/api/dispatch', (req, res) => {
  const { target, message } = req.body;
  const agent = agents[target];
  
  if (!agent) {
    return res.status(404).json({ success: false, error: '未找到该智能体' });
  }

  const command = agent.cmd(message.replace(/"/g, '\\"'));
  console.log(`[Dispatch] 正在向 ${agent.name} 发送任务...`);

  const startTime = Date.now();
  exec(command, { timeout: 55000 }, (error, stdout, stderr) => {
    if (error) {
      console.error(`[Error] ${target}:`, error.message);
    }

    const duration = (Date.now() - startTime) / 1000;
    const exitCode = error ? error.code : 0;
    const outputLen = (stdout || '').length;

    let refDelta = 0;
    let reason = '';

    if (exitCode === 0) {
      refDelta += 10;
      reason = '执行成功 +10；';
    } else {
      refDelta -= 20;
      reason = '执行失败 -20；';
    }

    if (duration < 10) {
      refDelta += 5;
      reason += '速度<10s +5；';
    } else if (duration < 30) {
      refDelta += 2;
      reason += '速度<30s +2；';
    }

    if (outputLen >= 50) {
      refDelta += 5;
      reason += '回复≥50字 +5';
    } else if (outputLen >= 20) {
      refDelta += 2;
      reason += '回复≥20字 +2';
    }

    const fallbackResult = stderr || error?.message || '(无输出)';
    res.json({
      success: true,
      message: `任务已送达 ${agent.name}`,
      result: stdout || fallbackResult,
      referenceScore: refDelta,
      scoreDetails: { duration: parseFloat(duration.toFixed(1)), outputLen, reason },
    });
  });
});

const PORT = 3001;
refreshStatusCache()
  .catch((err) => console.error('[StatusPoller] Initial refresh failed:', err))
  .finally(() => {
    setInterval(() => {
      refreshStatusCache().catch((err) => {
        console.error('[StatusPoller] Refresh failed:', err);
      });
    }, 15000);

    app.listen(PORT, () => console.log(`🚀 Agent API running on http://localhost:${PORT}`));
  });
