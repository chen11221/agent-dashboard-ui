# Agent Scoring System Implementation Plan

**Goal:** 实现智能体积分排行榜：后端持久化评分 + 前端独立排行榜面板 + 任务完成后的评分确认对话框。

**Architecture:** 后端使用 `scores.json` 文件持久化各智能体评分；`/api/dispatch` 执行完成后计算参考分返回前端；前端新增排行榜 UI 和评分确认弹窗，用户确认后调用 `/api/scores/confirm` 写入分数。

**Tech Stack:** Node.js/Express（后端）, React/Tailwind v4（前端）, JSON 文件持久化

---

## 文件结构

```
backend/
  server.js              # 修改：新增 /api/scores、/api/scores/confirm，修 /api/dispatch
  scores.json            # 新增：积分持久化存储（自动创建）

frontend/src/
  App.jsx                # 修改：新增状态、Leaderboard UI、评分弹窗
```

---

## Task 1: 后端 - scores.json 持久化与新接口

**Files:**
- Modify: `backend/server.js`
- Create: `backend/scores.json`（由代码自动创建）

- [ ] **Step 1: 在 server.js 顶部添加 fs/path 引入和 scores 读写函数**

```javascript
const fs = require('fs');
const path = require('path');

const scoresPath = path.join(__dirname, 'scores.json');
const defaultScores = {
  candy:  { score: 100, history: [] },
  panda:  { score: 100, history: [] },
  banana: { score: 100, history: [] },
  apple:  { score: 100, history: [] },
  codex:  { score: 100, history: [] },
};

function loadScores() {
  if (!fs.existsSync(scoresPath)) {
    fs.writeFileSync(scoresPath, JSON.stringify(defaultScores, null, 2));
    return defaultScores;
  }
  return JSON.parse(fs.readFileSync(scoresPath, 'utf-8'));
}

function saveScores(data) {
  fs.writeFileSync(scoresPath, JSON.stringify(data, null, 2));
}
```

- [ ] **Step 2: 添加 GET /api/scores 接口**

```javascript
app.get('/api/scores', (req, res) => {
  const scores = loadScores();
  const result = {};
  Object.keys(scores).forEach(k => {
    result[k] = { name: agents[k].name, score: scores[k].score, history: scores[k].history };
  });
  res.json({ success: true, data: result });
});
```

- [ ] **Step 3: 添加 POST /api/scores/confirm 接口**

```javascript
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
```

- [ ] **Step 4: 修改 /api/dispatch，计时 + 计算参考分 + 返回详细信息**

将 exec 改为带 timeout 的版本，并计算参考分：
```javascript
const startTime = Date.now();
exec(command, { timeout: 55000 }, (error, stdout, stderr) => {
  const duration = (Date.now() - startTime) / 1000;
  const exitCode = error ? error.code : 0;
  const outputLen = (stdout || '').length;

  let refDelta = 0, reason = '';
  if (exitCode === 0) { refDelta += 10; reason = '执行成功 +10；'; }
  else { refDelta -= 20; reason = '执行失败 -20；'; }

  if (duration < 10) { refDelta += 5; reason += '速度<10s +5；'; }
  else if (duration < 30) { refDelta += 2; reason += '速度<30s +2；'; }

  if (outputLen >= 50) { refDelta += 5; reason += '回复≥50字 +5'; }
  else if (outputLen >= 20) { refDelta += 2; reason += '回复≥20字 +2'; }

  res.json({
    success: true,
    message: `任务已送达 ${agent.name}`,
    result: stdout || '(无输出)',
    referenceScore: refDelta,
    scoreDetails: { duration: parseFloat(duration.toFixed(1)), outputLen, reason },
  });
});
```

- [ ] **Step 5: 重启后端并验证**

```bash
lsof -i :3001 -sTCP:LISTEN -t | xargs -r kill -9
cd /home/chen/projects/agent-dashboard/backend && nohup node server.js > backend.log 2>&1 &
sleep 2
curl -s http://localhost:3001/api/scores
```

---

## Task 2: 前端 - 积分榜 UI 和评分弹窗

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: 新增状态**

```javascript
const [scores, setScores] = useState({});
const [showScoreModal, setShowScoreModal] = useState(false);
const [pendingScore, setPendingScore] = useState(null);
```

- [ ] **Step 2: 修改 fetchStatus，合并拉取 scores**

把原来的 `fetchStatus` 改为同时请求 `/api/status` 和 `/api/scores`：
```javascript
const fetchAll = () => {
  Promise.all([
    axios.get('/api/status'),
    axios.get('/api/scores'),
  ]).then(([statusRes, scoresRes]) => {
    setAgents(statusRes.data.data);
    setScores(scoresRes.data.data);
  }).catch(() => {
    setLogs(prev => [...prev, toLog('error', '状态同步失败')]);
  });
};
```
并将 `fetchStatus()` 调用改为 `fetchAll()`。

- [ ] **Step 3: 修改 handleDispatch，接管参考分触发弹窗**

把 `setLogs(..., 'ok', '任务已接收...')` 那段改为：
```javascript
const res = await axios.post('/api/dispatch', { target: selectedAgent, message: taskMessage });
const { referenceScore, scoreDetails, result } = res.data;
setPendingScore({ target: selectedAgent, agentName: selectedName, referenceScore, scoreDetails, result, task: taskMessage });
setShowScoreModal(true);
```

- [ ] **Step 4: 在 return JSX 的根容器内，新增评分确认弹窗**

```jsx
{showScoreModal && pendingScore && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="w-full max-w-md rounded-2xl border border-cyan-400/30 bg-slate-900 p-6 shadow-2xl">
      <h2 className="mb-4 text-xl font-bold text-cyan-200">🏆 任务评分确认</h2>
      <div className="mb-3 rounded-lg bg-slate-800 p-3 text-sm text-slate-300 space-y-1">
        <div>执行智能体：<span className="text-cyan-300">{pendingScore.agentName}</span></div>
        <div className="text-slate-400 truncate">任务：{pendingScore.task}</div>
        <div className="text-emerald-300 truncate">结果：{String(pendingScore.result || '').slice(0, 100)}</div>
      </div>
      <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-900/20 p-3">
        <div className="mb-1 text-amber-300">
          📊 系统参考分：<span className="text-2xl font-bold">{'+' + pendingScore.referenceScore}</span>
        </div>
        <div className="text-xs text-amber-200/70">{pendingScore.scoreDetails?.reason}</div>
        <div className="text-xs text-slate-400">
          耗时：{pendingScore.scoreDetails?.duration}s · 字数：{pendingScore.scoreDetails?.outputLen}
        </div>
      </div>
      <div className="flex gap-3">
        <button
          onClick={async () => {
            await axios.post('/api/scores/confirm', {
              target: pendingScore.target,
              delta: pendingScore.referenceScore,
              reason: pendingScore.scoreDetails?.reason,
            });
            setShowScoreModal(false);
            setPendingScore(null);
            const sr = await axios.get('/api/scores');
            setScores(sr.data.data);
          }}
          className="flex-1 rounded-xl bg-cyan-500/30 py-2 font-semibold text-cyan-100 hover:bg-cyan-500/50"
        >确认评分</button>
        <button
          onClick={() => { setShowScoreModal(false); setPendingScore(null); }}
          className="flex-1 rounded-xl border border-slate-600 py-2 text-slate-400 hover:bg-slate-800"
        >忽略</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: 在页面左侧面板区域底部，新增积分排行榜**

在日志控制台下方或侧边合适位置插入：
```jsx
<div className={`${panelBase} p-4`}>
  <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-amber-200">
    <Cpu size={18} /> 🏆 绩效积分榜
  </h3>
  <div className="space-y-2">
    {Object.entries(scores).sort((a, b) => b[1].score - a[1].score).map(([id, s]) => (
      <div key={id} className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2">
        <span className="font-medium text-slate-200">{s.name}</span>
        <span className={`font-mono text-sm font-bold ${s.score >= 100 ? 'text-emerald-300' : 'text-rose-300'}`}>
          {s.score} pts
        </span>
      </div>
    ))}
  </div>
</div>
```

- [ ] **Step 6: 刷新页面验证 UI 正常显示**

---

## 验证命令

```bash
# 验证 scores.json 和接口
curl -s http://localhost:3001/api/scores | python3 -m json.tool

# 模拟 dispatch 返回 referenceScore
curl -s -X POST http://localhost:3001/api/dispatch \
  -H "Content-Type: application/json" \
  -d '{"target":"candy","message":"git log --oneline -1"}' | python3 -m json.tool

# 确认评分写入
curl -s -X POST http://localhost:3001/api/scores/confirm \
  -H "Content-Type: application/json" \
  -d '{"target":"candy","delta":10,"reason":"执行成功+速度+内容质量"}' | python3 -m json.tool
```
