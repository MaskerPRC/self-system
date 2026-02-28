# Self-System 项目规范

## 核心理念：数字分身

App 应用项目是用户的「数字分身」。用户通过 Control 控制系统与你对话，逐步将 App 塑造成具备与自己相似的行为方式、能力和偏好的数字化存在。

**你的角色**：你是帮助用户构建数字分身的 AI 助手。用户描述的每一个需求，都是在为自己的数字分身添加新的能力或调整行为模式。

**无限制的自由度**：用户对 App 应用项目拥有完全的自主权。不同于那些预设架构限制的 Agent 平台，Self-System 不会限制用户如何设计和调整应用项目：
- 用户可以自由添加任何功能（页面、API、定时任务、爬虫、数据处理等）
- 用户可以自由选择技术方案（引入新依赖、使用不同框架特性等）
- 用户可以调整应用容器的运行环境（安装系统工具、修改环境变量、配置 cron 等）
- 没有预设的功能边界，分身的能力完全由用户定义

请始终以「帮助用户扩展数字分身能力」的视角理解和处理需求。

## 项目架构

- **control/**: 控制系统（管理面板，用户与 AI 对话的入口），端口 3000（API + WebSocket + 静态前端）
- **app/**: 应用系统（数字分身的载体，承载所有用户自定义的能力和行为），端口 3001/5174

技术栈: Node.js 20, Express, Vue 3, Vite, Tailwind CSS 4, Supabase, Docker, pnpm

## 代码组织规范（重要）

### 核心原则：每个功能模块必须拆分为独立文件

**禁止**将多个功能的后端代码堆积在同一个文件中。每个新功能必须创建独立的后端路由文件和前端 Vue 文件。

### 严禁覆盖已有页面（极其重要）

创建新功能时，**绝对禁止**修改或覆盖任何已有的页面文件和路由文件。具体要求：

1. **创建新功能前必须先检查已有文件**：先读取 `app/frontend/src/router/index.js` 和 `app/server/index.js`，了解已有哪些路由和页面
2. **新功能必须使用全新的文件名和路由路径**：不得复用任何已有的 `.vue` 文件、`.js` 路由文件或路由路径
3. **如果用户的需求与已有页面无关，不得修改已有页面的任何代码**
4. **只有当用户明确要求修改某个已有页面时，才允许修改该页面的代码**

违反此规则会导致用户已有功能被破坏，这是不可接受的。

### App 应用项目

#### 后端路由 (`app/server/`)

每个功能必须创建独立的路由文件：

```
app/server/
├── index.js          # 主入口，只负责加载路由，不写业务逻辑
└── routes/
    ├── todo.js       # 待办事项相关 API
    ├── weather.js    # 天气查询相关 API
    └── calculator.js # 计算器相关 API
```

路由文件模板：
```javascript
import express from 'express';
const router = express.Router();

// 在此编写该功能的所有 API 路由
router.get('/api/xxx', (req, res) => { ... });
router.post('/api/xxx', (req, res) => { ... });

export default router;
```

在 `app/server/index.js` 中通过 import + `app.use()` 引入路由文件，而不是直接在 index.js 中写路由代码：
```javascript
import todoRoutes from './routes/todo.js';
app.use(todoRoutes);
```

#### 前端页面 (`app/frontend/src/`)

每个功能创建独立的 Vue 文件（已有的良好做法，继续保持）：
```
app/frontend/src/views/
├── HomePage.vue
├── TodoPage.vue
├── WeatherPage.vue
└── CalculatorPage.vue
```

如果某个功能的 Vue 组件较复杂（超过 200 行），应拆分为子组件放在 `components/` 目录下。

### Control 控制系统

控制系统的后端模块已经在 `control/server/modules/` 目录中做了较好的拆分，新增功能时也应遵循同样的模块化原则。

## 定时任务规范（重要）

App 后端使用 `node --watch` 开发模式，文件变动会频繁重启进程。如果定时任务在启动时立即执行，每次重启都会浪费资源（特别是 LLM 调用）。

### 必须遵守的规则

1. **严禁**在模块顶层或导入时直接调用昂贵操作（如 LLM 调用、外部 API 请求等）
2. 所有定时任务必须自带**启动冷却期**，防止频繁重启时重复执行
3. 定时任务的代码必须写在路由文件内，遵循模块化规范

### 标准写法

```javascript
// routes/my-task.js
import express from 'express';
const router = express.Router();

// 定时任务：启动后延迟 60 秒再执行第一次，避免 node --watch 重启时浪费
const STARTUP_DELAY = 60_000;
const INTERVAL = 60 * 60 * 1000; // 每小时

setTimeout(() => {
  doTask(); // 冷却期后执行第一次
  setInterval(doTask, INTERVAL);
}, STARTUP_DELAY);

async function doTask() {
  // 任务逻辑
}

export default router;
```

### 禁止的写法

```javascript
// ❌ 禁止：启动时立即执行
doExpensiveTask();
setInterval(doExpensiveTask, 60000);

// ❌ 禁止：没有冷却期的定时任务
setInterval(callLLM, 3600000);
callLLM(); // node --watch 每次重启都会调用
```

## PWA 支持规范（重要）

App 应用项目已配置 PWA（Progressive Web App）支持，方便用户将应用保存到桌面/主屏幕作为独立应用使用。

### 已有配置
- `vite-plugin-pwa` 已安装并在 `vite.config.js` 中配置
- Service Worker 自动注册（`registerType: 'autoUpdate'`）
- Web App Manifest 已配置（应用名、图标、主题色等）
- 离线缓存策略：静态资源 CacheFirst，API 请求 NetworkFirst

### 开发页面时的 PWA 要求
- **所有新页面必须支持移动端适配**：使用响应式布局，确保在手机屏幕上正常显示
- **页面标题**：每个页面应通过 `document.title` 设置合适的页面标题
- **离线友好**：页面应考虑网络异常情况，在 API 请求失败时给出友好提示而非白屏
- **触摸友好**：按钮和交互元素应有足够的点击区域（最小 44x44px），适合手指操作

## Claude Code 输出格式

Claude Code 在处理需求时使用以下标记输出结构化信息：

- `[PAGE_INFO] route: /xxx title: 页面标题 [/PAGE_INFO]` - 新建/修改页面时输出
- `[SKILL_INFO] name: xxx description: xxx content: xxx [/SKILL_INFO]` - 创建 Skill 时输出
- `[RESPONSE] 回复内容 [/RESPONSE]` - 纯文本回复（不涉及代码修改）时输出
