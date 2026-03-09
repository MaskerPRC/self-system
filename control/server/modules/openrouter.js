/**
 * OpenRouter 模块 —— 调用 Gemini 2.5 Flash 对 Claude Code 的输出进行结构化提取
 *
 * 两轮处理流程：
 *   第一轮：Claude Code 专注写代码，输出自然语言描述
 *   第二轮：Gemini Flash 分析输出 + 路由变化，生成精确的结构化标记
 */
import { sqliteDb } from './sqlite.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'google/gemini-2.5-flash';

/**
 * 读取 OpenRouter 配置
 * 优先级：settings DB > 环境变量
 */
function getOpenRouterConfig() {
  try {
    const row = sqliteDb.prepare("SELECT value FROM settings WHERE key = 'openrouterConfig'").get();
    if (row) {
      const config = JSON.parse(row.value);
      if (config.apiKey) return config;
    }
  } catch {}

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    return {
      apiKey,
      model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL
    };
  }

  return null;
}

/**
 * 保存 OpenRouter 配置到 settings DB
 */
export function saveOpenRouterConfig(apiKey, model = DEFAULT_MODEL) {
  sqliteDb.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
  ).run('openrouterConfig', JSON.stringify({ apiKey, model }));
  console.log('[OpenRouter] 配置已保存');
}

/**
 * 初始化默认配置（如果 DB 中尚未有配置）
 */
export function initOpenRouterConfig(apiKey, model = DEFAULT_MODEL) {
  try {
    const existing = sqliteDb.prepare("SELECT value FROM settings WHERE key = 'openrouterConfig'").get();
    if (!existing) {
      saveOpenRouterConfig(apiKey, model);
      console.log('[OpenRouter] 已写入默认配置');
    }
  } catch (e) {
    console.error('[OpenRouter] 初始化配置失败:', e.message);
  }
}

/**
 * 调用 OpenRouter API
 */
async function callOpenRouter(messages, model) {
  const config = getOpenRouterConfig();
  if (!config) throw new Error('OpenRouter API key 未配置');

  const usedModel = model || config.model || DEFAULT_MODEL;

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://self-system.local',
      'X-Title': 'Self-System'
    },
    body: JSON.stringify({
      model: usedModel,
      messages,
      temperature: 0.1,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API 错误 (${response.status}): ${errText.slice(0, 300)}`);
  }

  const data = await response.json();
  if (!data.choices || !data.choices[0]) throw new Error('OpenRouter 返回格式异常');
  return data.choices[0].message.content;
}

/**
 * 第二轮处理：调用 Gemini 从 Claude Code 输出中提取结构化标记
 *
 * @param {object} options
 * @param {string} options.requirement     用户的原始需求
 * @param {string} options.claudeOutput    Claude Code 的完整 stdout
 * @param {Array}  options.newRoutes       新增的路由列表 [{path, name}]
 * @param {Array}  options.newFiles        新生成的文件列表 [{name, path, type, size}]
 * @param {boolean} options.hasCodeChanges 是否有代码变更（路由/文件变化）
 * @returns {string} 包含结构化标记的字符串
 */
export async function extractStructuredOutput({ requirement, claudeOutput, newRoutes = [], newFiles = [], hasCodeChanges = false }) {
  const config = getOpenRouterConfig();
  if (!config) {
    console.warn('[OpenRouter] 未配置，跳过二次结构化处理');
    return null;
  }

  const newRoutesText = newRoutes.length > 0
    ? newRoutes.map(r => `  - path: ${r.path}  name: ${r.name}`).join('\n')
    : '（无新路由）';

  const newFilesText = newFiles.length > 0
    ? newFiles.map(f => `  - ${f.name} (${f.type}, ${f.size} bytes)`).join('\n')
    : '（无新生成文件）';

  // 截取 Claude Code 输出（避免过长）
  const outputForGemini = claudeOutput.length > 8000
    ? claudeOutput.slice(-6000) + '\n...(已截取最后部分)...'
    : claudeOutput;

  const systemPrompt = `你是一个结构化信息提取器，服务于一个 Web 应用平台。
你的唯一任务：分析 AI 编程助手完成的工作，输出正确的结构化标记。
规则：只输出标记，不输出任何其他文字。`;

  const userPrompt = `## 用户的原始需求
${requirement}

## AI 编程助手的工作输出
${outputForGemini}

## 检测到的新路由（前后对比）
${newRoutesText}

## 检测到的新生成文件
${newFilesText}

---

请根据以上信息，判断做了什么并输出对应的结构化标记：

**情况A：创建或修改了交互页面**（新路由列表非空，或输出中提及创建了 Vue 页面/路由）
输出：
[PAGE_INFO]
route: /路由路径
title: 页面中文标题
public: false
[/PAGE_INFO]

**情况B：创建或修改了 Skill**（用户需求提及 skill/技能，或输出中提及创建了 skill）
输出：
[SKILL_INFO]
name: skill英文名称（小写连字符）
description: 一句话描述
content: skill 的完整 Markdown 内容（从助手输出中提取或根据需求生成）
[/SKILL_INFO]

**情况C：纯文字回复**（无代码修改，只是问答/闲聊）
输出：
[RESPONSE]
助手的回答内容（从输出中提取核心内容，支持 Markdown）
[/RESPONSE]

**规则（严格遵守）：**
1. 如果新路由非空，必须输出 [PAGE_INFO]，不能输出 [RESPONSE]
2. 如果同时创建了页面和 Skill，同时输出 [PAGE_INFO] 和 [SKILL_INFO]
3. 如果没有检测到代码变更（路由、文件均为空），但有有意义的文字输出，输出 [RESPONSE]
4. [PAGE_INFO] 的 route 必须从"新路由列表"中取，title 从需求或输出中提炼（中文，简短）
5. public 为 true 仅当用户明确要求"公开访问"或"不需要登录"
6. 只输出标记，不输出任何解释性文字
7. 如果编程助手的输出中已经有 [SKILL_INFO] 格式的内容，提取并输出它`;

  try {
    console.log('[OpenRouter] 开始二次结构化处理...');
    const result = await callOpenRouter([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], config.model || DEFAULT_MODEL);

    console.log('[OpenRouter] 结构化输出完成:', result.slice(0, 200));
    return result;
  } catch (e) {
    console.error('[OpenRouter] 二次处理失败:', e.message);
    return null;
  }
}

/**
 * 检查 OpenRouter 是否已配置
 */
export function isOpenRouterConfigured() {
  return !!getOpenRouterConfig();
}
