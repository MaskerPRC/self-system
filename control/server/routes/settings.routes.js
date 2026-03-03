import express from 'express';
import { resolve as pathResolve, dirname } from 'path';
import { readFileSync, existsSync } from 'fs';
import { writeFile as fsWriteFile } from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// ==================== 健康检查 ====================

router.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== 前端配置 ====================

router.get('/api/config', (req, res) => {
  res.json({
    appExternalUrl: process.env.APP_EXTERNAL_URL || 'http://localhost:5174'
  });
});

// ==================== 设置 API ====================

const settingsPath = pathResolve(__dirname, '..', 'settings.json');
const DEFAULT_SETTINGS = {
  uiStyle: '现代简约风格，使用 Tailwind CSS 4。配色以白色/浅灰为主背景，搭配一个品牌强调色。圆角卡片布局，适当留白，字体清晰易读。响应式设计，移动端友好。'
};

function readSettings() {
  try {
    if (existsSync(settingsPath)) return JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

router.get('/api/settings', (req, res) => {
  res.json({ success: true, data: readSettings() });
});

router.post('/api/settings', async (req, res) => {
  try {
    const current = readSettings();
    const merged = { ...current, ...req.body };
    await fsWriteFile(settingsPath, JSON.stringify(merged, null, 2), 'utf8');
    res.json({ success: true, data: merged });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
