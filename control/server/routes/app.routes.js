import express from 'express';
import { startAppProject, stopAppProject, restartAppProject, getAppStatus, getAppLogs, getControlLogs } from '../modules/process.js';
import { broadcast } from '../modules/websocket.js';

const router = express.Router();

// ==================== 应用项目管理 API ====================

router.get('/api/app/status', async (req, res) => {
  try {
    res.json({ success: true, data: await getAppStatus() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/app/start', async (req, res) => {
  try {
    broadcast({ type: 'status', message: '正在启动应用项目...' });
    const result = await startAppProject();
    broadcast({ type: 'status', message: '应用项目已启动', appStatus: 'running' });
    res.json(result);
  } catch (error) {
    broadcast({ type: 'error', message: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/app/stop', async (req, res) => {
  try {
    const result = await stopAppProject();
    broadcast({ type: 'status', message: '应用项目已停止', appStatus: 'stopped' });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/app/restart', async (req, res) => {
  try {
    broadcast({ type: 'status', message: '正在重启应用项目...' });
    const result = await restartAppProject();
    broadcast({ type: 'status', message: '应用项目已重启', appStatus: 'running' });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/app/logs', async (req, res) => {
  try {
    const tail = Math.min(parseInt(req.query.tail) || 200, 500);
    const logs = await getAppLogs(tail);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/control/logs', async (req, res) => {
  try {
    const tail = Math.min(parseInt(req.query.tail) || 200, 500);
    const logs = await getControlLogs(tail);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
