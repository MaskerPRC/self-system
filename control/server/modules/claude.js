import { spawn, execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve as pathResolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { broadcast } from './websocket.js';
import { getSkillsForPrompt } from './skills.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let CLAUDE_CMD = 'claude';
let USE_SHELL = false;
let CLAUDE_UID = null;
let CLAUDE_GID = null;

function initClaudeCmd() {
  try {
    const found = execSync('command -v claude', { encoding: 'utf-8', shell: '/bin/sh' }).trim();
    if (found) {
      CLAUDE_CMD = found;
      console.log(`[Claude] 命令路径: ${CLAUDE_CMD}`);

      // 检测是否是脚本文件
      try {
        const content = readFileSync(CLAUDE_CMD, 'utf8');
        if (content.startsWith('#!')) {
          USE_SHELL = true;
          console.log('[Claude] 检测到脚本文件，使用 shell 模式');
        }
      } catch {
        // 二进制文件读取失败，不需要 shell
      }
    }
  } catch {
    console.log('[Claude] 使用默认命令: claude');
  }

  // 获取非 root 用户 uid/gid（--dangerously-skip-permissions 不允许 root）
  try {
    CLAUDE_UID = parseInt(execSync('id -u claude', { encoding: 'utf-8', shell: '/bin/sh' }).trim());
    CLAUDE_GID = parseInt(execSync('id -g claude', { encoding: 'utf-8', shell: '/bin/sh' }).trim());
    console.log(`[Claude] 非 root 用户: claude (uid=${CLAUDE_UID}, gid=${CLAUDE_GID})`);
  } catch {
    console.log('[Claude] 未找到 claude 用户，将以当前用户运行');
  }
}

initClaudeCmd();

export async function checkClaudeCode() {
  return new Promise((res) => {
    const spawnOpts = { stdio: 'pipe', shell: false, env: { ...process.env } };
    const check = USE_SHELL
      ? spawn('/bin/sh', ['-c', `${CLAUDE_CMD} --version`], spawnOpts)
      : spawn(CLAUDE_CMD, ['--version'], spawnOpts);

    check.on('close', (code) => res(code === 0));
    check.on('error', () => res(false));
    setTimeout(() => { check.kill(); res(false); }, 5000);
  });
}

/**
 * 执行 Claude Code CLI（底层方法）
 */
function runClaude(prompt, projectRoot, conversationId) {
  return new Promise((res, reject) => {
    const claudeArgs = ['--model', 'opus', '--dangerously-skip-permissions', '-p', prompt];
    const spawnEnv = { ...process.env };

    // 以非 root 用户运行（--dangerously-skip-permissions 要求）
    const spawnOpts = {
      cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'], shell: false, env: spawnEnv
    };
    if (CLAUDE_UID !== null) {
      spawnOpts.uid = CLAUDE_UID;
      spawnOpts.gid = CLAUDE_GID;
      spawnEnv.HOME = '/home/claude';
      spawnEnv.USER = 'claude';
    }

    let claude;
    if (USE_SHELL) {
      const escapedArgs = claudeArgs.map(arg => `'${arg.replace(/'/g, "'\\''")}'`).join(' ');
      claude = spawn('/bin/sh', ['-c', `${CLAUDE_CMD} ${escapedArgs}`], spawnOpts);
    } else {
      claude = spawn(CLAUDE_CMD, claudeArgs, spawnOpts);
    }

    let stdout = '';
    let stderr = '';

    claude.stdout.setEncoding('utf8');
    claude.stdout.on('data', (data) => {
      stdout += data;
      process.stdout.write(data);
      if (conversationId) {
        broadcast({ type: 'claude_output', conversationId, message: data });
      }
    });

    claude.stderr.setEncoding('utf8');
    claude.stderr.on('data', (data) => {
      stderr += data;
      process.stderr.write(data);
    });

    claude.on('close', (code) => {
      console.log(`[Claude] 退出码: ${code}`);
      if (code === 0) res({ stdout, stderr });
      else reject(new Error(`Claude Code 失败 (exit ${code})\n${stderr}`));
    });

    claude.on('error', (error) => {
      reject(new Error(`启动 Claude Code 失败: ${error.message}`));
    });
  });
}

/**
 * 调用 Claude Code 处理用户需求
 */
export async function callClaudeCode(requirement, conversationId, history = [], attachments = []) {
  const isInstalled = await checkClaudeCode();
  if (!isInstalled) throw new Error('Claude Code CLI 未安装或不可用');

  const projectRoot = pathResolve(__dirname, '../../..');
  const appPath = pathResolve(projectRoot, 'app');
  if (!existsSync(appPath)) throw new Error('应用项目目录不存在');

  // 加载已安装的 Skills
  let skillsSection = '';
  try {
    skillsSection = await getSkillsForPrompt();
  } catch (e) {
    console.warn('[Claude] 加载 Skills 失败:', e.message);
  }

  // 构建对话历史上下文
  let historySection = '';
  if (history.length > 0) {
    const historyLines = history.map(m => {
      const role = m.role === 'user' ? '用户' : (m.role === 'assistant' ? '助手' : '系统');
      return `${role}: ${m.content}`;
    });
    historySection = `\n【对话历史】\n${historyLines.join('\n')}\n`;
  }

  // 构建文件附件上下文
  let attachmentsSection = '';
  if (attachments && attachments.length > 0) {
    const fileList = attachments.map(f => `- ${f.path} (${f.name}, ${f.type}, ${f.size} bytes)`).join('\n');
    attachmentsSection = `\n【用户上传的文件】
以下文件已上传到项目目录中，你可以使用 Read 工具直接查看这些文件：
${fileList}
`;
  }

  const prompt = `你是一个"数字渐进式分身"平台的 AI 助手。根据用户需求，你需要判断该如何处理。

【项目结构说明】
当前工作目录下有两个子目录：
- app/frontend/ : Vue 3 前端应用（端口 5174），承载多个交互页面
- app/server/   : Node.js + Express 后端（端口 3001），为交互页面提供 API
- .claude/skills/ : Skills 目录，存放已安装的技能配置
${skillsSection}${historySection}${attachmentsSection}
【当前用户消息】
${requirement}

【请判断需求类型并对应处理】

类型一：简单对话/问答
如果用户只是提问、闲聊、或者不涉及代码修改的需求（例如"1+1等于几"、"你好"、"解释一下什么是React"），
请直接回答，不要创建任何文件或页面。回答后输出：
[RESPONSE]
<你的回答内容，支持 Markdown 格式>
[/RESPONSE]

类型二：创建/修改交互页面
如果用户需要创建新页面、新功能、修改现有代码，请按以下规范执行：
1. 前端页面：在 app/frontend/src/views/ 下创建新的 .vue 组件
2. 前端路由：在 app/frontend/src/router/index.js 的 routes 数组中追加新路由（不要删除已有路由）
   - 路由 path 必须使用纯英文小写加连字符，例如 /timer、/todo-list、/weather-app
   - 路由 name 使用英文驼峰命名
3. 心跳必须：新页面必须导入并调用心跳：
   import { useHeartbeat } from '../heartbeat.js'
   在 setup 中调用: useHeartbeat('/<你的路由路径>')
4. 后端 API：如需后端接口，在 app/server/routes/ 下创建新路由文件，并在 app/server/index.js 中注册
5. 使用 JavaScript，不使用 TypeScript
6. 保持代码风格一致，页面要有完整 UI 和功能
7. 如需新依赖使用 pnpm。重要：不要使用需要原生编译的 npm 包（如 better-sqlite3、sharp 等），优先使用纯 JavaScript 实现的替代方案（如 sql.js、jimp 等）
8. 修改完成后代码应能正常运行
完成后输出：
[PAGE_INFO]
route: /<你添加的路由path>
title: <页面标题>
public: <true 或 false，如果用户要求页面公开访问（不需要登录）则为 true，默认 false>
[/PAGE_INFO]

注意：如果用户提到"公开"、"公开访问"、"不需要登录"、"任何人可访问"等，请设置 public: true。公开页面无需登录即可访问。默认情况下页面为私有（需要登录）。

类型三：创建 Skill
如果用户要求创建/新增一个 Skill（例如用户提供了 API 文档、API Key，并要求制作对应的 skill），请：
1. 不要自己创建文件（你没有 .claude/ 目录的写入权限）
2. 将 skill 的完整内容通过标记输出，系统会自动创建文件
3. skill-name 使用纯英文小写加连字符
4. Skill 应包含完整的使用说明，让后续对话可以直接依据 skill 内容完成任务
5. 如果用户提供了 API Key 等凭证，包含在 content 中以便后续使用
6. 创建 skill 时不需要创建页面或修改路由
完成后输出：
[SKILL_INFO]
name: <skill名称，纯英文小写加连字符>
description: <一句话描述 skill 的用途>
content: <skill 的完整 Markdown 内容，包含使用说明、API 端点、认证方式、示例代码等>
[/SKILL_INFO]

【重要规则】
- 每次必须且只需输出一种标记（[RESPONSE]、[PAGE_INFO]、[SKILL_INFO]）
- 简单问题绝对不要创建页面或文件，直接用 [RESPONSE] 回答
- 如果既创建了页面又创建了 skill，可以同时输出 [PAGE_INFO] 和 [SKILL_INFO]
`;

  console.log(`\n========== Claude Code 开始 ==========`);
  console.log(`[Claude] 工作目录: ${projectRoot}`);

  return runClaude(prompt, projectRoot, conversationId);
}

/**
 * 调用 Claude Code 验证并修复应用启动问题
 */
export async function verifyAndFixApp(errorLog, conversationId) {
  const projectRoot = pathResolve(__dirname, '../../..');

  const prompt = `应用项目启动失败，请根据错误日志修复问题。

【项目结构】
- app/frontend/ : Vue 3 前端应用
- app/server/   : Node.js + Express 后端

【错误日志】
${errorLog}

【修复要求】
1. 分析错误原因，直接修复代码
2. 如果是依赖问题（如原生模块编译失败），请替换为纯 JavaScript 的替代方案
3. 确保修改后 app/server/index.js 和 app/frontend 都能正常启动
4. 不要使用需要原生编译的 npm 包（如 better-sqlite3、sharp、canvas 等）
5. 修复完成后输出：
[FIX_RESULT]
fixed: true
summary: <一句话描述修复了什么>
[/FIX_RESULT]
`;

  console.log(`\n========== Claude Code 修复开始 ==========`);
  return runClaude(prompt, projectRoot, conversationId);
}
