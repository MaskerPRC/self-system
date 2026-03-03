# Self-System — Digital Progressive Alter Ego

> 通过自然语言对话，渐进式构建你的数字分身。面向程序员的 AI 自生长系统。

![Docker](https://img.shields.io/badge/Docker-Required-blue?logo=docker)
![Vue 3](https://img.shields.io/badge/Vue-3.5-green?logo=vue.js)
![Express](https://img.shields.io/badge/Express-4.x-lightgrey?logo=express)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js)
![License](https://img.shields.io/badge/License-MIT-yellow)

## What is Self-System?

Self-System 不是又一个 AI 聊天机器人。它是一个 **AI 驱动的自生长系统**：

你用自然语言描述需求 → AI 实时生成代码 → 自动部署到 Docker 容器 → 系统长出新能力。

每一次对话都在让你的数字分身变得更强大——它可以拥有你的工具、你的习惯、你的工作流，最终成为你在数字世界的延伸。

## 核心特性

- **对话即功能** — 描述需求后 AI 自动生成前端页面、后端 API 和路由，即时部署
- **完全自由，零架构限制** — 页面、API、定时任务、爬虫、数据处理……想加什么就加什么
- **技能系统** — 用 Markdown 定义可复用技能，将 API 集成和自动化抽象为 AI 可理解的文档
- **Docker-in-Docker 架构** — 控制容器管理应用容器，代码热更新，环境隔离且可定制
- **实时反馈** — WebSocket 实时推送 AI 执行过程和状态
- **自动修复** — 检测到错误时自动触发修复流程
- **PWA 支持** — 可安装到桌面/手机主屏幕，支持离线缓存

## 与其他平台的区别

| 维度 | Self-System | 传统 Agent 平台 |
|------|-------------|-----------------|
| 核心范式 | AI 生成代码，系统自生长 | 消息路由 / 工作流编排 |
| 定制深度 | 无限制（生成任意代码） | Plugin API 或预设组件边界内 |
| 扩展方式 | 对话即功能 | SDK / 拖拽编排 |
| 目标用户 | 程序员 | 所有人 |

> 如果传统 Agent 平台是个人 AI 的 Android，那 Self-System 就是程序员的 AI Linux。你不下载 App，你编译整个操作系统——只不过编译器是自然语言。

## 架构概览

```
┌──────────────────────────────────────┐
│  CONTROL 容器（大脑）                 │
│  AI 代码生成引擎                      │
│  Docker Socket 控制权                │
│  代码生成 + 热部署                    │
│  :3000 (API + WebSocket + 静态前端)  │
└──────────────┬───────────────────────┘
               │ Docker API
               ↓
┌──────────────────────────────────────┐
│  APP 容器（身体）                     │
│  Vue 3 前端 (:5174) + Express (:3001)│
│  所有 AI 生成的页面和 API             │
│  Supabase 云端数据存储               │
└──────────────────────────────────────┘
```

**核心创新**：Control 容器通过 Docker Socket 管理 App 容器。每次对话都可能让系统长出新的 API 端点、前端页面、定时任务。

## 技能系统

Self-System 的技能是 **Markdown 文件**，不是代码模块：

```markdown
---
name: wechat-automation
description: 微信消息自动发送
---
## Webhook URL: https://xxx
## Format: { "userName": "群名", "message": "内容" }
```

当执行者是 AI 时，最优的指令格式从「代码」变成了「文档」。

## 快速开始

### 环境要求

- Docker & Docker Compose
- Supabase 项目（用于数据持久化）
- AI 模型 API Key（支持多种模型，见下方配置）

### 1. 克隆并配置

```bash
git clone https://github.com/MaskerPRC/self-system.git
cd self-system
cp .env.example .env
```

编辑 `.env` 文件，配置以下内容：

```env
# Supabase 配置
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# AI 模型配置（四选一，优先级：ZHIPU > MINIMAX > QWEN > 代理）
# 模式一：智谱 GLM5
ZHIPU_API_KEY=your_key
# 模式二：MiniMax
MINIMAX_API_KEY=your_key
# 模式三：通义千问
QWEN_API_KEY=your_key
# 模式四：代理模式
CLAUDE_CODE_URL=https://your-proxy-url
CLAUDE_CODE_KEY=your_key

# 鉴权
AUTH_USERNAME=yourname
AUTH_PASSWORD=yourpassword
```

### 2. 初始化数据库

在 Supabase 中执行 `supabase/schema.sql` 创建所需表。

### 3. Docker 部署（推荐）

```bash
docker compose up -d --build
```

启动后可访问：

| 服务 | 容器端口 | 宿主机端口 | 地址 |
|------|---------|-----------|------|
| 控制面板 (API + Web + WebSocket) | 3000 | 42617 | http://localhost:42617 |
| 应用前端 | 5174 | 53781 | http://localhost:53781 |
| 应用 API | 3001 | 53783 | http://localhost:53783 |

### 4. 本地开发

```bash
# 安装依赖
pnpm install
cd control/server && pnpm install && cd ../..
cd control/frontend && pnpm install && cd ../..
cd app/server && pnpm install && cd ../..
cd app/frontend && pnpm install && cd ../..

# 启动所有服务
npm run dev
```

## 目录结构

```
self-system/
├── control/                    # 控制系统（大脑）
│   ├── server/                 # 控制后端 (Express, port 3000)
│   │   ├── index.js           # API 主入口
│   │   └── modules/
│   │       ├── claude.js      # AI 代码生成引擎
│   │       ├── process.js     # Docker 容器管理
│   │       ├── websocket.js   # WebSocket 消息广播
│   │       ├── heartbeat.js   # 页面活跃度追踪
│   │       ├── skills.js      # 技能 CRUD
│   │       └── supabase.js    # 数据库客户端
│   └── frontend/              # 控制前端 (Vue 3)
│
├── app/                       # 应用系统（身体，数字分身载体）
│   ├── server/                # 应用后端 (Express, port 3001)
│   │   ├── index.js           # 主入口，加载路由
│   │   └── routes/            # 功能路由（AI 自动生成）
│   ├── frontend/              # 应用前端 (Vue 3, port 5174)
│   │   └── src/views/         # 功能页面（AI 自动生成）
│   └── Dockerfile
│
├── supabase/
│   └── schema.sql             # 数据库 Schema
│
├── .claude/
│   └── skills/                # 技能配置目录（Markdown 文件）
│
├── docker-compose.yml
├── Dockerfile
└── CLAUDE.md                  # AI 代码生成规范
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3, Vue Router 4, Vite, Tailwind CSS 4 |
| 后端 | Node.js 20, Express.js, WebSocket (ws) |
| 数据库 | Supabase (PostgreSQL) |
| AI | 多模型支持（智谱 GLM / MiniMax / 通义千问 / 代理模式） |
| 容器化 | Docker, Docker Compose, Docker-in-Docker |
| 包管理 | pnpm |

## 工作流程

```
用户输入需求 → 保存消息 → 队列调度 → 构建提示词(含技能)
    → AI 生成代码 → 判断输出类型:
        ├── [RESPONSE]   → 直接回复
        ├── [PAGE_INFO]  → 写入文件 → 重启应用容器 → 验证 → 自动修复
        ├── [SKILL_INFO] → 保存技能配置
        └── [FILE_INFO]  → 生成文件
    → WebSocket 实时推送结果
```

## API 接口

### 对话管理

```
GET    /api/conversations           # 获取对话列表
POST   /api/conversations           # 创建对话
PATCH  /api/conversations/:id       # 更新对话标题
DELETE /api/conversations/:id       # 删除对话
```

### 消息

```
GET    /api/conversations/:id/messages   # 获取对话消息
POST   /api/conversations/:id/messages   # 发送消息（触发 AI 生成）
```

### 页面管理

```
GET    /api/pages                   # 获取所有页面
GET    /api/pages/active            # 获取活跃页面
DELETE /api/pages/:id               # 删除页面
```

### 技能管理

```
GET    /api/skills                  # 获取技能列表
GET    /api/skills/:id              # 获取技能详情
POST   /api/skills                  # 创建技能
PATCH  /api/skills/:id              # 更新技能
DELETE /api/skills/:id              # 删除技能
```

### 系统

```
GET    /api/health                  # 健康检查
POST   /api/heartbeat               # 页面心跳上报
GET    /api/queue/status            # 队列状态
```

## 宝塔面板部署指南

### 前置条件

- 宝塔面板已安装 Nginx
- Docker 和 Docker Compose 已安装
- 两个域名已解析到服务器 IP（A 记录）

### 1. 上传项目并启动 Docker

```bash
cd /www/wwwroot/self-system
cp .env.example .env
vim .env                        # 填入配置

docker compose up -d --build
docker compose ps               # 验证状态
```

### 2. 宝塔配置反向代理

需要两个域名，分别代理 Control 控制系统和 App 应用系统。

#### 域名 1：Control 控制面板 (如 `control.yourdomain.com`)

宝塔 → 网站 → 添加站点 → 填入域名，然后进入 **设置 → 配置文件**，替换为：

```nginx
server {
    listen 80;
    server_name control.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:42617;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    location ~ /\. { deny all; }
}
```

#### 域名 2：App 应用系统 (如 `app.yourdomain.com`)

```nginx
server {
    listen 80;
    server_name app.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:53781;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://127.0.0.1:53781;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    location ~ /\. { deny all; }
}
```

### 3. 配置 SSL（推荐）

宝塔 → 网站 → 选择站点 → SSL → Let's Encrypt → 申请证书。

### 4. 安全加固（推荐）

修改 `docker-compose.yml` 绑定到 127.0.0.1，使 Docker 端口只监听本地回环：

```yaml
ports:
  - "127.0.0.1:42617:3000"
  - "127.0.0.1:53781:5174"
  - "127.0.0.1:53783:3001"
```

### 常见问题

| 问题 | 排查方法 |
|------|---------|
| WebSocket 连接失败 | 确认 Nginx 中有 `proxy_http_version 1.1` 和 `Upgrade` 头 |
| 502 Bad Gateway | `docker compose ps` 检查容器状态，`docker compose logs -f` 查看日志 |
| API 404 | 确认 Nginx `location /api/` 代理到正确端口 |

## 设计哲学

- **代码是可消耗品** — 坏了不调试，重新生成
- **Skill 是知识抽象** — 告诉 AI「做什么」而非「怎么做」
- **系统是活体组织** — 每次对话都在进化
- **完全自主权** — 你的分身，你做主

## Roadmap

- [ ] 多 AI 模型协作（不同任务用不同 Model）
- [ ] 自动化工作流（AI 主动触发而非被动响应）
- [ ] 知识图谱（对话记忆 + 认知积累）
- [ ] 跨页面数据联通
- [ ] 模板导出（可复制的数字分身模板）
- [ ] Multi-Container（一个 Control 管理多个 App）

## Contributing

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

[MIT License](LICENSE)
