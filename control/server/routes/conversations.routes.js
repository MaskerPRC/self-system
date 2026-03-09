import express from 'express';
import { resolve as pathResolve, dirname } from 'path';
import { readFileSync, existsSync, readdirSync, statSync, chownSync } from 'fs';
import { writeFile as fsWriteFile, mkdir as fsMkdir, rm as fsRm } from 'fs/promises';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { getSupabase } from '../modules/supabase.js';
import { callClaudeCode, verifyAndFixApp, abortClaude } from '../modules/claude.js';
import { restartAppProject, getAppStatus, getAppLogs } from '../modules/process.js';
import { commitChanges } from '../modules/git.js';
import { broadcast, markProcessing, clearProcessing, markQueued, clearQueued, getProcessingList, getQueuedList } from '../modules/websocket.js';
import { requestQueue, abortedConversations } from '../modules/queue.js';
import { extractNaturalText, extractResponse, extractFileInfo, extractAndSaveSkill, extractPageInfo, parseRoutePaths } from '../helpers/output-parser.js';
import { extractStructuredOutput, isOpenRouterConfigured } from '../modules/openrouter.js';
import { collectAllFiles, scanNewFiles, mergeFileAttachments, rescueMisplacedFiles, verifyAppAfterChange } from '../helpers/file-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// ==================== 对话 API ====================

router.get('/api/conversations', async (req, res) => {
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

router.post('/api/conversations', async (req, res) => {
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

router.patch('/api/conversations/:id', async (req, res) => {
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

router.delete('/api/conversations/:id', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;

    // 清理该对话的临时文件
    const tempDir = pathResolve(__dirname, '../../../app/temp', req.params.id);
    try { await fsRm(tempDir, { recursive: true, force: true }); } catch {}

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 消息 API ====================

router.get('/api/conversations/:id/messages', async (req, res) => {
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
router.post('/api/conversations/:id/messages', async (req, res) => {
  const { content, attachments, targetApps, targetSkills } = req.body;
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

        // 记录 Claude 执行前 temp 目录中已有的文件（递归，用于后续检测新生成的文件）
        const tempDir = pathResolve(__dirname, '../../../app/temp', conversationId);
        const tempRootDir = pathResolve(__dirname, '../../../app/temp');
        let existingTempFiles = new Map();
        let existingTempRootFiles = new Set();
        try {
          if (existsSync(tempDir)) existingTempFiles = collectAllFiles(tempDir);
        } catch {}
        // 记录 temp 根目录已有文件，用于检测被误放到根目录的文件
        try {
          if (existsSync(tempRootDir)) existingTempRootFiles = new Set(readdirSync(tempRootDir));
        } catch {}

        // 快照当前路由文件，用于后续检测新增路由
        const routerFilePath = pathResolve(__dirname, '../../../app/frontend/src/router/index.js');
        let beforeRoutes = [];
        try {
          if (existsSync(routerFilePath)) {
            beforeRoutes = parseRoutePaths(readFileSync(routerFilePath, 'utf8'));
          }
        } catch {}

        const result = await callClaudeCode(msgContent || '请查看我上传的文件', conversationId, history, attachments, targetApps, targetSkills);

        // 抢救被误放到 app/temp/ 根目录的文件
        await rescueMisplacedFiles(tempRootDir, tempDir, existingTempRootFiles, conversationId);

        // 调试：检查 Claude 运行后 temp 目录的变化
        try {
          if (existsSync(tempDir)) {
            const afterFiles = readdirSync(tempDir);
            const newFiles = afterFiles.filter(f => !existingTempFiles.has(f));
            console.log(`[FileDebug] temp 目录 ${tempDir}: 之前 ${existingTempFiles.size} 个文件, 之后 ${afterFiles.length} 个文件, 新增 ${newFiles.length} 个: ${newFiles.join(', ')}`);
          } else {
            console.log(`[FileDebug] 目录不存在: ${tempDir}`);
          }
        } catch (e) {
          console.log(`[FileDebug] 扫描失败: ${e.message}`);
        }

        // ===== 检测路由变化（用于 Gemini 二次处理） =====
        let newRoutes = [];
        try {
          const afterRoutes = parseRoutePaths(readFileSync(routerFilePath, 'utf8'));
          const beforePaths = new Set(beforeRoutes.map(r => r.path));
          newRoutes = afterRoutes.filter(r => !beforePaths.has(r.path));
          if (newRoutes.length > 0) {
            console.log(`[RouteDetect] 检测到新路由: ${newRoutes.map(r => r.path).join(', ')}`);
          }
        } catch {}

        // ===== 扫描新生成文件 =====
        const scannedFiles = scanNewFiles(tempDir, existingTempFiles, conversationId);

        // ===== 第二轮：Gemini 结构化提取 =====
        let structuredOutput = null;
        if (isOpenRouterConfigured()) {
          broadcast({ type: 'processing', conversationId, requestId, message: '正在提取结构化信息...' });
          structuredOutput = await extractStructuredOutput({
            requirement: msgContent || '请查看我上传的文件',
            claudeOutput: result.stdout,
            newRoutes,
            newFiles: scannedFiles,
            hasCodeChanges: newRoutes.length > 0 || scannedFiles.length > 0
          });
        }

        // 优先使用 Gemini 的结构化输出，否则回退到 Claude Code 自身的输出
        const parseSource = structuredOutput || result.stdout;

        // 1. 提取 Skill 信息
        const skillInfos = await extractAndSaveSkill(parseSource);

        // 2. 检查是否为简单回复 [RESPONSE]
        const responseText = extractResponse(parseSource);
        if (responseText) {
          let responseFiles = extractFileInfo(parseSource);
          responseFiles = mergeFileAttachments(responseFiles, scannedFiles);
          const responseAttachments = [...responseFiles];
          if (skillInfos) skillInfos.forEach(s => responseAttachments.push({ type: 'skill_created', name: s.name, description: s.description }));
          const insertData = { conversation_id: conversationId, role: 'assistant', content: responseText };
          if (responseAttachments.length > 0) insertData.attachments = responseAttachments;

          await supabase.from('messages').insert(insertData);

          clearProcessing(conversationId);
          broadcast({ type: 'completed', conversationId, requestId, message: '完成', skill: skillInfos });
          return;
        }

        // 3. 提取页面信息（支持多个，优先从 Gemini 结构化输出，其次路由 diff 自动检测）
        let pageInfos = extractPageInfo(parseSource, content?.trim() || '');

        if (!pageInfos && newRoutes.length > 0) {
          pageInfos = newRoutes.map(r => ({
            title: r.name.replace(/([A-Z])/g, ' $1').trim(),
            description: content?.trim().slice(0, 200) || '',
            routePath: r.path,
            isPublic: false
          }));
          console.log(`[PageDetect] 路由 diff 兜底: ${newRoutes.map(r => r.path).join(', ')}`);
        }

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

        // 3.5 Git 自动提交代码变更
        if (pageInfos || skillInfos) {
          try {
            const gitResult = await commitChanges(`feat: ${content.trim().slice(0, 150)}`);
            if (gitResult.committed) console.log(`[Git] ${gitResult.commitHash}`);
          } catch (e) { console.error('[Git]', e.message); }
        }

        // 4. 保存助手回复（使用 Claude Code 的自然语言描述作为正文）
        const naturalText = extractNaturalText(result.stdout);
        let fileAttachments = extractFileInfo(parseSource);
        fileAttachments = mergeFileAttachments(fileAttachments, scannedFiles);
        const reply = naturalText || '需求处理完成';

        const allAttachments = [...fileAttachments];
        if (pageInfos) pageInfos.forEach(p => allAttachments.push({ type: 'page_created', name: p.title, route: p.routePath }));
        if (skillInfos) skillInfos.forEach(s => allAttachments.push({ type: 'skill_created', name: s.name, description: s.description }));

        const assistantInsert = { conversation_id: conversationId, role: 'assistant', content: reply };
        if (allAttachments.length > 0) assistantInsert.attachments = allAttachments;

        await supabase.from('messages').insert(assistantInsert);

        clearProcessing(conversationId);
        broadcast({ type: 'completed', conversationId, requestId, message: '完成', pages: pageInfos, skill: skillInfos });
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
  limits: { fileSize: 50 * 1024 * 1024 }
}).array('files', 10);

router.post('/api/conversations/:id/upload', (req, res) => {
  chatUpload(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, error: '文件大小超过 50MB 限制' });
      return res.status(400).json({ success: false, error: err.message });
    }

    const conversationId = req.params.id;
    if (!req.files || !req.files.length) {
      return res.status(400).json({ success: false, error: '未选择文件' });
    }

    try {
      const projectRoot = pathResolve(__dirname, '../../..');
      const tempDir = pathResolve(projectRoot, 'app', 'temp', conversationId);
      await fsMkdir(tempDir, { recursive: true });
      // chown 给 claude 用户，确保 Claude Code 进程可写入
      try {
        const uid = parseInt(execSync('id -u claude', { encoding: 'utf-8', shell: '/bin/sh' }).trim());
        const gid = parseInt(execSync('id -g claude', { encoding: 'utf-8', shell: '/bin/sh' }).trim());
        chownSync(tempDir, uid, gid);
      } catch {}

      const uploaded = [];
      for (const file of req.files) {
        // multer 使用 latin1 解码 Content-Disposition 中的文件名，需要转回 UTF-8
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        // 提取扩展名，磁盘文件名使用纯 ASCII 避免中文编码问题
        const ext = originalName.includes('.') ? '.' + originalName.split('.').pop() : '';
        const finalName = `${Date.now()}-upload${ext}`;
        await fsWriteFile(pathResolve(tempDir, finalName), file.buffer);

        uploaded.push({
          name: originalName,
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

// 读取对话的 TODO 进度文件
router.get('/api/conversations/:id/todo', (req, res) => {
  const projectRoot = pathResolve(__dirname, '../../..');
  const todoPath = pathResolve(projectRoot, 'app', 'temp', req.params.id, '.TODO.md');
  if (!existsSync(todoPath)) return res.json({ success: true, content: null });
  try {
    const content = readFileSync(todoPath, 'utf8');
    res.json({ success: true, content });
  } catch {
    res.json({ success: true, content: null });
  }
});

// 聊天文件下载（用户上传 + 助手生成的附件）
router.get('/api/conversations/:id/files/download', (req, res) => {
  const conversationId = req.params.id;
  const fileName = req.query.name;

  if (!fileName || fileName.includes('..')) {
    return res.status(400).json({ success: false, error: '非法文件名' });
  }

  const projectRoot = pathResolve(__dirname, '../../..');
  const filePath = pathResolve(projectRoot, 'app', 'temp', conversationId, fileName);
  const expectedDir = pathResolve(projectRoot, 'app', 'temp', conversationId);

  if (!filePath.startsWith(expectedDir) || !existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '文件不存在' });
  }

  const baseName = fileName.split('/').pop() || fileName;
  res.download(filePath, baseName);
});

// 聊天文件预览（inline 展示图片/视频/音频）
router.get('/api/conversations/:id/files/preview', (req, res) => {
  const conversationId = req.params.id;
  const fileName = req.query.name;

  if (!fileName || fileName.includes('..')) {
    return res.status(400).json({ success: false, error: '非法文件名' });
  }

  const projectRoot = pathResolve(__dirname, '../../..');
  const filePath = pathResolve(projectRoot, 'app', 'temp', conversationId, fileName);
  const expectedDir = pathResolve(projectRoot, 'app', 'temp', conversationId);

  if (!filePath.startsWith(expectedDir) || !existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '文件不存在' });
  }

  res.sendFile(filePath);
});

// ==================== 队列状态 API ====================

router.get('/api/queue/status', (req, res) => {
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
router.post('/api/conversations/:id/cancel', async (req, res) => {
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

export default router;
