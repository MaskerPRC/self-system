import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { resolve as pathResolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { setupWebSocket, broadcast, getClientCount } from './modules/websocket.js';
import { getAppLogsSince, getControlLogsSince } from './modules/process.js';
import { startHeartbeatChecker } from './modules/heartbeat.js';
import { initGitRepo } from './modules/git.js';
import { authMiddleware } from './modules/auth.js';
import { initOpenRouterConfig, isOpenRouterConfigured } from './modules/openrouter.js';

// 路由模块
import authRoutes from './routes/auth.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import conversationsRoutes from './routes/conversations.routes.js';
import pagesRoutes from './routes/pages.routes.js';
import skillsRoutes from './routes/skills.routes.js';
import gitRoutes from './routes/git.routes.js';
import appRoutes from './routes/app.routes.js';
import filesRoutes from './routes/files.routes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(authMiddleware);

setupWebSocket(server);

// 挂载所有路由
app.use(authRoutes);
app.use(settingsRoutes);
app.use(conversationsRoutes);
app.use(pagesRoutes);
app.use(skillsRoutes);
app.use(gitRoutes);
app.use(appRoutes);
app.use(filesRoutes);

// ==================== 日志流推送 ====================

let logStreamInterval = null;
function startLogStreaming() {
  if (logStreamInterval) return;
  logStreamInterval = setInterval(async () => {
    if (getClientCount() === 0) return;
    try {
      const [appLogs, controlLogs] = await Promise.all([
        getAppLogsSince(4),
        getControlLogsSince(4)
      ]);
      if (appLogs) broadcast({ type: 'app_logs', logs: appLogs });
      if (controlLogs) broadcast({ type: 'control_logs', logs: controlLogs });
    } catch {}
  }, 3000);
}

// ==================== 静态文件服务（生产模式） ====================

const distPath = pathResolve(__dirname, '../frontend/dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback: 非 API 路由返回 index.html
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(pathResolve(distPath, 'index.html'));
    }
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Control Server] http://localhost:${PORT}`);
  console.log(`[Control Server] WebSocket 已启动`);

  try { startHeartbeatChecker(); }
  catch (e) { console.warn('[Server] 心跳检测未启动（Supabase 未配置）'); }

  startLogStreaming();

  // 初始化 Git 仓库（应用代码版本管理）
  initGitRepo().catch(e => console.warn('[Server] Git 初始化失败:', e.message));

  // 如果设置了环境变量 OPENROUTER_API_KEY，且 DB 中尚无配置，则自动写入
  if (process.env.OPENROUTER_API_KEY) {
    initOpenRouterConfig(
      process.env.OPENROUTER_API_KEY,
      process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash'
    );
  }
  console.log(`[OpenRouter] 二次结构化处理: ${isOpenRouterConfigured() ? '已启用' : '未配置（可在设置中添加）'}`);
});
