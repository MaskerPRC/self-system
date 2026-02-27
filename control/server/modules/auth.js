import crypto from 'crypto';

const sessions = new Map();
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const COOKIE_NAME = 'self_session';

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

export function parseCookie(headers) {
  const header = headers.cookie || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
  return match ? match[1] : null;
}

export function authMiddleware(req, res, next) {
  if (!isAuthEnabled()) return next();

  // Exempt paths
  if (req.path.startsWith('/api/auth/') || req.path === '/api/health' || req.path === '/api/heartbeat') {
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
