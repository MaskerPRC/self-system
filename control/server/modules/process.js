import { exec } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 容器名称
const APP_CONTAINER = process.env.APP_CONTAINER_NAME || 'digital-avatar-app';
const CONTROL_CONTAINER = 'digital-avatar-control';

// 日志过滤标记
const APP_MARKER = 'Digital Avatar - 应用容器';
const CONTROL_MARKER = 'Digital Avatar - 控制容器';

let isStarting = false;
let isStopping = false;

/**
 * 执行 Docker 命令
 */
function dockerExec(command) {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Docker] 命令失败: ${command}`, stderr);
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

/**
 * 从日志中截取最后一次重启后的内容
 */
function filterFromLastRestart(logs, marker) {
  const lines = logs.split('\n');
  let lastMarkerIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes(marker)) {
      lastMarkerIdx = i;
      break;
    }
  }
  if (lastMarkerIdx === -1) return logs;
  return lines.slice(lastMarkerIdx).join('\n');
}

/**
 * 启动应用容器
 */
export async function startAppProject() {
  if (isStarting) return { success: false, message: '正在启动中' };
  if (isStopping) return { success: false, message: '正在停止中' };

  isStarting = true;
  try {
    console.log(`[Process] 启动应用容器: ${APP_CONTAINER}`);
    await dockerExec(`docker start ${APP_CONTAINER}`);
    await new Promise(r => setTimeout(r, 3000));
    return { success: true };
  } catch (error) {
    throw new Error(`启动应用容器失败: ${error.message}`);
  } finally {
    isStarting = false;
  }
}

/**
 * 停止应用容器
 */
export async function stopAppProject() {
  if (isStopping) return { success: false, message: '正在停止中' };
  isStopping = true;
  try {
    console.log(`[Process] 停止应用容器: ${APP_CONTAINER}`);
    await dockerExec(`docker stop ${APP_CONTAINER}`);
    return { success: true };
  } catch (error) {
    throw new Error(`停止应用容器失败: ${error.message}`);
  } finally {
    isStopping = false;
  }
}

/**
 * 重启应用容器
 */
export async function restartAppProject() {
  console.log(`[Process] 重启应用容器: ${APP_CONTAINER}`);
  try {
    await dockerExec(`docker restart ${APP_CONTAINER}`);
    await new Promise(r => setTimeout(r, 3000));
    return { success: true };
  } catch (error) {
    throw new Error(`重启应用容器失败: ${error.message}`);
  }
}

/**
 * 获取应用容器日志（从最后一次重启开始）
 */
export async function getAppLogs(tail = 200) {
  try {
    const logs = await dockerExec(`docker logs --tail ${tail} ${APP_CONTAINER} 2>&1`);
    return filterFromLastRestart(logs, APP_MARKER);
  } catch {
    return '';
  }
}

/**
 * 获取应用容器增量日志
 */
export async function getAppLogsSince(sinceSeconds = 5) {
  try {
    const logs = await dockerExec(`docker logs --since ${sinceSeconds}s ${APP_CONTAINER} 2>&1`);
    return logs;
  } catch {
    return '';
  }
}

/**
 * 获取控制容器日志（从最后一次重启开始）
 */
export async function getControlLogs(tail = 200) {
  try {
    const logs = await dockerExec(`docker logs --tail ${tail} ${CONTROL_CONTAINER} 2>&1`);
    return filterFromLastRestart(logs, CONTROL_MARKER);
  } catch {
    return '';
  }
}

/**
 * 获取控制容器增量日志
 */
export async function getControlLogsSince(sinceSeconds = 5) {
  try {
    const logs = await dockerExec(`docker logs --since ${sinceSeconds}s ${CONTROL_CONTAINER} 2>&1`);
    return logs;
  } catch {
    return '';
  }
}

/**
 * 获取应用容器状态
 */
export async function getAppStatus() {
  try {
    const running = await dockerExec(
      `docker inspect --format '{{.State.Running}}' ${APP_CONTAINER}`
    );
    const isRunning = running.replace(/'/g, '') === 'true';

    return {
      frontend: { running: isRunning, port: 5174 },
      server: { running: isRunning, port: 3001 },
      isStarting,
      isStopping
    };
  } catch {
    return {
      frontend: { running: false, port: 5174 },
      server: { running: false, port: 3001 },
      isStarting,
      isStopping
    };
  }
}
