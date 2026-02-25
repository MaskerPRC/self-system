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

## Claude Code 输出格式

Claude Code 在处理需求时使用以下标记输出结构化信息：

- `[PAGE_INFO] route: /xxx title: 页面标题 [/PAGE_INFO]` - 新建/修改页面时输出
- `[SKILL_INFO] name: xxx description: xxx content: xxx [/SKILL_INFO]` - 创建 Skill 时输出
- `[RESPONSE] 回复内容 [/RESPONSE]` - 纯文本回复（不涉及代码修改）时输出
