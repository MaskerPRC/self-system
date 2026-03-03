import express from 'express';
import { resolve as pathResolve, dirname } from 'path';
import { existsSync } from 'fs';
import { exec } from 'child_process';
import multer from 'multer';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const APP_CONTAINER = process.env.APP_CONTAINER_NAME || 'digital-avatar-app';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function dockerExecCmd(command, maxBuffer = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: 15000, maxBuffer }, (error, stdout, stderr) => {
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
router.get('/api/app/files', async (req, res) => {
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
router.get('/api/app/files/content', async (req, res) => {
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
router.post('/api/app/files/upload', upload.single('file'), async (req, res) => {
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
router.get('/api/app/files/download', async (req, res) => {
  try {
    const filePath = safePath(req.query.path);
    if (!filePath) return res.status(400).json({ success: false, error: '非法路径' });

    const fileName = filePath.split('/').pop();

    // 优先从本地文件系统直接读取（性能更好，无大小限制）
    const projectRoot = pathResolve(__dirname, '../../..');
    const localPath = pathResolve(projectRoot, filePath.slice(1)); // 去掉开头的 /
    if (localPath.startsWith(pathResolve(projectRoot, 'app')) && existsSync(localPath)) {
      return res.download(localPath, fileName);
    }

    // 回退：通过 Docker exec 读取
    const cmd = `docker exec ${APP_CONTAINER} sh -c "cat '${filePath}' | base64"`;
    const base64Data = (await dockerExecCmd(cmd, 50 * 1024 * 1024)).replace(/\s/g, '');
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
router.delete('/api/app/files', async (req, res) => {
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

export default router;
