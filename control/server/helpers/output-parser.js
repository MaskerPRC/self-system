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
 * 从 Claude 输出中提取 Skill 信息并自动保存（支持多个）
 */
export async function extractAndSaveSkill(output) {
  const regex = /\[SKILL_INFO\]\s*\n?\s*name:\s*(.+?)\s*\n\s*description:\s*(.+?)\s*\n\s*content:\s*([\s\S]*?)\s*\[\/SKILL_INFO\]/g;
  const skills = [];
  let match;

  while ((match = regex.exec(output)) !== null) {
    const name = match[1].trim();
    const description = match[2].trim();
    const content = match[3].trim();

    try {
      await createSkill(name, description, content);
      console.log(`[Skills] 已自动创建 Skill: ${name}`);
    } catch (e) {
      console.error(`[Skills] 创建 Skill 失败 (${name}): ${e.message}`);
    }

    skills.push({ name, description });
  }

  return skills.length > 0 ? skills : null;
}

export function extractPageInfo(output, requirement) {
  const regex = /\[PAGE_INFO\]\s*\n?\s*route:\s*(\S+)\s*\n?\s*title:\s*(.+?)\s*\n?(?:\s*public:\s*(true|false)\s*\n?)?\s*\[\/PAGE_INFO\]/g;
  const pages = [];
  let match;
  while ((match = regex.exec(output)) !== null) {
    pages.push({
      title: match[2].trim(),
      description: requirement.slice(0, 200),
      routePath: match[1],
      isPublic: match[3] === 'true'
    });
  }
  return pages.length > 0 ? pages : null;
}

/**
 * 解析路由文件内容，提取所有路由的 path 和 name
 */
export function parseRoutePaths(routerContent) {
  const routes = [];
  const regex = /\{\s*path:\s*['"](\/.+?)['"]\s*,\s*name:\s*['"](.+?)['"]/g;
  let match;
  while ((match = regex.exec(routerContent)) !== null) {
    routes.push({ path: match[1], name: match[2] });
  }
  return routes;
}
