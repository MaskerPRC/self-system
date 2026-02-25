import { spawn, execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { broadcast } from './websocket.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let CLAUDE_CMD = 'claude';

function initClaudeCmd() {
  try {
    let path;
    if (process.platform === 'win32') {
      path = execSync('where claude', { encoding: 'utf-8', shell: true }).trim().split('\n')[0];
    } else {
      path = execSync('command -v claude', { encoding: 'utf-8', shell: '/bin/sh' }).trim();
    }
    if (path) {
      CLAUDE_CMD = path;
      console.log(`[Claude] 命令路径: ${CLAUDE_CMD}`);
    }
  } catch {
    console.log('[Claude] 使用默认命令: claude');
  }
}

initClaudeCmd();

export async function checkClaudeCode() {
  return new Promise((resolve) => {
    const check = spawn(CLAUDE_CMD, ['--version'], { stdio: 'pipe', shell: true });
    check.on('close', (code) => resolve(code === 0));
    check.on('error', () => resolve(false));
    setTimeout(() => { check.kill(); resolve(false); }, 5000);
  });
}

/**
 * 调用 Claude Code 修改应用项目代码
 * @param {string} requirement - 用户需求描述
 * @param {string} conversationId - 对话 ID
 */
export async function callClaudeCode(requirement, conversationId) {
  const isInstalled = await checkClaudeCode();
  if (!isInstalled) throw new Error('Claude Code CLI 未安装或不可用');

  // 应用项目路径
  const appPath = resolve(__dirname, '../../../app');
  if (!existsSync(appPath)) throw new Error('应用项目目录不存在');

  const prompt = `你需要在一个"数字渐进式分身"平台的应用项目中实现用户需求。

【项目结构说明】
当前工作目录下有两个子目录：
- app/frontend/ : Vue 3 前端应用（端口 5174），承载多个交互页面
- app/server/   : Node.js + Express 后端（端口 3001），为交互页面提供 API

【用户需求】
${requirement}

【务必遵循要求】
1. 前端页面：在 app/frontend/src/views/ 下创建新的 .vue 组件
2. 前端路由：在 app/frontend/src/router/index.js 的 routes 数组中追加新路由（不要删除已有路由）
3. 心跳必须：新页面必须导入并调用心跳：
   import { useHeartbeat } from '../heartbeat.js'
   在 setup 中调用: useHeartbeat('/<你的路由路径>')
4. 后端 API：如需后端接口，在 app/server/routes/ 下创建新路由文件，并在 app/server/index.js 中注册
5. 使用 JavaScript，不使用 TypeScript
6. 保持代码风格一致，页面要有完整 UI 和功能
7. 如需新依赖使用 pnpm
8. 修改完成后代码应能正常运行
`;

  return new Promise((resolve, reject) => {
    console.log(`\n========== Claude Code 开始 ==========`);
    console.log(`[Claude] 工作目录: ${resolve(__dirname, '../../..')}`);

    const projectRoot = resolve(__dirname, '../../..');
    const claudeArgs = ['--model', 'opus', '--permission-mode', 'acceptEdits', '-p', prompt];

    const claude = spawn(CLAUDE_CMD, claudeArgs, {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    let stdout = '';
    let stderr = '';

    claude.stdout.setEncoding('utf8');
    claude.stdout.on('data', (data) => {
      stdout += data;
      process.stdout.write(data);
      broadcast({ type: 'claude_output', conversationId, message: data });
    });

    claude.stderr.setEncoding('utf8');
    claude.stderr.on('data', (data) => {
      stderr += data;
      process.stderr.write(data);
    });

    claude.on('close', (code) => {
      console.log(`[Claude] 退出码: ${code}`);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Claude Code 失败 (exit ${code})\n${stderr}`));
    });

    claude.on('error', (error) => {
      reject(new Error(`启动 Claude Code 失败: ${error.message}`));
    });
  });
}
