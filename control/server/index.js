import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { setupWebSocket, broadcast } from './modules/websocket.js';
import { getSupabase } from './modules/supabase.js';
import { callClaudeCode } from './modules/claude.js';
import { startAppProject, stopAppProject, restartAppProject, getAppStatus } from './modules/process.js';
import { registerHeartbeat, getAllPages, getActivePages, startHeartbeatChecker } from './modules/heartbeat.js';
import PQueue from 'p-queue';

const app = express();
const server = createServer(app);
const PORT = 3000;

const requestQueue = new PQueue({ concurrency: 1 });

app.use(cors());
app.use(express.json());

setupWebSocket(server);

// ==================== 健康检查 ====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
  const { content } = req.body;
  const conversationId = req.params.id;

  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, error: '消息不能为空' });
  }

  try {
    const supabase = getSupabase();

    // 保存用户消息
    const { data: userMsg, error: userError } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, role: 'user', content: content.trim() })
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

    // 异步执行 Claude Code
    requestQueue.add(async () => {
      try {
        broadcast({ type: 'processing', conversationId, requestId, message: '正在处理需求...' });

        const result = await callClaudeCode(content.trim(), conversationId);

        // 从输出中提取页面信息
        const pageInfo = extractPageInfo(result.stdout, content.trim());

        if (pageInfo) {
          await supabase
            .from('interactive_pages')
            .insert({
              conversation_id: conversationId,
              title: pageInfo.title,
              description: pageInfo.description,
              route_path: pageInfo.routePath,
              status: 'active'
            });
        }

        // 保存助手回复
        const reply = pageInfo
          ? `已创建交互页面「${pageInfo.title}」\n路由: ${pageInfo.routePath}`
          : '需求处理完成';

        await supabase
          .from('messages')
          .insert({ conversation_id: conversationId, role: 'assistant', content: reply });

        broadcast({ type: 'completed', conversationId, requestId, message: '完成', page: pageInfo });
      } catch (error) {
        console.error('[Server] Claude Code 失败:', error);

        await supabase
          .from('messages')
          .insert({ conversation_id: conversationId, role: 'system', content: `失败: ${error.message}` });

        broadcast({ type: 'error', conversationId, requestId, message: error.message });
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
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

// ==================== 辅助函数 ====================

function extractPageInfo(output, requirement) {
  // 尝试从 Claude 输出中提取路由 path
  const routeMatch = output.match(/path:\s*['"](\/.+?)['"]/);
  const routePath = routeMatch ? routeMatch[1] : null;

  if (!routePath) {
    // 无法提取则根据需求生成 slug
    const slug = requirement
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join('-')
      .toLowerCase();
    if (!slug) return null;

    return {
      title: requirement.slice(0, 50),
      description: requirement.slice(0, 200),
      routePath: `/${slug}-${Date.now().toString(36)}`
    };
  }

  const nameMatch = output.match(/name:\s*['"](.+?)['"]/);
  return {
    title: nameMatch ? nameMatch[1] : requirement.slice(0, 50),
    description: requirement.slice(0, 200),
    routePath
  };
}

// ==================== 启动 ====================

server.listen(PORT, () => {
  console.log(`[Control Server] http://localhost:${PORT}`);
  console.log(`[Control Server] WebSocket 已启动`);

  try { startHeartbeatChecker(); }
  catch (e) { console.warn('[Server] 心跳检测未启动（Supabase 未配置）'); }
});
