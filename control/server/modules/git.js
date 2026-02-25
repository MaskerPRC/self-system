import { exec } from 'child_process';
import { existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const APP_DIR = resolve(__dirname, '../../../app');

const GIT_USER_NAME = process.env.GIT_USER_NAME || 'Digital Avatar Bot';
const GIT_USER_EMAIL = process.env.GIT_USER_EMAIL || 'bot@digital-avatar.local';
const GIT_REMOTE_URL = process.env.GIT_REMOTE_URL || '';
const GIT_AUTO_PUSH = process.env.GIT_AUTO_PUSH === 'true';

let initialized = false;

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

  try {
    if (!existsSync(APP_DIR)) {
      console.log('[Git] App directory not found, skipping init');
      return;
    }

    // 允许操作非当前用户所有的目录（root 运行但目录属于 claude 用户）
    try {
      await gitExec(`git config --global --add safe.directory ${APP_DIR}`);
    } catch {}

    const isRepo = existsSync(resolve(APP_DIR, '.git'));

    if (!isRepo) {
      console.log('[Git] Initializing new git repository...');

      const gitignore = [
        'node_modules/', '.pnpm-store/', '.vite/', 'dist/', '*.log', '.DS_Store', 'pnpm-lock.yaml'
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

    if (GIT_REMOTE_URL) {
      try {
        await gitExec('git remote get-url origin');
        await gitExec(`git remote set-url origin "${GIT_REMOTE_URL}"`);
      } catch {
        await gitExec(`git remote add origin "${GIT_REMOTE_URL}"`);
      }
      console.log(`[Git] Remote configured: ${GIT_REMOTE_URL}`);
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

    if (GIT_AUTO_PUSH && GIT_REMOTE_URL) {
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
  if (!GIT_REMOTE_URL) throw new Error('No remote URL configured');
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

    // Save any uncommitted changes first
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
    return { initialized: true, branch, recentCommits: log, status, remoteUrl: GIT_REMOTE_URL || null };
  } catch (error) {
    return { initialized: false, error: error.message };
  }
}
