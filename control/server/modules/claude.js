import { spawn, execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chownSync, unlinkSync } from 'fs';
import { resolve as pathResolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { broadcast } from './websocket.js';
import { getSkillsForPrompt, getSkill } from './skills.js';
import { sqliteDb } from './sqlite.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let CLAUDE_CMD = 'claude';
let USE_SHELL = false;
let CLAUDE_UID = null;
let CLAUDE_GID = null;

// 活跃的 Claude 子进程注册表 (conversationId -> ChildProcess)
const activeProcesses = new Map();

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
 * prompt 写入临时文件，-p 参数只传短指令引用该文件，避免命令行参数超过 ARG_MAX 限制（E2BIG）
 */
function runClaude(prompt, projectRoot, conversationId) {
  return new Promise((res, reject) => {
    let model = process.env.CLAUDE_MODEL || 'opus';
    try {
      const row = sqliteDb.prepare("SELECT value FROM settings WHERE key = 'claudeConfig'").get();
      if (row) {
        const config = JSON.parse(row.value);
        if (config.model) model = config.model;
      }
    } catch {}

    // 将 prompt 写入临时文件，避免命令行参数过长导致 E2BIG
    const promptDir = pathResolve(projectRoot, 'app', 'temp', conversationId || 'default');
    mkdirSync(promptDir, { recursive: true });
    const promptFile = pathResolve(promptDir, '.prompt.md');
    writeFileSync(promptFile, prompt, 'utf8');
    if (CLAUDE_UID !== null) {
      try { chownSync(promptFile, CLAUDE_UID, CLAUDE_GID); } catch {}
    }

    // 使用绝对路径，避免 Claude Code AI 误解相对路径
    const claudeArgs = ['--model', model, '--dangerously-skip-permissions', '-p',
      `Read the file at absolute path "${promptFile}" for your complete instructions, then follow them exactly. Do NOT summarize or describe the file — execute the instructions within it.`];
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

    // 注册进程，支持外部中断
    if (conversationId) {
      activeProcesses.set(conversationId, claude);
    }

    let stdout = '';
    let stderr = '';
    let aborted = false;

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
      try { unlinkSync(promptFile); } catch {}
      activeProcesses.delete(conversationId);
      if (aborted) {
        reject(new Error('任务已被用户中断'));
        return;
      }
      console.log(`[Claude] 退出码: ${code}`);
      if (code === 0) res({ stdout, stderr });
      else reject(new Error(`Claude Code 失败 (exit ${code})\n${stderr}`));
    });

    claude.on('error', (error) => {
      try { unlinkSync(promptFile); } catch {}
      activeProcesses.delete(conversationId);
      reject(new Error(`启动 Claude Code 失败: ${error.message}`));
    });

    // 暴露 abort 方法给外部调用
    claude._markAborted = () => { aborted = true; };
  });
}

/**
 * 调用 Claude Code 处理用户需求
 */
export async function callClaudeCode(requirement, conversationId, history = [], attachments = [], targetApps = [], targetSkills = []) {
  const isInstalled = await checkClaudeCode();
  if (!isInstalled) throw new Error('Claude Code CLI 未安装或不可用');

  const projectRoot = pathResolve(__dirname, '../../..');
  const appPath = pathResolve(projectRoot, 'app');
  if (!existsSync(appPath)) throw new Error('应用项目目录不存在');

  // 预先创建 temp 目录，确保 Claude Code 可以直接写入文件
  const tempDir = pathResolve(projectRoot, 'app', 'temp', conversationId);
  mkdirSync(tempDir, { recursive: true });

  // 加载 Skills
  let skillsSection = '';
  try {
    if (targetSkills && targetSkills.length > 0) {
      // 用户指定了特定 Skills，只加载这些
      const parts = [];
      for (const ts of targetSkills) {
        const skill = await getSkill(ts.name);
        if (skill) {
          parts.push(`### Skill: ${skill.name}\n${skill.description}\n\n${skill.content}`);
        }
      }
      if (parts.length > 0) {
        skillsSection = `\n【⚠️ 用户指定使用以下 Skills - 必须严格按照 Skill 内容执行】\n${parts.join('\n\n---\n\n')}\n`;
      }
    } else {
      skillsSection = await getSkillsForPrompt();
    }
  } catch (e) {
    console.warn('[Claude] 加载 Skills 失败:', e.message);
  }

  // 加载 UI 风格设置
  let uiStyle = '';
  try {
    const row = sqliteDb.prepare("SELECT value FROM settings WHERE key = 'uiStyle'").get();
    if (row) uiStyle = row.value;
  } catch {}
  if (!uiStyle) {
    uiStyle = '黑白新粗野风格（Neo-Brutalism），使用 Tailwind CSS 4。纯黑白配色为主，粗黑边框（2-4px solid black），无圆角或极小圆角，粗体大字排版，强对比色块，按钮带实色阴影偏移（shadow-[4px_4px_0_black]），布局大胆直接，留白克制。响应式设计，移动端友好。';
  }

  // 构建对话历史上下文 — 写入文件，避免 prompt 过长
  let historySection = '';
  if (history.length > 0) {
    const historyLines = history.map(m => {
      const role = m.role === 'user' ? '用户' : (m.role === 'assistant' ? '助手' : '系统');
      return `**${role}**: ${m.content}`;
    });
    const historyMd = historyLines.join('\n\n---\n\n');
    const historyPath = pathResolve(tempDir, '.history.md');
    writeFileSync(historyPath, historyMd, 'utf8');
    const totalChars = historyMd.length;
    const tailChars = Math.min(3000, totalChars);
    historySection = `\n【对话历史】\n对话历史已保存到文件：${historyPath}\n共 ${history.length} 条消息，${totalChars} 字。\n\n⚠️ 上下文阅读规则（必须遵守）：\n1. **最近内容（最后 ${tailChars} 字）必须读取**：使用 Bash 工具执行 \`tail -c ${tailChars} "${historyPath}"\` 获取最新对话上下文\n2. **更早的历史按需查阅**：如果当前问题可能涉及更早的讨论，使用 Grep 工具在历史文件中搜索相关关键词，或使用 Read 工具查看完整历史\n3. **不可跳过第 1 步**，最近的对话上下文对理解当前问题至关重要\n`;
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

  // 构建目标应用范围限制
  let targetAppsSection = '';
  if (targetApps && targetApps.length > 0) {
    const appList = targetApps.map(a => `- "${a.title}" (路由: ${a.route_path})`).join('\n');
    targetAppsSection = `\n【⚠️ 操作范围限制】
用户指定了本次操作的目标应用，你必须严格遵守以下限制：
${appList}

规则：
1. 只能修改上述指定应用的相关文件（对应的 .vue 页面文件、路由文件、后端路由文件等）
2. 严禁修改、删除或影响任何其他应用/页面的代码和路由
3. 如果需要修改共享文件（如 app/server/index.js、app/frontend/src/router/index.js），只允许修改与上述指定应用相关的部分
4. 如果用户的需求与指定应用无关，请在 [RESPONSE] 中提示用户
`;
  }

  const prompt = `你是一个"数字渐进式分身"平台的 AI 助手，帮助用户构建和扩展他们的应用。

【项目结构说明】
当前工作目录下有两个子目录：
- app/frontend/ : Vue 3 前端应用（端口 5174），承载多个交互页面
  - 已安装 Tailwind CSS 4（通过 @tailwindcss/vite 插件集成，CSS 入口 src/style.css 已配置 @import "tailwindcss"）
  - 直接在 Vue 模板中使用 Tailwind 4 的 class 即可，无需额外配置
  - Tailwind 4 不需要 tailwind.config.js，自定义主题用 CSS 变量（@theme 指令）
- app/server/   : Node.js + Express 后端（端口 3001），为交互页面提供 API
- .claude/skills/ : Skills 目录，存放已安装的技能配置
${skillsSection}${historySection}${attachmentsSection}${targetAppsSection}
【当前用户消息】
${requirement}

【处理规范】

**如果是简单问答/闲聊**（不涉及代码修改）：直接用自然语言回答即可。

**如果需要创建/修改交互页面**：
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
7. 【默认 UI 设计规范】除非用户在本次消息中明确指定了设计风格，否则必须遵循以下默认风格：
   ${uiStyle}
8. 如需新依赖使用 pnpm。重要：不要使用需要原生编译的 npm 包（如 better-sqlite3、sharp 等），优先使用纯 JavaScript 实现的替代方案（如 sql.js、jimp 等）
9. 修改完成后代码应能正常运行
10. 【严禁使用 localhost 或 127.0.0.1】前端代码中调用后端 API 时，必须使用相对路径（如 fetch('/api/xxx')），严禁写 http://localhost:3001 或 http://127.0.0.1:3001。正确写法：fetch('/api/xxx')

**如果需要创建/修改 Skill**：
1. 不要自己创建文件（你没有 .claude/ 目录的写入权限）
2. 在回复末尾用以下格式输出 skill 内容，系统会自动创建文件：
[SKILL_INFO]
name: <skill名称，纯英文小写加连字符>
description: <一句话描述 skill 的用途>
content: <skill 的完整 Markdown 内容，包含使用说明、API 端点、认证方式、示例代码等>
[/SKILL_INFO]
3. 如果用户提供了 API Key 等凭证，必须包含在 content 中
4. 修改已有 skill 时，name 必须与已有 skill 名称一致

**如果需要生成/创建文件（SVG、文档、数据文件等）**：
1. 文件写入路径：${tempDir}（相对路径：app/temp/${conversationId}/）
2. 使用 Write 工具实际创建文件，文件名加时间戳前缀
3. 不要使用 Read 工具读取已写入的二进制文件（会导致 base64 错误）
4. 文件写入后，在回复中告知用户文件已生成

【进度追踪（极其重要，必须严格遵守）】
用户界面每 3 秒轮询 ${tempDir}/.TODO.md 来展示实时进度。你必须在每完成一个步骤后**立刻**更新该文件，不要等到最后一起更新。

规则：
1. 开始工作前，先用 Write 工具创建 ${tempDir}/.TODO.md，列出所有待做步骤（全部为 [ ]）
2. 每完成一个步骤，**立刻**用 Edit 工具将该步骤的 [ ] 改为 [x]，然后再继续下一个步骤
3. 绝对禁止：先完成所有工作再统一打勾。必须是「完成一步 → 立刻打勾 → 做下一步」的循环
4. 格式要求（3-8 条，不加标题，不加其他内容）：
- [ ] 待完成的任务
- [x] 已完成的任务

正确的工作节奏示例：
  第1步: Write .TODO.md → 全部 [ ]
  第2步: 创建后端路由 → Edit .TODO.md 打勾第1项
  第3步: 创建前端页面 → Edit .TODO.md 打勾第2项
  第4步: 注册路由 → Edit .TODO.md 打勾第3项
  ...依此类推
`;

  console.log(`\n========== Claude Code 开始 ==========`);
  console.log(`[Claude] 工作目录: ${projectRoot}`);

  // 所有目录和文件准备完毕后，chown 整个 app 目录给 claude 用户
  if (CLAUDE_UID !== null) {
    try {
      execSync(`chown -R ${CLAUDE_UID}:${CLAUDE_GID} ${appPath}`, { shell: '/bin/sh', timeout: 30000 });
    } catch {}
  }

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
  // chown 整个 app 目录给 claude 用户
  if (CLAUDE_UID !== null) {
    try {
      execSync(`chown -R ${CLAUDE_UID}:${CLAUDE_GID} ${pathResolve(projectRoot, 'app')}`, { shell: '/bin/sh', timeout: 30000 });
    } catch {}
  }
  return runClaude(prompt, projectRoot, conversationId);
}

/**
 * 中断正在执行的 Claude Code 进程
 * @returns {boolean} 是否成功中断（true=正在运行并已终止，false=没有找到运行中的进程）
 */
export function abortClaude(conversationId) {
  const proc = activeProcesses.get(conversationId);
  if (proc) {
    console.log(`[Claude] 中断任务: ${conversationId}`);
    proc._markAborted();
    proc.kill('SIGTERM');
    // 给一个宽限期，如果 SIGTERM 没杀死就 SIGKILL
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
    }, 3000);
    activeProcesses.delete(conversationId);
    return true;
  }
  return false;
}
