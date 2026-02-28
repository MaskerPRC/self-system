import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { resolve as pathResolve, dirname } from 'path';
import { readFileSync, existsSync } from 'fs';
import { writeFile as fsWriteFile, mkdir as fsMkdir, rm as fsRm } from 'fs/promises';
import { exec } from 'child_process';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { setupWebSocket, broadcast, markProcessing, clearProcessing, markQueued, clearQueued, getProcessingList, getQueuedList, getClientCount } from './modules/websocket.js';
import { getSupabase } from './modules/supabase.js';
import { callClaudeCode, verifyAndFixApp, abortClaude } from './modules/claude.js';
import { startAppProject, stopAppProject, restartAppProject, getAppStatus, getAppLogs, getAppLogsSince, getControlLogs, getControlLogsSince } from './modules/process.js';
import { registerHeartbeat, getAllPages, getActivePages, startHeartbeatChecker } from './modules/heartbeat.js';
import { getSkills, getSkill, createSkill, updateSkill, deleteSkill } from './modules/skills.js';
import { initGitRepo, commitChanges, getCommitHistory, checkoutCommit, getGitStatus, getGitRemoteConfig, updateGitRemoteConfig, pushToRemote } from './modules/git.js';
import { authMiddleware, createSession, destroySession, isAuthEnabled, validateSession, parseCookie, COOKIE_NAME, SESSION_MAX_AGE } from './modules/auth.js';
import PQueue from 'p-queue';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);
const PORT = 3000;

const requestQueue = new PQueue({ concurrency: 1 });

// 已被用户中断的对话 ID 集合（用于跳过队列中等待的任务）
const abortedConversations = new Set();

app.use(cors());
app.use(express.json());
app.use(authMiddleware);

setupWebSocket(server);

// ==================== 鉴权 API ====================

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '用户名和密码必填' });
  }
  const token = createSession(username, password);
  if (!token) {
    return res.status(401).json({ success: false, error: '用户名或密码错误' });
  }
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE,
    sameSite: 'lax',
    secure: req.secure
  });
  res.json({ success: true });
});

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookie(req.headers);
  if (token) destroySession(token);
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
  if (!isAuthEnabled()) {
    return res.json({ success: true, authEnabled: false });
  }
  const token = parseCookie(req.headers);
  res.json({ success: true, authEnabled: true, authenticated: validateSession(token) });
});

// ==================== 健康检查 ====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== 前端配置 ====================

app.get('/api/config', (req, res) => {
  res.json({
    appExternalUrl: process.env.APP_EXTERNAL_URL || 'http://localhost:5174'
  });
});

// ==================== 对话 API ====================

app.get('/api/conversations', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/conversations', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { title } = req.body;
    const { data, error } = await supabase
      .from('conversations')
      .insert({ title: title || '新对话' })
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.patch('/api/conversations/:id', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { title } = req.body;
    const { data, error } = await supabase
      .from('conversations')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/conversations/:id', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;

    // 清理该对话的临时文件
    const tempDir = pathResolve(__dirname, '../../app/temp', req.params.id);
    try { await fsRm(tempDir, { recursive: true, force: true }); } catch {}

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 消息 API ====================

app.get('/api/conversations/:id/messages', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', req.params.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 发送消息（核心：触发 Claude Code 修改应用项目）
app.post('/api/conversations/:id/messages', async (req, res) => {
  const { content, attachments } = req.body;
  const conversationId = req.params.id;

  const hasAttachments = attachments && attachments.length > 0;
  if ((!content || !content.trim()) && !hasAttachments) {
    return res.status(400).json({ success: false, error: '消息不能为空' });
  }

  try {
    const supabase = getSupabase();

    // 保存用户消息
    const msgContent = content ? content.trim() : '';
    const insertData = { conversation_id: conversationId, role: 'user', content: msgContent };
    if (hasAttachments) insertData.attachments = attachments;
    const { data: userMsg, error: userError } = await supabase
      .from('messages')
      .insert(insertData)
      .select()
      .single();
    if (userError) throw userError;

    // 更新对话时间
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    const requestId = Date.now().toString();
    res.json({ success: true, data: userMsg, requestId });

    // 广播排队状态（队列中有任务时标记为排队，否则直接进入处理）
    if (requestQueue.size > 0 || requestQueue.pending > 0) {
      markQueued(conversationId);
      broadcast({ type: 'queued', conversationId, requestId });
    }

    // 异步执行 Claude Code
    requestQueue.add(async () => {
      // 检查是否已被用户中断
      if (abortedConversations.has(conversationId)) {
        abortedConversations.delete(conversationId);
        clearQueued(conversationId);
        return;
      }

      try {
        markProcessing(conversationId);
        broadcast({ type: 'processing', conversationId, requestId, message: '正在处理需求...' });

        // 获取对话历史（排除刚插入的这条，取最近 20 条作为上下文）
        let history = [];
        try {
          const { data: historyData } = await supabase
            .from('messages')
            .select('role, content')
            .eq('conversation_id', conversationId)
            .neq('id', userMsg.id)
            .order('created_at', { ascending: true });
          if (historyData) {
            history = historyData.filter(m => m.role !== 'system').slice(-20);
          }
        } catch {}

        // 首条消息时自动生成对话标题
        if (history.length === 0) {
          const titleSource = msgContent || (hasAttachments ? `上传了 ${attachments.length} 个文件` : '新对话');
          const autoTitle = titleSource.slice(0, 30) + (titleSource.length > 30 ? '...' : '');
          try {
            await supabase
              .from('conversations')
              .update({ title: autoTitle, updated_at: new Date().toISOString() })
              .eq('id', conversationId);
            broadcast({ type: 'title_updated', conversationId, title: autoTitle });
          } catch {}
        }

        const result = await callClaudeCode(msgContent || '请查看我上传的文件', conversationId, history, attachments);

        // 1. 检查是否为简单回复 [RESPONSE]
        const responseText = extractResponse(result.stdout);
        if (responseText) {
          await supabase
            .from('messages')
            .insert({ conversation_id: conversationId, role: 'assistant', content: responseText });

          clearProcessing(conversationId);
          broadcast({ type: 'completed', conversationId, requestId, message: '完成' });
          return;
        }

        // 2. 提取页面信息和 Skill 信息
        const pageInfo = extractPageInfo(result.stdout, content.trim());
        const skillInfo = await extractAndSaveSkill(result.stdout);

        if (pageInfo) {
          // 检查该路由是否已有页面记录
          const { data: existingPage } = await supabase
            .from('interactive_pages')
            .select('id')
            .eq('route_path', pageInfo.routePath)
            .maybeSingle();

          if (existingPage) {
            // 已有页面：更新属性（如 public 状态）
            const updateData = { updated_at: new Date().toISOString() };
            if (pageInfo.isPublic !== undefined) updateData.is_public = pageInfo.isPublic;
            if (pageInfo.title) updateData.title = pageInfo.title;
            await supabase
              .from('interactive_pages')
              .update(updateData)
              .eq('id', existingPage.id);
          } else {
            // 新页面：插入记录
            await supabase
              .from('interactive_pages')
              .insert({
                conversation_id: conversationId,
                title: pageInfo.title,
                description: pageInfo.description,
                route_path: pageInfo.routePath,
                status: 'active',
                is_public: pageInfo.isPublic || false
              });
          }
        }

        // 3. 如果创建/修改了页面，重启应用并验证
        if (pageInfo) {
          broadcast({ type: 'processing', conversationId, requestId, message: '正在重启应用并验证...' });
          await verifyAppAfterChange(conversationId, requestId);
        }

        // 3.5 Git 自动提交代码变更
        if (pageInfo || skillInfo) {
          try {
            const gitResult = await commitChanges(`feat: ${content.trim().slice(0, 150)}`);
            if (gitResult.committed) console.log(`[Git] ${gitResult.commitHash}`);
          } catch (e) { console.error('[Git]', e.message); }
        }

        // 4. 保存助手回复（包含 Claude 的自然语言描述）
        const naturalText = extractNaturalText(result.stdout);
        const replyParts = [];
        if (naturalText) replyParts.push(naturalText);
        if (pageInfo) replyParts.push(`已创建交互页面「${pageInfo.title}」\n路由: ${pageInfo.routePath}`);
        if (skillInfo) replyParts.push(`已创建 Skill「${skillInfo.name}」\n${skillInfo.description}`);
        const reply = replyParts.length > 0 ? replyParts.join('\n\n') : '需求处理完成';

        await supabase
          .from('messages')
          .insert({ conversation_id: conversationId, role: 'assistant', content: reply });

        clearProcessing(conversationId);
        broadcast({ type: 'completed', conversationId, requestId, message: '完成', page: pageInfo, skill: skillInfo });
      } catch (error) {
        console.error('[Server] Claude Code 失败:', error);

        await supabase
          .from('messages')
          .insert({ conversation_id: conversationId, role: 'system', content: `失败: ${error.message}` });

        clearProcessing(conversationId);
        broadcast({ type: 'error', conversationId, requestId, message: error.message });
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 聊天文件上传 API ====================

const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
}).array('files', 10);

app.post('/api/conversations/:id/upload', (req, res) => {
  chatUpload(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, error: '文件大小超过 20MB 限制' });
      return res.status(400).json({ success: false, error: err.message });
    }

    const conversationId = req.params.id;
    if (!req.files || !req.files.length) {
      return res.status(400).json({ success: false, error: '未选择文件' });
    }

    try {
      const projectRoot = pathResolve(__dirname, '../..');
      const tempDir = pathResolve(projectRoot, 'app', 'temp', conversationId);
      await fsMkdir(tempDir, { recursive: true });

      const uploaded = [];
      for (const file of req.files) {
        const safeName = file.originalname.replace(/[/\\:*?"<>|]/g, '_');
        const finalName = `${Date.now()}-${safeName}`;
        await fsWriteFile(pathResolve(tempDir, finalName), file.buffer);

        uploaded.push({
          name: file.originalname,
          path: `app/temp/${conversationId}/${finalName}`,
          size: file.size,
          type: file.mimetype
        });
      }

      res.json({ success: true, data: uploaded });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
});

// ==================== 页面 API ====================

app.get('/api/pages', async (req, res) => {
  try {
    const data = await getAllPages();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/pages/active', async (req, res) => {
  try {
    const data = await getActivePages();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/pages/:id', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('interactive_pages').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 精选页 API ====================

app.get('/api/pages/featured', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('interactive_pages')
      .select('*, conversations(title)')
      .eq('is_featured', true)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/pages/:id/feature', async (req, res) => {
  try {
    const supabase = getSupabase();
    // 先取消所有精选
    await supabase.from('interactive_pages').update({ is_featured: false }).eq('is_featured', true);
    // 设置新精选
    const { error } = await supabase.from('interactive_pages').update({ is_featured: true }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/pages/:id/feature', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('interactive_pages').update({ is_featured: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 公开页面 API ====================

app.get('/api/pages/public-routes', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('interactive_pages')
      .select('route_path')
      .eq('is_public', true);
    if (error) throw error;
    res.json({ success: true, data: data.map(p => p.route_path) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/pages/:id/public', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('interactive_pages').update({ is_public: true, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/pages/:id/public', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('interactive_pages').update({ is_public: false, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 心跳 API（应用项目调用） ====================

app.post('/api/heartbeat', async (req, res) => {
  const { routePath } = req.body;
  if (!routePath) return res.status(400).json({ success: false, error: 'routePath 必填' });

  try {
    await registerHeartbeat(routePath);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 队列状态 API ====================

app.get('/api/queue/status', (req, res) => {
  res.json({
    success: true,
    data: {
      processing: getProcessingList(),
      queued: getQueuedList(),
      pending: requestQueue.size,
      running: requestQueue.pending
    }
  });
});

// 中断对话任务
app.post('/api/conversations/:id/cancel', async (req, res) => {
  const conversationId = req.params.id;

  // 1. 尝试终止正在运行的 Claude 进程
  const wasRunning = abortClaude(conversationId);

  // 2. 标记为已中断（如果任务还在队列中，执行时会跳过）
  abortedConversations.add(conversationId);

  // 3. 清理状态
  clearProcessing(conversationId);
  clearQueued(conversationId);

  // 4. 写入中断消息
  try {
    const supabase = getSupabase();
    await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, role: 'system', content: '任务已被用户中断' });
  } catch {}

  // 5. 广播中断事件
  broadcast({ type: 'cancelled', conversationId });

  res.json({ success: true, wasRunning });
});

// ==================== Skills API ====================

app.get('/api/skills', async (req, res) => {
  try {
    const data = await getSkills();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/skills/:name', async (req, res) => {
  try {
    const data = await getSkill(req.params.name);
    if (!data) return res.status(404).json({ success: false, error: 'Skill 不存在' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/skills', async (req, res) => {
  try {
    const { name, description, content } = req.body;
    if (!name || !description) return res.status(400).json({ success: false, error: 'name 和 description 必填' });
    const data = await createSkill(name, description, content || '');
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/skills/:name', async (req, res) => {
  try {
    const { description, content } = req.body;
    const data = await updateSkill(req.params.name, description, content);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/skills/:name', async (req, res) => {
  try {
    await deleteSkill(req.params.name);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== Git API ====================

app.get('/api/git/status', async (req, res) => {
  try {
    const data = await getGitStatus();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/git/commits', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const data = await getCommitHistory(limit);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/git/checkout', async (req, res) => {
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

app.get('/api/git/remote-config', (req, res) => {
  try {
    const data = getGitRemoteConfig();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/git/remote-config', async (req, res) => {
  try {
    const { repoUrl, token } = req.body;
    await updateGitRemoteConfig(repoUrl, token);
    res.json({ success: true, data: getGitRemoteConfig() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/git/push', async (req, res) => {
  try {
    await pushToRemote();
    res.json({ success: true, message: 'Push 成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 应用项目管理 API ====================

app.get('/api/app/status', async (req, res) => {
  try {
    res.json({ success: true, data: await getAppStatus() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/app/start', async (req, res) => {
  try {
    broadcast({ type: 'status', message: '正在启动应用项目...' });
    const result = await startAppProject();
    broadcast({ type: 'status', message: '应用项目已启动', appStatus: 'running' });
    res.json(result);
  } catch (error) {
    broadcast({ type: 'error', message: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/app/stop', async (req, res) => {
  try {
    const result = await stopAppProject();
    broadcast({ type: 'status', message: '应用项目已停止', appStatus: 'stopped' });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/app/restart', async (req, res) => {
  try {
    broadcast({ type: 'status', message: '正在重启应用项目...' });
    const result = await restartAppProject();
    broadcast({ type: 'status', message: '应用项目已重启', appStatus: 'running' });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/app/logs', async (req, res) => {
  try {
    const tail = Math.min(parseInt(req.query.tail) || 200, 500);
    const logs = await getAppLogs(tail);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/control/logs', async (req, res) => {
  try {
    const tail = Math.min(parseInt(req.query.tail) || 200, 500);
    const logs = await getControlLogs(tail);
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 文件管理 API ====================

const APP_CONTAINER = process.env.APP_CONTAINER_NAME || 'digital-avatar-app';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function dockerExecCmd(command) {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: 15000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout);
    });
  });
}

function safePath(p) {
  // 必须以 /app 开头，禁止 .. 遍历
  const normalized = ('/' + p).replace(/\/+/g, '/');
  if (normalized.includes('..') || !normalized.startsWith('/app')) return null;
  return normalized;
}

// 列出目录
app.get('/api/app/files', async (req, res) => {
  try {
    const dirPath = safePath(req.query.path || '/app');
    if (!dirPath) return res.status(400).json({ success: false, error: '非法路径' });

    // 用 ls -la（兼容 BusyBox/Alpine）
    const cmd = `docker exec ${APP_CONTAINER} sh -c "ls -la '${dirPath}' 2>&1"`;
    const output = await dockerExecCmd(cmd);
    const lines = output.split('\n').filter(l => l.trim() && !l.startsWith('total'));
    const items = [];
    for (const line of lines) {
      // BusyBox ls -la 格式: perms links owner group size month day time/year name
      const parts = line.split(/\s+/);
      if (parts.length < 8) continue;
      const perms = parts[0];
      const size = parseInt(parts[4]) || 0;
      const date = parts[5] + ' ' + parts[6] + ' ' + parts[7];
      const name = parts.slice(8).join(' ');
      if (name === '.' || name === '..') continue;
      items.push({
        name,
        type: perms.startsWith('d') ? 'directory' : perms.startsWith('l') ? 'link' : 'file',
        size,
        modified: date,
        permissions: perms
      });
    }
    // 目录在前，文件在后
    items.sort((a, b) => (a.type === 'directory' ? -1 : 1) - (b.type === 'directory' ? -1 : 1) || a.name.localeCompare(b.name));
    res.json({ success: true, data: items, path: dirPath });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 读取文件内容
app.get('/api/app/files/content', async (req, res) => {
  try {
    const filePath = safePath(req.query.path);
    if (!filePath) return res.status(400).json({ success: false, error: '非法路径' });

    // 先检查文件大小（wc -c 兼容 BusyBox）
    const sizeCmd = `docker exec ${APP_CONTAINER} sh -c "wc -c < '${filePath}' 2>/dev/null || echo -1"`;
    const sizeStr = (await dockerExecCmd(sizeCmd)).trim();
    const fileSize = parseInt(sizeStr);
    if (isNaN(fileSize)) return res.status(404).json({ success: false, error: '文件不存在' });
    if (fileSize > 512 * 1024) return res.status(400).json({ success: false, error: '文件过大（>512KB），不支持预览' });

    const cmd = `docker exec ${APP_CONTAINER} sh -c "cat '${filePath}'"`;
    const content = await dockerExecCmd(cmd);
    res.json({ success: true, data: { content, size: fileSize, path: filePath } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 上传文件
app.post('/api/app/files/upload', upload.single('file'), async (req, res) => {
  try {
    const dirPath = safePath(req.body.path || '/app');
    if (!dirPath) return res.status(400).json({ success: false, error: '非法路径' });
    if (!req.file) return res.status(400).json({ success: false, error: '未选择文件' });

    const fileName = req.file.originalname.replace(/['"\\]/g, '');
    const targetPath = dirPath.replace(/\/$/, '') + '/' + fileName;

    // 通过 stdin 传输文件内容到容器
    const base64 = req.file.buffer.toString('base64');
    const cmd = `docker exec -i ${APP_CONTAINER} sh -c "echo '${base64}' | base64 -d > '${targetPath}'"`;
    await dockerExecCmd(cmd);
    res.json({ success: true, path: targetPath });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 下载文件
app.get('/api/app/files/download', async (req, res) => {
  try {
    const filePath = safePath(req.query.path);
    if (!filePath) return res.status(400).json({ success: false, error: '非法路径' });

    const fileName = filePath.split('/').pop();
    const cmd = `docker exec ${APP_CONTAINER} sh -c "cat '${filePath}' | base64"`;
    const base64Data = (await dockerExecCmd(cmd)).replace(/\s/g, '');
    const buffer = Buffer.from(base64Data, 'base64');

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 删除文件/目录
app.delete('/api/app/files', async (req, res) => {
  try {
    const targetPath = safePath(req.query.path);
    if (!targetPath) return res.status(400).json({ success: false, error: '非法路径' });
    if (targetPath === '/app') return res.status(400).json({ success: false, error: '不能删除根目录' });

    const cmd = `docker exec ${APP_CONTAINER} sh -c "rm -rf '${targetPath}'"`;
    await dockerExecCmd(cmd);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 辅助函数 ====================

/**
 * 从 Claude 输出中提取自然语言描述（去掉结构化标记部分）
 */
function extractNaturalText(output) {
  let text = output;
  // 移除所有结构化标记
  text = text.replace(/\[PAGE_INFO\][\s\S]*?\[\/PAGE_INFO\]/g, '');
  text = text.replace(/\[SKILL_INFO\][\s\S]*?\[\/SKILL_INFO\]/g, '');
  text = text.replace(/\[RESPONSE\][\s\S]*?\[\/RESPONSE\]/g, '');
  text = text.replace(/\[FIX_RESULT\][\s\S]*?\[\/FIX_RESULT\]/g, '');
  text = text.trim();
  return text || null;
}

/**
 * 从 Claude 输出中提取简单回复 [RESPONSE]...[/RESPONSE]
 */
function extractResponse(output) {
  const match = output.match(/\[RESPONSE\]\s*\n?([\s\S]*?)\s*\[\/RESPONSE\]/);
  if (!match) return null;
  return match[1].trim();
}

/**
 * 重启应用容器并验证是否能正常启动，失败则调用 Claude Code 修复（最多重试 3 次）
 */
async function verifyAppAfterChange(conversationId, requestId) {
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[Verify] 第 ${attempt} 次验证应用启动...`);
    broadcast({ type: 'processing', conversationId, requestId, message: `正在验证应用 (${attempt}/${MAX_RETRIES})...` });

    try {
      await restartAppProject();
    } catch (e) {
      console.error('[Verify] 重启失败:', e.message);
    }

    // 等待应用启动
    await new Promise(r => setTimeout(r, 8000));

    // 检查应用状态
    const status = await getAppStatus();
    if (status.frontend.running && status.server.running) {
      console.log('[Verify] 应用正常运行');
      return true;
    }

    // 获取错误日志
    const errorLog = await getAppLogs(100);
    console.log(`[Verify] 应用启动失败，错误日志:\n${errorLog.slice(0, 500)}`);

    if (attempt >= MAX_RETRIES) {
      console.error('[Verify] 达到最大重试次数，放弃修复');
      broadcast({ type: 'processing', conversationId, requestId, message: '应用修复失败，请手动检查' });
      return false;
    }

    // 调用 Claude Code 修复
    broadcast({ type: 'processing', conversationId, requestId, message: `应用启动失败，正在自动修复 (${attempt}/${MAX_RETRIES})...` });
    try {
      const fixResult = await verifyAndFixApp(errorLog, conversationId);
      console.log('[Verify] 修复完成，准备重新验证...');

      // 修复后需要安装可能新增的依赖
      try {
        const { exec: execCb } = await import('child_process');
        await new Promise((resolve) => {
          execCb(
            `docker exec ${process.env.APP_CONTAINER_NAME || 'digital-avatar-app'} sh -c 'cd /app/server && pnpm install --silent 2>/dev/null; cd /app/frontend && pnpm install --silent 2>/dev/null'`,
            { timeout: 60000 },
            () => resolve()
          );
        });
      } catch {}
    } catch (e) {
      console.error('[Verify] 修复失败:', e.message);
    }
  }

  return false;
}

/**
 * 从 Claude 输出中提取 Skill 信息并自动保存
 */
async function extractAndSaveSkill(output) {
  const match = output.match(/\[SKILL_INFO\]\s*\n?\s*name:\s*(.+?)\s*\n\s*description:\s*(.+?)\s*\n\s*content:\s*([\s\S]*?)\s*\[\/SKILL_INFO\]/);
  if (!match) return null;

  const name = match[1].trim();
  const description = match[2].trim();
  const content = match[3].trim();

  // 自动保存 skill 文件
  try {
    await createSkill(name, description, content);
    console.log(`[Skills] 已自动创建 Skill: ${name}`);
  } catch (e) {
    console.error(`[Skills] 创建 Skill 失败: ${e.message}`);
  }

  return { name, description };
}

function extractPageInfo(output, requirement) {
  // 如果输出中没有 [PAGE_INFO] 标记，直接返回 null
  // 避免在 skill-only 请求中错误地生成页面信息
  const pageInfoMatch = output.match(/\[PAGE_INFO\]\s*\n?\s*route:\s*(\S+)\s*\n?\s*title:\s*(.+?)\s*\n?(?:\s*public:\s*(true|false)\s*\n?)?\s*\[\/PAGE_INFO\]/);
  if (pageInfoMatch) {
    return {
      title: pageInfoMatch[2].trim(),
      description: requirement.slice(0, 200),
      routePath: pageInfoMatch[1],
      isPublic: pageInfoMatch[3] === 'true'
    };
  }

  // 仅在输出中包含明确的路由创建证据时才尝试 fallback
  // 检查是否有 Vue 文件创建的证据
  const hasVueCreation = output.match(/created|Created|写入|创建.*\.vue/i);
  const hasRouteAdd = output.match(/routes.*push|routes.*\[|追加.*路由|添加.*路由/i);
  if (!hasVueCreation && !hasRouteAdd) return null;

  let routePath = null;
  let title = null;

  // 从路由代码中提取 path
  const routeMatch = output.match(/path:\s*['"](\/.+?)['"]/g);
  if (routeMatch) {
    const last = routeMatch[routeMatch.length - 1];
    const m = last.match(/path:\s*['"](\/.+?)['"]/);
    if (m) routePath = m[1];
  }

  // 从路由文件中直接读取最后添加的路由
  if (!routePath) {
    try {
      const routerFile = pathResolve(__dirname, '../../app/frontend/src/router/index.js');
      const routerContent = readFileSync(routerFile, 'utf8');
      const allPaths = [...routerContent.matchAll(/path:\s*['"](\/.+?)['"]/g)].map(m => m[1]);
      const nonHome = allPaths.filter(p => p !== '/');
      if (nonHome.length > 0) routePath = nonHome[nonHome.length - 1];
    } catch {}
  }

  if (!routePath) return null;

  if (!title) {
    const nameMatch = output.match(/name:\s*['"](.+?)['"]/);
    title = nameMatch ? nameMatch[1] : requirement.slice(0, 50);
  }

  return {
    title,
    description: requirement.slice(0, 200),
    routePath
  };
}

// ==================== 启动 ====================

// 日志流推送（每 3 秒轮询增量日志并广播）
let logStreamInterval = null;
function startLogStreaming() {
  if (logStreamInterval) return;
  logStreamInterval = setInterval(async () => {
    if (getClientCount() === 0) return;
    try {
      const [appLogs, controlLogs] = await Promise.all([
        getAppLogsSince(4),
        getControlLogsSince(4)
      ]);
      if (appLogs) broadcast({ type: 'app_logs', logs: appLogs });
      if (controlLogs) broadcast({ type: 'control_logs', logs: controlLogs });
    } catch {}
  }, 3000);
}

// ==================== 静态文件服务（生产模式） ====================
const distPath = pathResolve(__dirname, '../frontend/dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback: 非 API 路由返回 index.html
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(pathResolve(distPath, 'index.html'));
    }
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Control Server] http://localhost:${PORT}`);
  console.log(`[Control Server] WebSocket 已启动`);

  try { startHeartbeatChecker(); }
  catch (e) { console.warn('[Server] 心跳检测未启动（Supabase 未配置）'); }

  startLogStreaming();

  // 初始化 Git 仓库（应用代码版本管理）
  initGitRepo().catch(e => console.warn('[Server] Git 初始化失败:', e.message));
});
