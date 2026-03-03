import express from 'express';
import { getGitStatus, getCommitHistory, checkoutCommit, getGitRemoteConfig, updateGitRemoteConfig, pushToRemote } from '../modules/git.js';
import { restartAppProject } from '../modules/process.js';

const router = express.Router();

// ==================== Git API ====================

router.get('/api/git/status', async (req, res) => {
  try {
    const data = await getGitStatus();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/git/commits', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const data = await getCommitHistory(limit);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/git/checkout', async (req, res) => {
  try {
    const { hash } = req.body;
    if (!hash) return res.status(400).json({ success: false, error: 'hash 必填' });

    const result = await checkoutCommit(hash);
    if (!result.success) return res.status(500).json({ success: false, error: result.error });

    // 回滚后重启应用容器
    try {
      await restartAppProject();
    } catch (e) {
      console.error('[Git] Restart after checkout failed:', e.message);
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== Git 远程配置 API ====================

router.get('/api/git/remote-config', (req, res) => {
  try {
    const data = getGitRemoteConfig();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/git/remote-config', async (req, res) => {
  try {
    const { repoUrl, token } = req.body;
    await updateGitRemoteConfig(repoUrl, token);
    res.json({ success: true, data: getGitRemoteConfig() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/git/push', async (req, res) => {
  try {
    await pushToRemote();
    res.json({ success: true, message: 'Push 成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
