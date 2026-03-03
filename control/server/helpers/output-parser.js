import { resolve as pathResolve, dirname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { createSkill } from '../modules/skills.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 从 Claude 输出中提取自然语言描述（去掉结构化标记部分）
 */
export function extractNaturalText(output) {
  let text = output;
  // 移除所有结构化标记
  text = text.replace(/\[PAGE_INFO\][\s\S]*?\[\/PAGE_INFO\]/g, '');
  text = text.replace(/\[SKILL_INFO\][\s\S]*?\[\/SKILL_INFO\]/g, '');
  text = text.replace(/\[RESPONSE\][\s\S]*?\[\/RESPONSE\]/g, '');
  text = text.replace(/\[FIX_RESULT\][\s\S]*?\[\/FIX_RESULT\]/g, '');
  text = text.replace(/\[FILE_INFO\][\s\S]*?\[\/FILE_INFO\]/g, '');
  text = text.trim();
  return text || null;
}

/**
 * 从 Claude 输出中提取简单回复 [RESPONSE]...[/RESPONSE]
 */
export function extractResponse(output) {
  const match = output.match(/\[RESPONSE\]\s*\n?([\s\S]*?)\s*\[\/RESPONSE\]/);
  if (!match) return null;
  return match[1].trim();
}

/**
 * 从 Claude 输出中提取文件信息 [FILE_INFO]...[/FILE_INFO]
 * 支持多个文件标记，兼容单行和多行格式
 */
export function extractFileInfo(output) {
  const files = [];
  // 先提取所有 [FILE_INFO]...[/FILE_INFO] 块
  const blockRegex = /\[FILE_INFO\]([\s\S]*?)\[\/FILE_INFO\]/g;
  let blockMatch;
  while ((blockMatch = blockRegex.exec(output)) !== null) {
    const block = blockMatch[1];
    const pathMatch = block.match(/path:\s*(\S+)/);
    const nameMatch = block.match(/name:\s*(.+?)(?:\s+type:|\s*$)/m);
    const typeMatch = block.match(/type:\s*(\S+)/);
    const sizeMatch = block.match(/size:\s*(\d+)/);

    if (!pathMatch || !nameMatch || !typeMatch || !sizeMatch) {
      console.warn(`[FileInfo] 标记格式不完整，跳过: ${block.trim().slice(0, 100)}`);
      continue;
    }

    const filePath = pathMatch[1].trim();
    const name = nameMatch[1].trim();
    const type = typeMatch[1].trim();
    const size = parseInt(sizeMatch[1], 10);

    // 安全校验：只允许 app/temp/ 下的文件
    if (!filePath.startsWith('app/temp/')) {
      console.warn(`[FileInfo] 跳过非法路径: ${filePath}`);
      continue;
    }

    const absPath = pathResolve(__dirname, '../../..', filePath);
    if (existsSync(absPath)) {
      files.push({ name, path: filePath, size, type });
    } else {
      console.warn(`[FileInfo] 文件不存在: ${absPath}`);
    }
  }
  return files;
}

/**
 * 从 Claude 输出中提取 Skill 信息并自动保存
 */
export async function extractAndSaveSkill(output) {
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

export function extractPageInfo(output, requirement) {
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
      const routerFile = pathResolve(__dirname, '../../../app/frontend/src/router/index.js');
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
