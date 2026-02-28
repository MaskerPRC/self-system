import crypto from 'crypto';

const sessions = new Map();
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const COOKIE_NAME = 'self_app_session';

// 公开路由缓存
let publicRoutes = new Set();
const CONTROL_BACKEND = process.env.CONTROL_BACKEND_URL || 'http://localhost:3000';

export function isAuthEnabled() {
  return !!(process.env.AUTH_USERNAME && process.env.AUTH_PASSWORD);
}

export function createSession(username, password) {
  if (!isAuthEnabled()) return null;
  if (username !== process.env.AUTH_USERNAME || password !== process.env.AUTH_PASSWORD) return null;

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expiresAt: Date.now() + SESSION_MAX_AGE });
  return token;
}

export function validateSession(token) {
  if (!token) return false;
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function destroySession(token) {
  sessions.delete(token);
}

function parseCookie(headers) {
  const header = headers.cookie || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  return match ? match[1] : null;
}

/**
 * 从 Control 服务器拉取公开路由列表并缓存
 */
async function refreshPublicRoutes() {
  try {
    const res = await fetch(`${CONTROL_BACKEND}/api/pages/public-routes`);
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      publicRoutes = new Set(data.data);
      console.log(`[Auth] 公开路由已更新: ${[...publicRoutes].join(', ') || '(无)'}`);
    }
  } catch (e) {
    console.warn('[Auth] 拉取公开路由失败:', e.message);
  }
}

/**
 * 启动公开路由定期同步（每30秒）
 */
export function startPublicRoutesSync() {
  refreshPublicRoutes();
  setInterval(refreshPublicRoutes, 30000);
}

/**
 * 获取当前缓存的公开路由列表
 */
export function getPublicRoutes() {
  return [...publicRoutes];
}

/**
 * 检查请求路径是否属于公开页面
 * 约定：页面路由 /xxx 对应 API 路由 /api/xxx 和 /api/xxx/*
 */
function isPublicPath(reqPath) {
  for (const route of publicRoutes) {
    // 匹配前端页面路由
    if (reqPath === route || reqPath.startsWith(route + '/')) return true;
    // 匹配对应的 API 路由前缀
    const apiPrefix = '/api' + route;
    if (reqPath === apiPrefix || reqPath.startsWith(apiPrefix + '/')) return true;
  }
  return false;
}

export function authMiddleware(req, res, next) {
  if (!isAuthEnabled()) return next();

  if (req.path.startsWith('/api/auth/') || req.path === '/api/app/health') {
    return next();
  }

  // 公开路由直接放行
  if (isPublicPath(req.path)) {
    return next();
  }

  const token = parseCookie(req.headers);
  if (validateSession(token)) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, error: '未登录' });
  }

  next();
}

export { COOKIE_NAME, SESSION_MAX_AGE };
