import express from 'express';
import { isAuthEnabled, validateSession, parseCookie, createSession, destroySession, COOKIE_NAME, SESSION_MAX_AGE } from '../modules/auth.js';

const router = express.Router();

router.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const result = createSession(username, password);
  if (!result.success) return res.status(401).json(result);
  res.cookie(COOKIE_NAME, result.token, {
    httpOnly: true,
    path: '/',
    maxAge: SESSION_MAX_AGE,
    sameSite: 'lax',
    secure: req.secure
  });
  res.json({ success: true });
});

router.post('/api/auth/logout', (req, res) => {
  const token = parseCookie(req.headers);
  if (token) destroySession(token);
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

router.get('/api/auth/check', (req, res) => {
  if (!isAuthEnabled()) {
    return res.json({ success: true, authEnabled: false });
  }
  const token = parseCookie(req.headers);
  res.json({ success: true, authEnabled: true, authenticated: validateSession(token) });
});

export default router;
