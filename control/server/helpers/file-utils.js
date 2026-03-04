import { resolve as pathResolve } from 'path';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { rename as fsRename, mkdir as fsMkdir } from 'fs/promises';
import { createHash } from 'crypto';

/**
 * 根据文件扩展名猜测 MIME 类型
 */
export function guessMimeType(fileName) {
  const ext = (fileName.match(/\.([^.]+)$/) || [])[1]?.toLowerCase();
  const mimeMap = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
    pdf: 'application/pdf', zip: 'application/zip', json: 'application/json',
    txt: 'text/plain', csv: 'text/csv', html: 'text/html', css: 'text/css',
    js: 'application/javascript', xml: 'application/xml', md: 'text/markdown',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * 计算文件内容的短签名（md5 前 16 位，足以检测变化）
 */
function fileSignature(fullPath) {
  try {
    const buf = readFileSync(fullPath);
    return createHash('md5').update(buf).digest('hex').slice(0, 16);
  } catch {
    return '';
  }
}

/**
 * 递归收集目录下所有文件的相对路径及其内容签名
 * 返回 Map<relPath, signature>，用于后续检测新增和被修改的文件
 */
export function collectAllFiles(baseDir) {
  const result = new Map();
  function walk(dir, prefix) {
    try {
      const entries = readdirSync(dir);
      for (const name of entries) {
        const rel = prefix ? `${prefix}/${name}` : name;
        const full = pathResolve(dir, name);
        try {
          const stat = statSync(full);
          if (stat.isDirectory()) walk(full, rel);
          else if (stat.isFile()) result.set(rel, fileSignature(full));
        } catch {}
      }
    } catch {}
  }
  walk(baseDir, '');
  return result;
}

/**
 * 扫描 temp 目录中新增或被修改的文件
 * existingFiles 为 Map<relPath, signature>，通过比对签名检测变化
 */
export function scanNewFiles(tempDir, existingFiles, conversationId) {
  const files = [];
  try {
    if (!existsSync(tempDir)) return files;
    scanDir(tempDir, '');
  } catch (e) {
    console.warn('[scanNewFiles] 扫描失败:', e.message);
  }
  if (files.length > 0) {
    console.log(`[scanNewFiles] 发现 ${files.length} 个新增/修改文件:`, files.map(f => f.name).join(', '));
  }
  return files;

  function scanDir(dir, relPrefix) {
    const entries = readdirSync(dir);
    for (const name of entries) {
      const relName = relPrefix ? `${relPrefix}/${name}` : name;
      try {
        const fullPath = pathResolve(dir, name);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath, relName);
        } else if (stat.isFile()) {
          // 跳过执行前就已存在且内容未变的文件
          const oldSig = existingFiles.get(relName);
          if (oldSig !== undefined) {
            const newSig = fileSignature(fullPath);
            if (oldSig === newSig) continue; // 内容未变，跳过
          }
          files.push({
            name,
            path: `app/temp/${conversationId}/${relName}`,
            size: stat.size,
            type: guessMimeType(name)
          });
        }
      } catch {}
    }
  }
}

/**
 * 合并 extractFileInfo 和 scanNewFiles 的结果，按 path 去重
 */
export function mergeFileAttachments(tagFiles, scannedFiles) {
  if (scannedFiles.length === 0) return tagFiles;
  if (tagFiles.length === 0) return scannedFiles;
  const seen = new Set(tagFiles.map(f => f.path));
  const merged = [...tagFiles];
  for (const f of scannedFiles) {
    if (!seen.has(f.path)) {
      merged.push(f);
    }
  }
  return merged;
}

/**
 * 抢救被误放到 app/temp/ 根目录的文件（Claude 有时忽略 conversationId 子目录）
 */
export async function rescueMisplacedFiles(tempRootDir, tempDir, existingTempRootFiles, conversationId) {
  try {
    if (existsSync(tempRootDir)) {
      const afterRootFiles = readdirSync(tempRootDir);
      for (const name of afterRootFiles) {
        if (existingTempRootFiles.has(name)) continue; // 之前就有的，跳过
        const fullPath = pathResolve(tempRootDir, name);
        try {
          const stat = statSync(fullPath);
          if (!stat.isFile()) continue; // 只移动文件，不移动目录（子目录可能是其他对话的）
          const destPath = pathResolve(tempDir, name);
          await fsMkdir(tempDir, { recursive: true });
          await fsRename(fullPath, destPath);
          console.log(`[FileRescue] 移动误放文件: ${name} -> temp/${conversationId}/${name}`);
        } catch (e) {
          console.warn(`[FileRescue] 移动失败 ${name}:`, e.message);
        }
      }
    }
  } catch (e) {
    console.warn(`[FileRescue] 扫描失败:`, e.message);
  }
}

/**
 * 重启应用容器并验证是否能正常启动，失败则调用 Claude Code 修复（最多重试 3 次）
 */
export async function verifyAppAfterChange(conversationId, requestId, { broadcast, restartAppProject, getAppStatus, getAppLogs, verifyAndFixApp }) {
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
      await verifyAndFixApp(errorLog, conversationId);
      console.log('[Verify] 修复完成，准备重新验证...');

      // 修复后需要安装可能新增的依赖
      const { exec } = await import('child_process');
      await new Promise((resolve) => {
        exec(
          `docker exec ${process.env.APP_CONTAINER_NAME || 'digital-avatar-app'} sh -c 'cd /app/server && pnpm install --silent 2>/dev/null; cd /app/frontend && pnpm install --silent 2>/dev/null'`,
          { timeout: 60000 },
          () => resolve()
        );
      });
    } catch (e) {
      console.error('[Verify] 修复失败:', e.message);
    }
  }

  return false;
}
