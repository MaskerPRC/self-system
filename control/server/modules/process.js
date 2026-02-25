import { spawn, exec } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 应用项目端口
const APP_FRONTEND_PORT = 5174;
const APP_SERVER_PORT = 3001;

// 受保护端口（控制项目自身）
const PROTECTED_PORTS = [3000, 5173];

let appFrontendProcess = null;
let appServerProcess = null;
let isStarting = false;
let isStopping = false;

function getAppPath() {
  return resolve(__dirname, '../../../app');
}

async function isPortInUse(port) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (error, stdout) => {
        resolve(stdout.trim().length > 0);
      });
    } else {
      exec(`ss -tlnp | grep :${port}`, (error, stdout) => {
        if (stdout && stdout.trim().length > 0) resolve(true);
        else {
          exec(`lsof -i :${port} -sTCP:LISTEN`, (err2, out2) => {
            resolve(out2 && out2.trim().length > 0);
          });
        }
      });
    }
  });
}

async function getPortPid(port) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(`netstat -ano | findstr :${port} | findstr LISTENING`, (error, stdout) => {
        if (!stdout) return resolve([]);
        const pids = new Set();
        for (const line of stdout.trim().split('\n')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(pid) && pid !== '0' && pid !== '1') pids.add(pid);
        }
        resolve([...pids]);
      });
    } else {
      exec(`lsof -ti :${port} -sTCP:LISTEN`, (error, stdout) => {
        resolve(stdout ? stdout.trim().split('\n').filter(p => p && p !== '0') : []);
      });
    }
  });
}

async function forceKillPort(port) {
  if (PROTECTED_PORTS.includes(port)) return;
  const pids = await getPortPid(port);
  if (pids.length === 0) return;

  console.log(`[Process] 杀死端口 ${port} 进程: ${pids.join(', ')}`);
  const cmd = process.platform === 'win32'
    ? pids.map(p => `taskkill /F /PID ${p}`).join(' & ')
    : pids.map(p => `kill -9 ${p}`).join(' ; ');

  return new Promise((resolve) => {
    exec(cmd, () => setTimeout(resolve, 500));
  });
}

async function waitForPort(port, maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    if (!(await isPortInUse(port))) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function installDeps(dir) {
  if (!existsSync(resolve(dir, 'package.json'))) return;
  console.log(`[Process] 安装依赖: ${dir}`);
  return new Promise((resolve, reject) => {
    const p = spawn('pnpm', ['install'], { cwd: dir, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', d => console.log('[pnpm]', d.toString()));
    p.stderr.on('data', d => console.log('[pnpm]', d.toString()));
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`pnpm install 失败: ${code}`)));
  });
}

/**
 * 启动应用项目（前端+后端）
 */
export async function startAppProject() {
  if (isStarting) return { success: false, message: '正在启动中' };
  if (isStopping) return { success: false, message: '正在停止中' };

  const appPath = getAppPath();
  if (!existsSync(appPath)) throw new Error('App 目录不存在');

  isStarting = true;
  try {
    // 启动 app server
    const serverPath = resolve(appPath, 'server');
    if (existsSync(resolve(serverPath, 'package.json'))) {
      if (await isPortInUse(APP_SERVER_PORT)) {
        await forceKillPort(APP_SERVER_PORT);
        await waitForPort(APP_SERVER_PORT);
      }
      await installDeps(serverPath);

      appServerProcess = spawn('node', ['--watch', 'index.js'], {
        cwd: serverPath,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PORT: APP_SERVER_PORT.toString() }
      });
      appServerProcess.stdout.on('data', d => console.log('[App Server]', d.toString()));
      appServerProcess.stderr.on('data', d => console.error('[App Server]', d.toString()));
      appServerProcess.on('close', () => { appServerProcess = null; });
    }

    // 启动 app frontend
    const frontendPath = resolve(appPath, 'frontend');
    if (existsSync(resolve(frontendPath, 'package.json'))) {
      if (await isPortInUse(APP_FRONTEND_PORT)) {
        await forceKillPort(APP_FRONTEND_PORT);
        await waitForPort(APP_FRONTEND_PORT);
      }
      await installDeps(frontendPath);

      appFrontendProcess = spawn('npx', ['vite', '--port', APP_FRONTEND_PORT.toString(), '--host'], {
        cwd: frontendPath,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      appFrontendProcess.stdout.on('data', d => console.log('[App Frontend]', d.toString()));
      appFrontendProcess.stderr.on('data', d => console.error('[App Frontend]', d.toString()));
      appFrontendProcess.on('close', () => { appFrontendProcess = null; });
    }

    await new Promise(r => setTimeout(r, 3000));
    return { success: true };
  } finally {
    isStarting = false;
  }
}

/**
 * 停止应用项目
 */
export async function stopAppProject() {
  if (isStopping) return { success: false, message: '正在停止中' };
  isStopping = true;
  try {
    if (appServerProcess) { appServerProcess.kill(); appServerProcess = null; }
    if (appFrontendProcess) { appFrontendProcess.kill(); appFrontendProcess = null; }
    await forceKillPort(APP_SERVER_PORT);
    await forceKillPort(APP_FRONTEND_PORT);
    return { success: true };
  } finally {
    isStopping = false;
  }
}

/**
 * 重启应用项目
 */
export async function restartAppProject() {
  await stopAppProject();
  await new Promise(r => setTimeout(r, 1000));
  return startAppProject();
}

/**
 * 获取应用项目状态
 */
export async function getAppStatus() {
  return {
    frontend: { running: await isPortInUse(APP_FRONTEND_PORT), port: APP_FRONTEND_PORT },
    server: { running: await isPortInUse(APP_SERVER_PORT), port: APP_SERVER_PORT },
    isStarting,
    isStopping
  };
}
