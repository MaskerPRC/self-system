import express from 'express';
import { resolve as pathResolve, dirname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { writeFile as fsWriteFile, mkdir as fsMkdir } from 'fs/promises';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { getSupabase } from '../modules/supabase.js';
import { callClaudeCode, verifyAndFixApp } from '../modules/claude.js';
import { restartAppProject, getAppStatus, getAppLogs } from '../modules/process.js';
import { commitChanges } from '../modules/git.js';
import { broadcast, markProcessing, clearProcessing, markQueued, clearQueued } from '../modules/websocket.js';
import { requestQueue, abortedConversations } from '../modules/queue.js';
import { extractNaturalText, extractResponse, extractFileInfo, extractAndSaveSkill, extractPageInfo, parseRoutePaths } from '../helpers/output-parser.js';
import { extractStructuredOutput, isOpenRouterConfigured } from '../modules/openrouter.js';
import { collectAllFiles, scanNewFiles, mergeFileAttachments, rescueMisplacedFiles, verifyAppAfterChange } from '../helpers/file-utils.js';
import { sqliteDb } from '../modules/sqlite.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// ==================== 项目 CRUD API ====================

router.get('/api/projects', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/projects', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { name, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: '项目名称不能为空' });
    }
    const { data, error } = await supabase
      .from('projects')
      .insert({ name: name.trim(), description: description || '' })
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/api/projects/:id', async (req, res) => {
  try {
    const supabase = getSupabase();
    const updateData = { updated_at: new Date().toISOString() };
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.canvas_state !== undefined) updateData.canvas_state = req.body.canvas_state;

    const { data, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/projects/:id', async (req, res) => {
  try {
    const supabase = getSupabase();
    const projectId = req.params.id;

    // 先删除项目下的所有节点
    await supabase
      .from('canvas_nodes')
      .delete()
      .eq('project_id', projectId);

    // 再删除项目
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);
    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== Canvas 节点 CRUD API ====================

router.get('/api/projects/:id/nodes', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('canvas_nodes')
      .select('*')
      .eq('project_id', req.params.id)
      .order('z_index', { ascending: true });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/projects/:id/nodes', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { type, content, x, y, width, height } = req.body;
    if (!type) {
      return res.status(400).json({ success: false, error: '节点类型不能为空' });
    }

    const { data, error } = await supabase
      .from('canvas_nodes')
      .insert({
        project_id: req.params.id,
        type,
        content: content || {},
        x: x || 0,
        y: y || 0,
        width: width || 200,
        height: height || 150,
        z_index: 0
      })
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// IMPORTANT: batch routes must be defined BEFORE :nodeId routes to avoid "batch" being captured as a nodeId

router.patch('/api/projects/:id/nodes/batch', async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, error: '更新列表不能为空' });
    }

    const projectId = req.params.id;
    const now = new Date().toISOString();

    const batchUpdate = sqliteDb.transaction((items) => {
      for (const item of items) {
        const sets = [];
        const vals = [];
        if (item.x !== undefined) { sets.push('x = ?'); vals.push(item.x); }
        if (item.y !== undefined) { sets.push('y = ?'); vals.push(item.y); }
        if (item.width !== undefined) { sets.push('width = ?'); vals.push(item.width); }
        if (item.height !== undefined) { sets.push('height = ?'); vals.push(item.height); }
        if (sets.length === 0) continue;
        sets.push('updated_at = ?');
        vals.push(now, item.id, projectId);
        sqliteDb.prepare(
          `UPDATE canvas_nodes SET ${sets.join(', ')} WHERE id = ? AND project_id = ?`
        ).run(...vals);
      }
    });

    batchUpdate(updates);

    // Fetch updated nodes
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('canvas_nodes')
      .select('*')
      .eq('project_id', projectId)
      .order('z_index', { ascending: true });
    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/projects/:id/nodes/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '删除列表不能为空' });
    }

    const projectId = req.params.id;
    const placeholders = ids.map(() => '?').join(', ');
    sqliteDb.prepare(
      `DELETE FROM canvas_nodes WHERE id IN (${placeholders}) AND project_id = ?`
    ).run(...ids, projectId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/api/projects/:id/nodes/:nodeId', async (req, res) => {
  try {
    const supabase = getSupabase();
    const updateData = { updated_at: new Date().toISOString() };
    const allowedFields = ['x', 'y', 'width', 'height', 'content', 'z_index', 'type'];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    }

    const { data, error } = await supabase
      .from('canvas_nodes')
      .update(updateData)
      .eq('id', req.params.nodeId)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/projects/:id/nodes/:nodeId', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('canvas_nodes')
      .delete()
      .eq('id', req.params.nodeId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== Canvas 文件上传 API ====================

const canvasUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
}).array('files', 10);

router.post('/api/projects/:id/upload', (req, res) => {
  canvasUpload(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, error: '文件大小超过 50MB 限制' });
      if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ success: false, error: '最多同时上传 10 个文件' });
      return res.status(400).json({ success: false, error: err.message });
    }

    const projectId = req.params.id;
    if (!req.files || !req.files.length) {
      return res.status(400).json({ success: false, error: '未选择文件' });
    }

    try {
      const projectRoot = pathResolve(__dirname, '../../..');
      const uploadDir = pathResolve(projectRoot, 'data', 'canvas', projectId);
      await fsMkdir(uploadDir, { recursive: true });

      const uploaded = [];
      for (const file of req.files) {
        // multer 使用 latin1 解码文件名，需要转回 UTF-8
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        // 安全文件名：去掉特殊字符，保留扩展名
        const sanitized = originalName.replace(/[^a-zA-Z0-9._\u4e00-\u9fff-]/g, '_');
        const finalName = `${Date.now()}-${sanitized}`;
        await fsWriteFile(pathResolve(uploadDir, finalName), file.buffer);

        uploaded.push({
          name: originalName,
          path: `data/canvas/${projectId}/${finalName}`,
          size: file.size,
          type: file.mimetype,
          url: `/api/canvas/files/${projectId}/${finalName}`
        });
      }

      res.json({ success: true, data: uploaded });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
});

router.get('/api/canvas/files/:projectId/:filename', (req, res) => {
  const { projectId, filename } = req.params;

  if (!filename || filename.includes('..')) {
    return res.status(400).json({ success: false, error: '非法文件名' });
  }

  const projectRoot = pathResolve(__dirname, '../../..');
  const filePath = pathResolve(projectRoot, 'data', 'canvas', projectId, filename);
  const expectedDir = pathResolve(projectRoot, 'data', 'canvas', projectId);

  // 路径遍历保护
  if (!filePath.startsWith(expectedDir) || !existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '文件不存在' });
  }

  res.sendFile(filePath);
});

// ==================== Canvas AI 请求 API ====================

router.post('/api/projects/:id/request', async (req, res) => {
  const { prompt, contextNodeIds, requestNodeX, requestNodeY } = req.body;
  const projectId = req.params.id;

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ success: false, error: '请求内容不能为空' });
  }

  try {
    const supabase = getSupabase();

    // 1. 获取上下文节点
    let contextNodes = [];
    if (contextNodeIds && contextNodeIds.length > 0) {
      const { data: nodes, error: nodesError } = await supabase
        .from('canvas_nodes')
        .select('*')
        .eq('project_id', projectId);
      if (nodesError) throw nodesError;
      // 按 contextNodeIds 顺序过滤
      const nodeMap = new Map((nodes || []).map(n => [n.id, n]));
      contextNodes = contextNodeIds
        .map(id => nodeMap.get(id))
        .filter(Boolean);
    }

    // 2. 构建上下文字符串
    const contextParts = contextNodes.map(node => {
      const content = node.content || {};
      switch (node.type) {
        case 'text':
          return content.text || '';
        case 'image':
          return `[Image: ${content.name || 'unnamed'}]`;
        case 'file':
          return `[File: ${content.name || 'unnamed'}]`;
        case 'iframe':
          return `[App Page: ${content.route || content.url || 'unknown'}]`;
        case 'request':
          return `[Previous request: ${content.prompt || ''}]`;
        default:
          return '';
      }
    }).filter(Boolean);

    const contextString = contextParts.length > 0
      ? `Context from canvas:\n${contextParts.join('\n')}\n\nUser request: ${prompt.trim()}`
      : prompt.trim();

    // 3. 创建对话
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({ title: prompt.trim().slice(0, 30) + (prompt.trim().length > 30 ? '...' : '') })
      .select()
      .single();
    if (convError) throw convError;

    const conversationId = conversation.id;

    // 4. 保存用户消息
    const { error: msgError } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, role: 'user', content: contextString });
    if (msgError) throw msgError;

    // 5. 创建 request 类型的 canvas 节点
    const requestContent = {
      prompt: prompt.trim(),
      status: 'processing',
      conversationId
    };

    const { data: requestNode, error: nodeError } = await supabase
      .from('canvas_nodes')
      .insert({
        project_id: projectId,
        type: 'request',
        content: requestContent,
        x: requestNodeX || 0,
        y: requestNodeY || 0,
        width: 320,
        height: 200,
        z_index: 0
      })
      .select()
      .single();
    if (nodeError) throw nodeError;

    // 6. 立即返回响应
    res.json({
      success: true,
      data: {
        requestNodeId: requestNode.id,
        conversationId
      }
    });

    // 7. 异步入队执行 Claude Code
    const requestId = Date.now().toString();

    if (requestQueue.size > 0 || requestQueue.pending > 0) {
      markQueued(conversationId);
      broadcast({ type: 'queued', conversationId, requestId });
    }

    requestQueue.add(async () => {
      if (abortedConversations.has(conversationId)) {
        abortedConversations.delete(conversationId);
        clearQueued(conversationId);
        return;
      }

      try {
        markProcessing(conversationId);
        broadcast({ type: 'processing', conversationId, requestId, message: '正在处理需求...' });

        // 获取对话历史
        let history = [];
        try {
          const { data: historyData } = await supabase
            .from('messages')
            .select('role, content')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });
          if (historyData) {
            history = historyData.filter(m => m.role !== 'system').slice(-20);
          }
        } catch {}

        // 快照当前路由文件
        const routerFilePath = pathResolve(__dirname, '../../../app/frontend/src/router/index.js');
        let beforeRoutes = [];
        try {
          if (existsSync(routerFilePath)) {
            beforeRoutes = parseRoutePaths(readFileSync(routerFilePath, 'utf8'));
          }
        } catch {}

        // 执行 Claude Code
        const result = await callClaudeCode(contextString, conversationId, history);

        // 检测新路由
        let newRoutes = [];
        try {
          const afterRoutes = parseRoutePaths(readFileSync(routerFilePath, 'utf8'));
          const beforePaths = new Set(beforeRoutes.map(r => r.path));
          newRoutes = afterRoutes.filter(r => !beforePaths.has(r.path));
          if (newRoutes.length > 0) {
            console.log(`[Canvas] 检测到新路由: ${newRoutes.map(r => r.path).join(', ')}`);
          }
        } catch {}

        // Gemini 结构化提取
        let structuredOutput = null;
        if (isOpenRouterConfigured()) {
          broadcast({ type: 'processing', conversationId, requestId, message: '正在提取结构化信息...' });
          structuredOutput = await extractStructuredOutput({
            requirement: prompt.trim(),
            claudeOutput: result.stdout,
            newRoutes,
            newFiles: [],
            hasCodeChanges: newRoutes.length > 0
          });
        }

        const parseSource = structuredOutput || result.stdout;

        // 提取 Skill 信息
        const skillInfos = await extractAndSaveSkill(parseSource);

        // 提取页面信息
        let pageInfos = extractPageInfo(parseSource, prompt.trim());
        if (!pageInfos && newRoutes.length > 0) {
          pageInfos = newRoutes.map(r => ({
            title: r.name.replace(/([A-Z])/g, ' $1').trim(),
            description: prompt.trim().slice(0, 200),
            routePath: r.path,
            isPublic: false
          }));
        }

        // 注册页面到 interactive_pages
        if (pageInfos) {
          for (const pageInfo of pageInfos) {
            const { data: existingPage } = await supabase
              .from('interactive_pages')
              .select('id')
              .eq('route_path', pageInfo.routePath)
              .maybeSingle();

            if (existingPage) {
              const updateData = { updated_at: new Date().toISOString() };
              if (pageInfo.isPublic !== undefined) updateData.is_public = pageInfo.isPublic;
              if (pageInfo.title) updateData.title = pageInfo.title;
              await supabase
                .from('interactive_pages')
                .update(updateData)
                .eq('id', existingPage.id);
            } else {
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
        }

        // 重启应用并验证
        if (pageInfos) {
          broadcast({ type: 'processing', conversationId, requestId, message: '正在重启应用并验证...' });
          await verifyAppAfterChange(conversationId, requestId, { broadcast, restartAppProject, getAppStatus, getAppLogs, verifyAndFixApp });
        }

        // Git 提交
        if (pageInfos || skillInfos) {
          try {
            const gitResult = await commitChanges(`feat: ${prompt.trim().slice(0, 150)}`);
            if (gitResult.committed) console.log(`[Canvas Git] ${gitResult.commitHash}`);
          } catch (e) { console.error('[Canvas Git]', e.message); }
        }

        // 更新 request 节点状态为完成
        const updatedContent = { ...requestContent, status: 'completed' };
        const naturalText = extractNaturalText(result.stdout);
        if (naturalText) updatedContent.response = naturalText;

        const { data: updatedNode } = await supabase
          .from('canvas_nodes')
          .update({ content: updatedContent, updated_at: new Date().toISOString() })
          .eq('id', requestNode.id)
          .select()
          .single();

        broadcast({ type: 'canvas_node_updated', projectId, node: updatedNode });

        // 为每个新页面创建 iframe 节点
        if (pageInfos) {
          for (let i = 0; i < pageInfos.length; i++) {
            const pageInfo = pageInfos[i];
            const iframeContent = {
              title: pageInfo.title,
              route: pageInfo.routePath,
              description: pageInfo.description || ''
            };

            const { data: iframeNode, error: iframeError } = await supabase
              .from('canvas_nodes')
              .insert({
                project_id: projectId,
                type: 'iframe',
                content: iframeContent,
                x: (requestNodeX || 0) + 420 * (i + 1),
                y: requestNodeY || 0,
                width: 380,
                height: 300,
                z_index: 0
              })
              .select()
              .single();

            if (!iframeError && iframeNode) {
              broadcast({ type: 'canvas_node_created', projectId, node: iframeNode });
            }
          }
        }

        // 保存助手回复消息
        const reply = naturalText || '需求处理完成';
        const fileAttachments = extractFileInfo(parseSource);
        const allAttachments = [...fileAttachments];
        if (pageInfos) pageInfos.forEach(p => allAttachments.push({ type: 'page_created', name: p.title, route: p.routePath }));
        if (skillInfos) skillInfos.forEach(s => allAttachments.push({ type: 'skill_created', name: s.name, description: s.description }));

        const assistantInsert = { conversation_id: conversationId, role: 'assistant', content: reply };
        if (allAttachments.length > 0) assistantInsert.attachments = allAttachments;
        await supabase.from('messages').insert(assistantInsert);

        clearProcessing(conversationId);
        broadcast({ type: 'completed', conversationId, requestId, message: '完成', pages: pageInfos, skill: skillInfos });

      } catch (error) {
        console.error('[Canvas] Claude Code 失败:', error);

        // 更新 request 节点状态为 error
        try {
          const errorContent = { ...requestContent, status: 'error', error: error.message };
          const { data: errorNode } = await supabase
            .from('canvas_nodes')
            .update({ content: errorContent, updated_at: new Date().toISOString() })
            .eq('id', requestNode.id)
            .select()
            .single();
          broadcast({ type: 'canvas_node_updated', projectId, node: errorNode });
        } catch {}

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

export default router;
