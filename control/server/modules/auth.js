import crypto from 'crypto';

const sessions = new Map();
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const COOKIE_NAME = 'self_session';

function getAuthCredentials() {
  const isProd = process.env.NODE_ENV === 'production';
  const prefix = isProd ? 'PROD' : 'DEV';
  const username = process.env[`${prefix}_AUTH_USERNAME`] || process.env.AUTH_USERNAME;
  const password = process.env[`${prefix}_AUTH_PASSWORD`] || process.env.AUTH_PASSWORD;
  return { username, password };
}

export function isAuthEnabled() {
  const { username, password } = getAuthCredentials();
  return !!(username && password);
}

export function createSession(username, password) {
  if (!isAuthEnabled()) return { success: false, error: '鉴权未启用' };
  const creds = getAuthCredentials();
  if (username !== creds.username || password !== creds.password) {
    return { success: false, error: '用户名或密码错误' };
  }

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expiresAt: Date.now() + SESSION_MAX_AGE });
  return { success: true, token };
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

export function parseCookie(headers) {
  const header = headers.cookie || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  return match ? match[1] : null;
}

export function authMiddleware(req, res, next) {
  if (!isAuthEnabled()) return next();

  // Exempt paths
  if (req.path.startsWith('/api/auth/') || req.path === '/api/health' || req.path === '/api/heartbeat' || req.path === '/api/pages/public-routes') {
    return next();
  }

  const token = parseCookie(req.headers);
  if (validateSession(token)) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, error: '未登录' });
  }

  // Non-API requests (SPA pages): pass through, frontend handles login gate
  next();
}

export { COOKIE_NAME, SESSION_MAX_AGE };
