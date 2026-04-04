import express from 'express';
import { resolve as pathResolve, dirname, join as pathJoin } from 'path';
import { readFileSync, existsSync, mkdirSync, copyFileSync, chownSync } from 'fs';
import { writeFile as fsWriteFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { sqliteDb } from '../modules/sqlite.js';

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

// ==================== 设置 API（DB 持久化） ====================

const DEFAULT_SETTINGS = {
  uiStyle: '黑白新粗野风格（Neo-Brutalism），使用 Tailwind CSS 4。纯黑白配色为主，粗黑边框（2-4px solid black），无圆角或极小圆角，粗体大字排版，强对比色块，按钮带实色阴影偏移（shadow-[4px_4px_0_black]），布局大胆直接，留白克制。响应式设计，移动端友好。'
};

// 从旧 settings.json 迁移数据到 DB（仅执行一次）
const settingsJsonPath = pathResolve(__dirname, '..', 'settings.json');

async function migrateFromJsonIfNeeded() {
  try {
    if (!existsSync(settingsJsonPath)) return;
    const fileData = JSON.parse(readFileSync(settingsJsonPath, 'utf8'));
    // 检查 DB 中是否已有数据
    const existing = await readSettings();
    const hasDbData = Object.keys(existing).some(k => k !== 'uiStyle' || existing[k] !== DEFAULT_SETTINGS.uiStyle);
    if (hasDbData) return; // DB 已有自定义数据，不覆盖

    for (const [key, value] of Object.entries(fileData)) {
      await writeSetting(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
    console.log('[Settings] 已从 settings.json 迁移到数据库');
  } catch (e) {
    console.error('[Settings] 迁移失败:', e.message);
  }
}

async function readSettings() {
  const result = { ...DEFAULT_SETTINGS };
  const applyRows = (rows) => {
    rows.forEach(row => {
      try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
    });
  };
  try {
    applyRows(sqliteDb.prepare('SELECT key, value FROM settings').all());
  } catch (e) {
    console.error('[Settings] 读取失败:', e.message);
  }
  return result;
}

async function writeSetting(key, value) {
  const strValue = typeof value === 'string' ? value : JSON.stringify(value);
  sqliteDb.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime(\'now\')'
  ).run(key, strValue);
}

// 启动时迁移
migrateFromJsonIfNeeded();

// 导出供其他模块使用
export { readSettings };

router.get('/api/settings', async (req, res) => {
  res.json({ success: true, data: await readSettings() });
});

router.post('/api/settings', async (req, res) => {
  try {
    const current = await readSettings();
    const merged = { ...current, ...req.body };
    for (const [key, value] of Object.entries(req.body)) {
      await writeSetting(key, value);
    }
    res.json({ success: true, data: merged });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==================== Claude Code 配置 API ====================

// 提供商对应的 Claude CLI env 配置
const PROVIDER_ENV_MAP = {
  anthropic: (config) => {
    const env = {
      ANTHROPIC_API_KEY: config.apiKey,
      ANTHROPIC_MODEL: config.model || 'claude-sonnet-4-20250514'
    };
    if (config.baseUrl) env.ANTHROPIC_BASE_URL = config.baseUrl;
    return env;
  },
  qwen: (config) => ({
    ANTHROPIC_AUTH_TOKEN: config.apiKey,
    ANTHROPIC_BASE_URL: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
    ANTHROPIC_MODEL: config.model || 'qwen3.5-plus'
  }),
  minimax: (config) => ({
    ANTHROPIC_BASE_URL: 'https://api.minimaxi.com/anthropic',
    ANTHROPIC_AUTH_TOKEN: config.apiKey,
    API_TIMEOUT_MS: '3000000',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1,
    ANTHROPIC_MODEL: 'MiniMax-M2.5',
    ANTHROPIC_SMALL_FAST_MODEL: 'MiniMax-M2.5',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'MiniMax-M2.5',
    ANTHROPIC_DEFAULT_OPUS_MODEL: 'MiniMax-M2.5',
    ANTHROPIC_DEFAULT_HAIKU_MODEL: 'MiniMax-M2.5'
  })
};

function maskKey(key) {
  if (!key || key.length <= 4) return key ? '****' : '';
  return '****' + key.slice(-4);
}

// 获取 claude 用户的 home 目录（Docker 环境）
function getClaudeUserHome() {
  try {
    const uid = parseInt(execSync('id -u claude', { encoding: 'utf-8', shell: '/bin/sh' }).trim());
    return { home: '/home/claude', uid, gid: parseInt(execSync('id -g claude', { encoding: 'utf-8', shell: '/bin/sh' }).trim()) };
  } catch {
    return null;
  }
}

// 写入 Claude CLI 配置文件
async function writeClaudeCliConfig(envBlock) {
  const rootHome = homedir();

  // 写 ~/.claude.json (hasCompletedOnboarding)
  const claudeJsonPath = pathJoin(rootHome, '.claude.json');
  let claudeJson = {};
  try { if (existsSync(claudeJsonPath)) claudeJson = JSON.parse(readFileSync(claudeJsonPath, 'utf8')); } catch {}
  claudeJson.hasCompletedOnboarding = true;
  await fsWriteFile(claudeJsonPath, JSON.stringify(claudeJson, null, 2), 'utf8');

  // 写 ~/.claude/settings.json (env 块)
  const claudeDir = pathJoin(rootHome, '.claude');
  if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
  const claudeSettingsPath = pathJoin(claudeDir, 'settings.json');
  let claudeSettings = {};
  try { if (existsSync(claudeSettingsPath)) claudeSettings = JSON.parse(readFileSync(claudeSettingsPath, 'utf8')); } catch {}
  claudeSettings.env = envBlock;
  await fsWriteFile(claudeSettingsPath, JSON.stringify(claudeSettings, null, 2), 'utf8');

  // 复制到 claude 用户（Docker 环境中 Claude CLI 以非 root 用户运行）
  const claudeUser = getClaudeUserHome();
  if (claudeUser) {
    const userClaudeDir = pathJoin(claudeUser.home, '.claude');
    if (!existsSync(userClaudeDir)) mkdirSync(userClaudeDir, { recursive: true });
    copyFileSync(claudeJsonPath, pathJoin(claudeUser.home, '.claude.json'));
    copyFileSync(claudeSettingsPath, pathJoin(userClaudeDir, 'settings.json'));
    try {
      chownSync(pathJoin(claudeUser.home, '.claude.json'), claudeUser.uid, claudeUser.gid);
      chownSync(userClaudeDir, claudeUser.uid, claudeUser.gid);
      chownSync(pathJoin(userClaudeDir, 'settings.json'), claudeUser.uid, claudeUser.gid);
    } catch {}
  }
}

// 执行外部配置脚本（智谱 / 代理模式）
async function execSetupScript(provider, config) {
  const claudeUser = getClaudeUserHome();
  if (provider === 'zhipu') {
    execSync(
      `curl -sO "https://cdn.bigmodel.cn/install/claude_code_env.sh" && echo "${config.apiKey}" | bash ./claude_code_env.sh && rm -f ./claude_code_env.sh`,
      { encoding: 'utf-8', shell: '/bin/sh', cwd: '/tmp', timeout: 30000 }
    );
  } else if (provider === 'proxy') {
    execSync(
      `curl -s ${config.proxyUrl}/setup-claude-code.sh | bash -s -- --url ${config.proxyUrl} --key ${config.proxyKey}`,
      { encoding: 'utf-8', shell: '/bin/sh', cwd: '/tmp', timeout: 30000 }
    );
  }
  // 复制到 claude 用户
  if (claudeUser) {
    try {
      execSync(`cp -r /root/.claude /home/claude/.claude 2>/dev/null; cp /root/.claude.json /home/claude/.claude.json 2>/dev/null; chown -R claude:claude /home/claude`, { shell: '/bin/sh' });
    } catch {}
  }
}

router.get('/api/settings/claude-config', async (req, res) => {
  const settings = await readSettings();
  const config = settings.claudeConfig;
  if (!config || !config.provider) {
    return res.json({ success: true, data: null });
  }
  res.json({
    success: true,
    data: {
      provider: config.provider,
      apiKey: maskKey(config.apiKey),
      hasApiKey: !!config.apiKey,
      model: config.model || '',
      baseUrl: config.baseUrl || '',
      proxyUrl: config.proxyUrl || '',
      proxyKey: maskKey(config.proxyKey),
      hasProxyKey: !!config.proxyKey
    }
  });
});

router.post('/api/settings/claude-config', async (req, res) => {
  try {
    const { provider, apiKey, model, baseUrl, proxyUrl, proxyKey } = req.body;
    if (!provider) return res.status(400).json({ success: false, error: '请选择提供商' });

    // 合并：如果前端没发送 key（mask 值），保留原有 key
    const current = await readSettings();
    const oldConfig = current.claudeConfig || {};
    const newConfig = {
      provider,
      apiKey: (apiKey && !apiKey.startsWith('****')) ? apiKey : oldConfig.apiKey || '',
      model: model || '',
      baseUrl: baseUrl || '',
      proxyUrl: proxyUrl || '',
      proxyKey: (proxyKey && !proxyKey.startsWith('****')) ? proxyKey : oldConfig.proxyKey || ''
    };

    // 保存到数据库
    await writeSetting('claudeConfig', newConfig);

    // 写入 Claude CLI 配置
    if (provider === 'zhipu' || provider === 'proxy') {
      await execSetupScript(provider, newConfig);
    } else if (PROVIDER_ENV_MAP[provider]) {
      const envBlock = PROVIDER_ENV_MAP[provider](newConfig);
      await writeClaudeCliConfig(envBlock);
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[Settings] Claude 配置保存失败:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/api/settings/claude-config', async (req, res) => {
  try {
    sqliteDb.prepare('DELETE FROM settings WHERE key = ?').run('claudeConfig');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ==================== OpenRouter 配置 API ====================

router.get('/api/settings/openrouter-config', async (req, res) => {
  try {
    // 优先读 DB，其次环境变量
    const settings = await readSettings();
    const dbConfig = settings.openrouterConfig;
    if (dbConfig && dbConfig.apiKey) {
      return res.json({
        success: true,
        data: {
          apiKey: maskKey(dbConfig.apiKey),
          hasApiKey: true,
          model: dbConfig.model || 'google/gemini-2.5-flash',
          baseUrl: dbConfig.baseUrl || '',
          source: 'db'
        }
      });
    }
    // 环境变量
    const envKey = process.env.OPENROUTER_API_KEY;
    if (envKey) {
      return res.json({
        success: true,
        data: {
          apiKey: maskKey(envKey),
          hasApiKey: true,
          model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
          baseUrl: process.env.OPENROUTER_BASE_URL || '',
          source: 'env'
        }
      });
    }
    res.json({ success: true, data: null });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/api/settings/openrouter-config', async (req, res) => {
  try {
    const { apiKey, model, baseUrl } = req.body;
    const settings = await readSettings();
    const oldConfig = settings.openrouterConfig || {};

    const newConfig = {
      apiKey: (apiKey && !apiKey.startsWith('****')) ? apiKey : oldConfig.apiKey || '',
      model: model || 'google/gemini-2.5-flash',
      baseUrl: baseUrl || ''
    };

    await writeSetting('openrouterConfig', newConfig);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/api/settings/openrouter-config', async (req, res) => {
  try {
    sqliteDb.prepare('DELETE FROM settings WHERE key = ?').run('openrouterConfig');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
