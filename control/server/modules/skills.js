import { readdir, readFile, writeFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Skills 存储路径：/app/.claude/skills/
function getSkillsDir() {
  return resolve(__dirname, '../../../.claude/skills');
}

/**
 * 确保 skills 目录存在
 */
async function ensureSkillsDir() {
  const dir = getSkillsDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

/**
 * 解析 SKILL.md 的 YAML frontmatter
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return { meta, body: match[2] };
}

/**
 * 获取所有 skills
 */
export async function getSkills() {
  const dir = await ensureSkillsDir();
  const skills = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillFile = resolve(dir, entry.name, 'SKILL.md');
      if (!existsSync(skillFile)) continue;

      try {
        const content = await readFile(skillFile, 'utf8');
        const { meta, body } = parseFrontmatter(content);
        skills.push({
          name: meta.name || entry.name,
          description: meta.description || '',
          folder: entry.name,
          content: body.trim()
        });
      } catch {}
    }
  } catch {}

  return skills;
}

/**
 * 获取单个 skill 详情
 */
export async function getSkill(name) {
  const dir = getSkillsDir();
  const skillFile = resolve(dir, name, 'SKILL.md');

  if (!existsSync(skillFile)) return null;

  const content = await readFile(skillFile, 'utf8');
  const { meta, body } = parseFrontmatter(content);
  return {
    name: meta.name || name,
    description: meta.description || '',
    folder: name,
    content: body.trim(),
    raw: content
  };
}

/**
 * 创建 skill
 */
export async function createSkill(name, description, content) {
  const dir = await ensureSkillsDir();
  const folder = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const skillDir = resolve(dir, folder);

  if (!existsSync(skillDir)) {
    await mkdir(skillDir, { recursive: true });
  }

  const skillContent = `---
name: ${folder}
description: ${description}
---

${content}
`;

  await writeFile(resolve(skillDir, 'SKILL.md'), skillContent, 'utf8');
  return { name: folder, description, folder, content };
}

/**
 * 更新 skill
 */
export async function updateSkill(name, description, content) {
  const dir = getSkillsDir();
  const skillDir = resolve(dir, name);
  const skillFile = resolve(skillDir, 'SKILL.md');

  if (!existsSync(skillFile)) throw new Error(`Skill "${name}" 不存在`);

  const skillContent = `---
name: ${name}
description: ${description}
---

${content}
`;

  await writeFile(skillFile, skillContent, 'utf8');
  return { name, description, folder: name, content };
}

/**
 * 删除 skill
 */
export async function deleteSkill(name) {
  const dir = getSkillsDir();
  const skillDir = resolve(dir, name);

  if (!existsSync(skillDir)) throw new Error(`Skill "${name}" 不存在`);

  await rm(skillDir, { recursive: true });
}

/**
 * 获取 skills 摘要（用于注入 Claude 提示词）
 */
export async function getSkillsSummary() {
  const skills = await getSkills();
  if (skills.length === 0) return '';

  const lines = skills.map(s => `- ${s.name}: ${s.description}`);
  return `\n【已安装的 Skills】\n${lines.join('\n')}\n`;
}

/**
 * 获取 skill 完整内容（用于注入 Claude 提示词）
 */
export async function getSkillsForPrompt() {
  const skills = await getSkills();
  if (skills.length === 0) return '';

  const parts = skills.map(s => `### Skill: ${s.name}\n${s.description}\n\n${s.content}`);
  return `\n【已安装的 Skills - 如果与需求相关请使用】\n${parts.join('\n\n---\n\n')}\n`;
}
