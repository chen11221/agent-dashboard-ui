const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const crypto = require('crypto');
const net = require('net');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const hasOriginAllowList = allowedOrigins.length > 0;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || !hasOriginAllowList || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
  }),
);
app.use(express.json());
const sseClients = new Set();

const scoresPath = path.join(__dirname, 'scores.json');
const logsPath = path.join(__dirname, 'logs.json');
const groupChatPath = path.join(__dirname, 'group-chat.json');
const defaultScores = {
  candy: { score: 100, history: [] },
  panda: { score: 100, history: [] },
  banana: { score: 100, history: [] },
  apple: { score: 100, history: [] },
  codex: { score: 100, history: [] },
};
const defaultLogs = [];
const defaultGroupChatMessages = [];

function buildNormalizedScores(input) {
  const incoming = input && typeof input === 'object' ? input : {};
  const normalized = {};

  Object.keys(agents).forEach((agentId) => {
    const record = incoming[agentId];
    const score = Number.isFinite(record?.score) ? record.score : defaultScores[agentId].score;
    const history = Array.isArray(record?.history) ? record.history : [];
    normalized[agentId] = { score, history };
  });

  return normalized;
}

function loadScores() {
  if (!fs.existsSync(scoresPath)) {
    fs.writeFileSync(scoresPath, JSON.stringify(defaultScores, null, 2));
    return { ...defaultScores };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(scoresPath, 'utf-8'));
    const normalized = buildNormalizedScores(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      saveScores(normalized);
    }
    return normalized;
  } catch (err) {
    console.error('[Scores] 文件损坏，已回退默认值:', err.message);
    saveScores(defaultScores);
    return { ...defaultScores };
  }
}

function saveScores(data) {
  fs.writeFileSync(scoresPath, JSON.stringify(data, null, 2));
}

function loadLogs() {
  if (!fs.existsSync(logsPath)) {
    fs.writeFileSync(logsPath, JSON.stringify(defaultLogs, null, 2));
    return [...defaultLogs];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(logsPath, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [...defaultLogs];
  } catch (err) {
    console.error('[Logs] 文件损坏，已回退为空:', err.message);
    saveLogs(defaultLogs);
    return [...defaultLogs];
  }
}

function saveLogs(data) {
  fs.writeFileSync(logsPath, JSON.stringify(data, null, 2));
}

function loadGroupChatMessages() {
  if (!fs.existsSync(groupChatPath)) {
    fs.writeFileSync(groupChatPath, JSON.stringify(defaultGroupChatMessages, null, 2));
    return [...defaultGroupChatMessages];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(groupChatPath, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [...defaultGroupChatMessages];
  } catch (err) {
    console.error('[GroupChat] 文件损坏，已回退为空:', err.message);
    saveGroupChatMessages(defaultGroupChatMessages);
    return [...defaultGroupChatMessages];
  }
}

function saveGroupChatMessages(data) {
  fs.writeFileSync(groupChatPath, JSON.stringify(data, null, 2));
}

function getStatusData() {
  const statusData = {};
  Object.keys(agents).forEach((k) => {
    statusData[k] = { name: agents[k].name, status: agents[k].status, role: agents[k].role };
  });
  return statusData;
}

function getScoresData() {
  const scores = loadScores();
  const result = {};
  Object.keys(agents).forEach((k) => {
    result[k] = { name: agents[k].name, score: scores[k].score, history: scores[k].history };
  });
  return result;
}

function broadcastEvent(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => {
    try {
      client.write(payload);
    } catch (_) {
      sseClients.delete(client);
    }
  });
}

function flattenMessageContent(content) {
  if (typeof content === 'string') return content.trim();
  if (content && typeof content.text === 'string') return content.text.trim();
  if (content && typeof content.content === 'string') return content.content.trim();
  if (content && Array.isArray(content.content)) {
    return flattenMessageContent(content.content);
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        if (part && typeof part.content === 'string') return part.content;
        return '';
      })
      .join('\n')
      .trim();
    return text;
  }
  return '';
}

function extractTextFromStructured(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';

  if (Array.isArray(value)) {
    const merged = value
      .map((item) => extractTextFromStructured(item))
      .filter(Boolean)
      .join('\n')
      .trim();
    return merged;
  }

  if (Array.isArray(value.payloads)) {
    const payloadText = value.payloads
      .map((payload) => (payload && typeof payload.text === 'string' ? payload.text.trim() : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
    if (payloadText) return payloadText;
  }

  const directCandidates = [
    value.text,
    value.content,
    value.message,
    value.response,
    value.result,
    value.output,
    value.final,
    value.data,
  ];

  for (const item of directCandidates) {
    const text = extractTextFromStructured(item);
    if (text) return text;
  }

  return '';
}

function extractTextFromPossibleJsonBlock(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';

  const tryParse = (candidate) => {
    try {
      const parsed = JSON.parse(candidate);
      return extractTextFromStructured(parsed);
    } catch (_) {
      return '';
    }
  };

  const direct = tryParse(text);
  if (direct) return direct;

  const firstObj = text.indexOf('{');
  const lastObj = text.lastIndexOf('}');
  if (firstObj !== -1 && lastObj > firstObj) {
    const objBlock = text.slice(firstObj, lastObj + 1);
    const fromObj = tryParse(objBlock);
    if (fromObj) return fromObj;
  }

  const firstArr = text.indexOf('[');
  const lastArr = text.lastIndexOf(']');
  if (firstArr !== -1 && lastArr > firstArr) {
    const arrBlock = text.slice(firstArr, lastArr + 1);
    const fromArr = tryParse(arrBlock);
    if (fromArr) return fromArr;
  }

  return '';
}

function extractModelReply(output) {
  const raw = String(output || '').trim();
  if (!raw) return '';

  const fromRawBlock = extractTextFromPossibleJsonBlock(raw);
  if (fromRawBlock) return fromRawBlock;

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!(line.startsWith('{') || line.startsWith('['))) continue;

    try {
      const parsed = JSON.parse(line);
      const text = extractTextFromStructured(parsed);
      if (text) return text;
    } catch (_) {
      // ignore malformed line and continue fallback
    }
  }

  // Fallback: keep all meaningful lines and strip common runtime noise.
  const noisePrefixes = [
    '[Dispatch]',
    '[Error]',
    '[agent/',
    '[diagnostic]',
    '[model-fallback/',
    'Error:',
    'WARN',
    'INFO',
    'DEBUG',
    'gateway ',
    'Gateway ',
    'Source:',
    'Config:',
    'Bind:',
    'FailoverError:',
  ];

  const filtered = lines.filter((line) => !noisePrefixes.some((p) => line.startsWith(p)));
  if (filtered.length > 0) return filtered.join('\n');

  return raw;
}

// 团队成员信息配置
const gatewayAgents = {
  panda: { url: 'ws://127.0.0.1:18790', tokenEnv: 'PANDA_GATEWAY_TOKEN' },
  banana: { url: 'ws://127.0.0.1:18892', tokenEnv: 'BANANA_GATEWAY_TOKEN' },
  apple: { url: 'ws://127.0.0.1:18899', tokenEnv: 'APPLE_GATEWAY_TOKEN' },
};

const agents = {
  candy: {
    name: '糖果 🍬', status: 'offline', role: 'Coder / Git 管理员',
  },
  panda: {
    name: '熊猫 🐼', status: 'offline', role: '调研与文档分析员',
  },
  banana: {
    name: '香蕉 🍌', status: 'offline', role: '质量保证与安全守卫',
  },
  apple: {
    name: '苹果 🍎', status: 'offline', role: 'UI 与前端工程师',
  },
  codex: {
    name: 'Codex 💻', status: 'online', role: '复杂代码架构师',
  }
};

function buildAgentCommand(target, message) {
  if (target === 'candy') {
    return {
      command: 'openclaw',
      args: ['--profile', 'coder', 'agent', '--agent', 'main', '--message', message],
    };
  }

  if (target === 'codex') {
    return {
      command: 'codex',
      args: ['exec', message],
    };
  }

  const gateway = gatewayAgents[target];
  if (!gateway) return null;

  const token = process.env[gateway.tokenEnv];
  if (!token) {
    throw new Error(`缺少环境变量 ${gateway.tokenEnv}`);
  }

  return {
    command: 'openclaw',
    args: [
      'gateway',
      'call',
      'agent',
      '--url',
      gateway.url,
      '--token',
      token,
      '--params',
      JSON.stringify({
        to: 'agent:main:main',
        message,
        idempotencyKey: crypto.randomUUID(),
      }),
      '--expect-final',
      '--timeout',
      '60000',
    ],
  };
}

function runCommand(command, args, timeoutMs = 55000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false });
    let stdout = '';
    let stderr = '';
    let resolved = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000);
    }, timeoutMs);

    const finalize = (payload) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve(payload);
    };

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      finalize({ code: 1, stdout, stderr, error, timedOut });
    });

    child.on('close', (code) => {
      finalize({ code, stdout, stderr, timedOut });
    });
  });
}

const groupChatParticipantIds = ['candy', 'panda', 'banana', 'apple', 'codex'];

function getAgentShortName(agentId) {
  const fullName = agents[agentId]?.name || agentId;
  return fullName.split(' ')[0];
}

const mentionAliasToAgentId = (() => {
  const map = {};
  groupChatParticipantIds.forEach((agentId) => {
    const fullName = agents[agentId]?.name || agentId;
    const shortName = getAgentShortName(agentId);
    [agentId, fullName, shortName]
      .filter(Boolean)
      .forEach((alias) => {
        map[String(alias).toLowerCase()] = agentId;
      });
  });
  return map;
})();

function extractMentionedAgentIds(text) {
  const raw = String(text || '');
  const matches = raw.match(/@([^\s@，。,:：!?！？]+)/g) || [];
  const mentioned = new Set();

  matches.forEach((token) => {
    const alias = token.slice(1).trim().toLowerCase();
    const resolved = mentionAliasToAgentId[alias];
    if (resolved) {
      mentioned.add(resolved);
    }
  });

  return Array.from(mentioned);
}

function buildGroupChatPrompt(messages, currentAgentId, triggerSenders = []) {
  const currentAgentName = agents[currentAgentId]?.name || currentAgentId;
  const context = messages
    .slice(-12)
    .map((msg) => `${msg.sender}: ${msg.text}`)
    .join('\n');
  const mentionGuide = groupChatParticipantIds.map((agentId) => `@${getAgentShortName(agentId)}`).join(' / ');
  const triggerHint = triggerSenders.length > 0
    ? `本轮由以下对象点名你：${triggerSenders.join('、')}。请优先回应他们。`
    : '本轮为群发发言，你可直接回复群体。';

  return [
    '你正在一个多智能体群聊中。',
    `你的身份是：${currentAgentName}。`,
    triggerHint,
    `如需指定某个智能体继续回复，请在内容中使用 @名字（可用：${mentionGuide}）。`,
    '根据以下聊天记录自然回复，80字以内，直接给出消息内容，不要输出 JSON、代码块或额外格式。',
    '聊天记录：',
    context || '(空)',
  ].join('\n');
}

function toGroupChatMessage(sender, text, senderId = '') {
  return {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    sender,
    senderId,
    text: String(text || '').trim(),
    time: new Date().toLocaleTimeString(),
  };
}

async function requestAgentGroupReply(agentId, history, triggerSenders) {
  const agent = agents[agentId];
  if (!agent) return null;

  try {
    const prompt = buildGroupChatPrompt(history, agentId, triggerSenders);
    const executable = buildAgentCommand(agentId, prompt);
    const result = await runCommand(executable.command, executable.args, 9000);
    const reply = extractModelReply(result.stdout || result.stderr || result.error?.message || '');
    if (!reply) return null;
    return toGroupChatMessage(agent.name, reply, agentId);
  } catch (err) {
    return toGroupChatMessage(agent.name, `（未响应）${err.message || '调用失败'}`, agentId);
  }
}

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
  broadcastEvent('status', getStatusData());
}

app.get('/api/status', (req, res) => {
  res.json({ success: true, data: getStatusData() });
});

app.get('/api/scores', (req, res) => {
  res.json({ success: true, data: getScoresData() });
});

app.get('/api/logs', (req, res) => {
  const logs = loadLogs();
  const sanitized = logs.filter((item) => item && item.level !== 'waiting');
  if (sanitized.length !== logs.length) {
    saveLogs(sanitized.slice(-100));
  }
  res.json({ success: true, data: sanitized });
});

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);
  res.write(`event: ready\ndata: ${JSON.stringify({ success: true })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

app.post('/api/logs', (req, res) => {
  const { level, text, time } = req.body || {};
  if (!level || !text || !time) {
    return res.status(400).json({ success: false, error: '日志字段不完整' });
  }

  const logs = loadLogs();
  logs.push({ level, text, time });
  const recentLogs = logs.slice(-100);
  saveLogs(recentLogs);
  broadcastEvent('logs', recentLogs.filter((item) => item && item.level !== 'waiting'));

  res.json({ success: true, data: recentLogs });
});

app.delete('/api/logs', (req, res) => {
  saveLogs(defaultLogs);
  broadcastEvent('logs', []);
  res.json({ success: true, data: [] });
});

app.post('/api/logs/clear', (req, res) => {
  saveLogs(defaultLogs);
  broadcastEvent('logs', []);
  res.json({ success: true, data: [] });
});

app.post('/api/scores/confirm', (req, res) => {
  const { target, delta, reason } = req.body;
  const scores = loadScores();
  if (!scores[target]) return res.status(404).json({ success: false, error: '未找到该智能体' });
  if (!Number.isFinite(delta)) return res.status(400).json({ success: false, error: 'delta 必须是数字' });

  scores[target].score = Math.max(0, scores[target].score + delta);
  scores[target].history.unshift({ delta, reason, time: new Date().toLocaleTimeString() });
  if (scores[target].history.length > 20) scores[target].history = scores[target].history.slice(0, 20);

  saveScores(scores);
  broadcastEvent('scores', getScoresData());
  res.json({ success: true, score: scores[target].score });
});

app.post('/api/dispatch', (req, res) => {
  const { target, message } = req.body;
  if (typeof target !== 'string' || !target.trim()) {
    return res.status(400).json({ success: false, error: 'target 不能为空' });
  }
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ success: false, error: 'message 不能为空' });
  }
  const agent = agents[target];

  if (!agent) {
    return res.status(404).json({ success: false, error: '未找到该智能体' });
  }

  let executable;
  try {
    executable = buildAgentCommand(target, message);
  } catch (err) {
    return res.status(503).json({ success: false, error: err.message || '目标智能体配置不完整' });
  }
  if (!executable) {
    return res.status(500).json({ success: false, error: '未配置执行命令' });
  }

  console.log(`[Dispatch] 正在向 ${agent.name} 发送任务...`);

  const startTime = Date.now();
  runCommand(executable.command, executable.args, 55000).then((execResult) => {
    if (execResult.error) {
      console.error(`[Error] ${target}:`, execResult.error.message);
    }

    const duration = (Date.now() - startTime) / 1000;
    const exitCode = typeof execResult.code === 'number' ? execResult.code : 1;
    const outputLen = (execResult.stdout || '').length;

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

    if (execResult.timedOut) {
      reason += '；执行超时';
    }

    const rawResult = execResult.stdout || execResult.stderr || execResult.error?.message || '(无输出)';
    const modelReply = extractModelReply(rawResult) || '(无输出)';
    res.json({
      success: true,
      message: `任务已送达 ${agent.name}`,
      result: modelReply,
      referenceScore: refDelta,
      scoreDetails: { duration: parseFloat(duration.toFixed(1)), outputLen, reason },
    });
  });
});

app.get('/api/group-chat/messages', (req, res) => {
  const messages = loadGroupChatMessages();
  res.json({ success: true, data: messages.slice(-200) });
});

app.post('/api/group-chat/messages', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    return res.status(400).json({ success: false, error: 'text 不能为空' });
  }

  const history = loadGroupChatMessages();
  const userMessage = toGroupChatMessage('你', text, 'user');
  history.push(userMessage);
  const roundMessages = [userMessage];

  const makeTargetMap = (targets, senderName) => {
    const map = new Map();
    targets.forEach((target) => {
      if (!groupChatParticipantIds.includes(target)) return;
      map.set(target, [senderName]);
    });
    return map;
  };

  const initialMentions = extractMentionedAgentIds(text);
  let pendingTargetMap = initialMentions.length > 0
    ? makeTargetMap(initialMentions, '你')
    : makeTargetMap(groupChatParticipantIds, '你（群发）');

  const maxTurns = 2;
  const maxAgentReplies = 10;
  let totalReplies = 0;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const targets = Array.from(pendingTargetMap.keys());
    if (targets.length === 0 || totalReplies >= maxAgentReplies) {
      break;
    }

    const replies = await Promise.all(
      targets.map((agentId) => requestAgentGroupReply(agentId, history, pendingTargetMap.get(agentId) || [])),
    );

    const validReplies = replies.filter((message) => Boolean(message && message.text));
    if (validReplies.length === 0) {
      break;
    }

    validReplies.forEach((message) => {
      history.push(message);
      roundMessages.push(message);
      totalReplies += 1;
    });

    const nextTargetMap = new Map();
    validReplies.forEach((message) => {
      const mentionedTargets = extractMentionedAgentIds(message.text);
      mentionedTargets.forEach((targetId) => {
        if (targetId === message.senderId) return;
        if (!nextTargetMap.has(targetId)) {
          nextTargetMap.set(targetId, []);
        }
        nextTargetMap.get(targetId).push(message.sender);
      });
    });
    pendingTargetMap = nextTargetMap;
  }

  saveGroupChatMessages(history.slice(-200));
  broadcastEvent('group-chat', history.slice(-200));
  res.json({ success: true, data: roundMessages });
});

app.post('/api/group-chat/clear', (req, res) => {
  saveGroupChatMessages(defaultGroupChatMessages);
  broadcastEvent('group-chat', []);
  res.json({ success: true, data: [] });
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
