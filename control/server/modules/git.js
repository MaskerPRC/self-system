import { exec } from 'child_process';
import { existsSync } from 'fs';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const APP_DIR = resolve(__dirname, '../../../app');
const GIT_CONFIG_PATH = resolve(__dirname, '../../../.claude/git-config.json');

const GIT_USER_NAME = process.env.GIT_USER_NAME || 'Digital Avatar Bot';
const GIT_USER_EMAIL = process.env.GIT_USER_EMAIL || 'bot@digital-avatar.local';
const GIT_AUTO_PUSH = process.env.GIT_AUTO_PUSH === 'true';

// 运行时远程配置（优先持久化文件，回退到环境变量）
let runtimeRepoUrl = '';
let runtimeToken = '';
let initialized = false;

// ---- 配置持久化 ----

async function loadGitConfig() {
  try {
    if (existsSync(GIT_CONFIG_PATH)) {
      const raw = await readFile(GIT_CONFIG_PATH, 'utf8');
      const cfg = JSON.parse(raw);
      runtimeRepoUrl = cfg.repoUrl || '';
      runtimeToken = cfg.token || '';
    }
  } catch {}
  // 持久化为空时，从环境变量解析
  if (!runtimeRepoUrl && process.env.GIT_REMOTE_URL) {
    const parsed = parseAuthUrl(process.env.GIT_REMOTE_URL);
    runtimeRepoUrl = parsed.repoUrl;
    runtimeToken = parsed.token;
  }
}

async function saveGitConfig() {
  try {
    const dir = dirname(GIT_CONFIG_PATH);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(GIT_CONFIG_PATH, JSON.stringify({ repoUrl: runtimeRepoUrl, token: runtimeToken }), 'utf8');
  } catch (e) {
    console.error('[Git] Failed to save config:', e.message);
  }
}

// 从 https://x-access-token:TOKEN@github.com/user/repo.git 解析
function parseAuthUrl(url) {
  const match = url.match(/^(https?:\/\/)[^:]+:([^@]+)@(.+)$/);
  if (match) return { repoUrl: match[1] + match[3], token: match[2] };
  return { repoUrl: url, token: '' };
}

// 组合带认证的 URL
function buildAuthUrl() {
  if (!runtimeRepoUrl) return '';
  if (!runtimeToken) return runtimeRepoUrl;
  return runtimeRepoUrl.replace(/^(https?:\/\/)/, `$1x-access-token:${runtimeToken}@`);
}

// ---- 对外接口：远程配置管理 ----

export function getGitRemoteConfig() {
  return {
    repoUrl: runtimeRepoUrl,
    hasToken: !!runtimeToken,
    autoPush: GIT_AUTO_PUSH
  };
}

export async function updateGitRemoteConfig(repoUrl, token) {
  runtimeRepoUrl = (repoUrl || '').trim();
  // token 传空字符串表示不改，传 null 或特定值表示清除
  if (token !== undefined) runtimeToken = (token || '').trim();
  await saveGitConfig();

  if (initialized && runtimeRepoUrl) {
    const authUrl = buildAuthUrl();
    try {
      await gitExec('git remote get-url origin');
      await gitExec(`git remote set-url origin "${authUrl}"`);
    } catch {
      await gitExec(`git remote add origin "${authUrl}"`);
    }
    console.log(`[Git] Remote updated: ${runtimeRepoUrl}`);
  } else if (initialized && !runtimeRepoUrl) {
    try { await gitExec('git remote remove origin'); } catch {}
    console.log('[Git] Remote removed');
  }
}

// ---- Git 操作 ----

function gitExec(command) {
  return new Promise((resolve, reject) => {
    exec(command, {
      cwd: APP_DIR,
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout.trim());
    });
  });
}

export async function initGitRepo() {
  if (initialized) return;

  // 先加载持久化的远程配置
  await loadGitConfig();

  try {
    if (!existsSync(APP_DIR)) {
      console.log('[Git] App directory not found, skipping init');
      return;
    }

    try {
      await gitExec(`git config --global --add safe.directory ${APP_DIR}`);
    } catch {}

    const isRepo = existsSync(resolve(APP_DIR, '.git'));

    if (!isRepo) {
      console.log('[Git] Initializing new git repository...');

      const gitignore = [
        'node_modules/', '.pnpm-store/', '.vite/', 'dist/', '*.log', '.DS_Store', 'pnpm-lock.yaml', 'temp/'
      ].join('\n') + '\n';
      await writeFile(resolve(APP_DIR, '.gitignore'), gitignore, 'utf8');

      await gitExec('git init');
      await gitExec(`git config user.name "${GIT_USER_NAME}"`);
      await gitExec(`git config user.email "${GIT_USER_EMAIL}"`);

      await gitExec('git add -A');
      await gitExec('git commit -m "Initial commit: app project scaffolding"');
      console.log('[Git] Initial commit created');
    } else {
      await gitExec(`git config user.name "${GIT_USER_NAME}"`);
      await gitExec(`git config user.email "${GIT_USER_EMAIL}"`);
      console.log('[Git] Existing git repository found');
    }

    if (runtimeRepoUrl) {
      const authUrl = buildAuthUrl();
      try {
        await gitExec('git remote get-url origin');
        await gitExec(`git remote set-url origin "${authUrl}"`);
      } catch {
        await gitExec(`git remote add origin "${authUrl}"`);
      }
      console.log(`[Git] Remote configured: ${runtimeRepoUrl}`);
    }

    initialized = true;
    console.log('[Git] Repository ready');
  } catch (error) {
    console.error('[Git] Initialization failed:', error.message);
  }
}

export async function commitChanges(message) {
  try {
    if (!initialized) await initGitRepo();
    if (!initialized) return { committed: false, error: 'Git repository not initialized' };

    const status = await gitExec('git status --porcelain');
    if (!status) {
      console.log('[Git] No changes to commit');
      return { committed: false, error: 'No changes detected' };
    }

    await gitExec('git add -A');

    const sanitized = message.replace(/"/g, '\\"').replace(/\n/g, ' ').slice(0, 200);
    await gitExec(`git commit -m "${sanitized}"`);

    const commitHash = await gitExec('git rev-parse --short HEAD');
    console.log(`[Git] Committed: ${commitHash} - ${sanitized.slice(0, 80)}`);

    if (GIT_AUTO_PUSH && runtimeRepoUrl) {
      try { await pushToRemote(); }
      catch (e) { console.error('[Git] Push failed (commit preserved locally):', e.message); }
    }

    return { committed: true, commitHash };
  } catch (error) {
    console.error('[Git] Commit failed:', error.message);
    return { committed: false, error: error.message };
  }
}

export async function pushToRemote() {
  if (!runtimeRepoUrl) throw new Error('No remote URL configured');
  const branch = await gitExec('git branch --show-current');
  await gitExec(`git push -u origin ${branch}`);
  console.log(`[Git] Pushed to origin/${branch}`);
}

export async function getCommitHistory(limit = 30) {
  try {
    if (!initialized) await initGitRepo();
    if (!initialized) return [];

    const currentHash = await gitExec('git rev-parse --short HEAD');
    const log = await gitExec(`git log --format="%h||%s||%ai" -${limit}`);
    if (!log) return [];

    return log.split('\n').map(line => {
      const [hash, message, date] = line.split('||');
      return { hash, message, date, current: hash === currentHash };
    });
  } catch (error) {
    console.error('[Git] Get history failed:', error.message);
    return [];
  }
}

export async function checkoutCommit(hash) {
  try {
    if (!initialized) await initGitRepo();
    if (!initialized) throw new Error('Git repository not initialized');

    const status = await gitExec('git status --porcelain');
    if (status) {
      await gitExec('git add -A');
      await gitExec('git commit -m "Auto-save before rollback"');
    }

    await gitExec(`git checkout ${hash} -- .`);
    await gitExec(`git add -A`);
    await gitExec(`git commit -m "Rollback to ${hash}"`);

    const newHash = await gitExec('git rev-parse --short HEAD');
    console.log(`[Git] Rolled back to ${hash}, new commit: ${newHash}`);
    return { success: true, commitHash: newHash };
  } catch (error) {
    console.error('[Git] Checkout failed:', error.message);
    return { success: false, error: error.message };
  }
}

export async function getGitStatus() {
  try {
    if (!initialized) return { initialized: false };
    const branch = await gitExec('git branch --show-current');
    const log = await gitExec('git log --oneline -5');
    const status = await gitExec('git status --short');
    return { initialized: true, branch, recentCommits: log, status, remoteConfig: getGitRemoteConfig() };
  } catch (error) {
    return { initialized: false, error: error.message };
  }
}
