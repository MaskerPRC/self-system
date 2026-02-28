import express from 'express';
import cors from 'cors';
import { authMiddleware, createSession, destroySession, isAuthEnabled, validateSession, COOKIE_NAME, SESSION_MAX_AGE, startPublicRoutesSync, getPublicRoutes } from './auth.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(authMiddleware);

// 启动公开路由同步
startPublicRoutesSync();

// ==================== 鉴权 API ====================

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '用户名和密码必填' });
  }
  const token = createSession(username, password);
  if (!token) {
    return res.status(401).json({ success: false, error: '用户名或密码错误' });
  }
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE,
    sameSite: 'lax',
    secure: req.secure
  });
  res.json({ success: true });
});

app.post('/api/auth/logout', (req, res) => {
  const header = req.headers.cookie || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  const token = match ? match[1] : null;
  if (token) destroySession(token);
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
  if (!isAuthEnabled()) {
    return res.json({ success: true, authEnabled: false });
  }
  const header = req.headers.cookie || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  const token = match ? match[1] : null;
  res.json({ success: true, authEnabled: true, authenticated: validateSession(token) });
});

// 返回公开路由列表给前端
app.get('/api/auth/public-routes', (req, res) => {
  res.json({ success: true, data: getPublicRoutes() });
});

// 健康检查
app.get('/api/app/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== 应用路由 ====================
// 每个功能模块放在 routes/ 目录下的独立文件中
// Claude Code 在下方通过 import + app.use() 引入路由文件
// --- APP ROUTES START ---

// --- APP ROUTES END ---

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[App Server] http://localhost:${PORT}`);
});
