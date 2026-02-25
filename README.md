# Digital Avatar - 数字渐进式分身

通过自然语言对话，渐进式地构建你的数字分身。

用户通过 Control 控制面板与 AI 对话，逐步为 App 应用系统添加能力和行为 —— 每一次对话都在让这个数字分身变得更像你自己。它可以拥有你的工具、你的习惯、你的工作流，最终成为你在数字世界的延伸。

## 设计哲学

**完全自由，零架构限制。**

不同于预设了大量架构约束的 Agent 平台，Self-System 不限制用户如何设计和调整自己的数字分身：

- **功能无边界** — 页面、API、定时任务、爬虫、数据处理、自动化工作流……想加什么就加什么
- **技术无限制** — 自由引入依赖、使用任何框架特性、选择任何技术方案
- **环境可定制** — 不仅可以修改应用代码，还可以调整容器运行环境（安装系统工具、配置 cron、修改环境变量等）
- **渐进式成长** — 数字分身的能力完全由你定义，通过持续对话不断进化

你的分身，你做主。

## 核心特性

- **自然语言驱动** — 对话即开发，描述需求后 AI 自动生成前端页面、后端 API 和路由
- **三种交互模式** — 简单问答、交互式页面生成、可复用技能配置
- **实时反馈** — WebSocket 实时推送 AI 执行过程和状态
- **Docker-in-Docker 架构** — 控制容器管理应用容器，代码热更新，环境隔离且可定制
- **技能系统** — 可扩展的技能配置，支持 API 集成与自定义提示词注入
- **自动修复** — 检测到错误时自动触发修复流程

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│                   Control Container                  │
│  ┌────────────────────────────┐  ┌─────────────┐   │
│  │  Control API + Web         │  │ Claude Code  │   │
│  │  (Express + 静态文件)      │  │    CLI       │   │
│  │  :3000  ↕  42617          │  │              │   │
│  └────────────────────────────┘  └─────────────┘   │
│                          │ Docker Socket             │
└──────────────────────────┼──────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────┐
│                   App Container                      │
│  ┌──────────────┐  ┌────────────┐                   │
│  │  App Web     │  │  App API   │   ← 数字分身的载体 │
│  │  (Vue 3)     │  │ (Express)  │                   │
│  │  :5174       │  │  :3001     │                   │
│  │  ↕ 53781     │  │  ↕ 53783  │                   │
│  └──────────────┘  └────────────┘                   │
└─────────────────────────────────────────────────────┘
```

## 目录结构

```
digital-avatar/
├── control/                    # 控制系统
│   ├── server/                 # 控制后端 (Express, port 3000)
│   │   ├── index.js           # API 主入口
│   │   └── modules/
│   │       ├── claude.js      # Claude Code 执行与提示词构建
│   │       ├── process.js     # Docker 容器管理
│   │       ├── websocket.js   # WebSocket 消息广播
│   │       ├── heartbeat.js   # 页面活跃度追踪
│   │       ├── skills.js      # 技能 CRUD
│   │       └── supabase.js    # 数据库客户端
│   └── frontend/              # 控制前端 (Vue 3, port 3002)
│       └── src/
│           ├── views/         # ChatView, CollectionView
│           └── components/    # ChatPanel, LogPanel 等
│
├── app/                       # 应用系统 (数字分身载体，用户自由定制)
│   ├── server/                # 应用后端 (Express, port 3001)
│   ├── frontend/              # 应用前端 (Vue 3, port 5174)
│   └── Dockerfile
│
├── supabase/
│   └── schema.sql             # 数据库 Schema
│
├── .claude/
│   └── skills/                # 技能配置目录
│
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3, Vue Router 4, Vite, Tailwind CSS 4 |
| 后端 | Node.js 20, Express.js, WebSocket (ws) |
| 数据库 | Supabase (PostgreSQL) |
| AI | Claude Code CLI |
| 容器化 | Docker, Docker Compose |
| 包管理 | pnpm |

## 快速开始

### 环境要求

- Node.js 20+
- pnpm
- Docker & Docker Compose
- Supabase 项目（用于数据持久化）

### 1. 配置环境变量

创建 `.env` 文件：

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
CLAUDE_CODE_URL=your_claude_code_url
CLAUDE_CODE_KEY=your_claude_code_key
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

## 宝塔面板部署指南

### 前置条件

- 宝塔面板已安装 Nginx
- Docker 和 Docker Compose 已安装
- 两个域名已解析到服务器 IP（A 记录）

### 1. 上传项目并启动 Docker

```bash
cd /www/wwwroot/self-system    # 项目目录

# 配置环境变量
cp .env.example .env
vim .env

# 构建并启动
docker compose up -d --build

# 验证状态
docker compose ps
```

### 2. 宝塔配置反向代理

需要两个域名，分别代理 Control 控制系统和 App 应用系统。

#### 域名 1：Control 控制面板 (如 `control.yourdomain.com`)

宝塔 → 网站 → 添加站点 → 填入域名，然后进入 **设置 → 配置文件**，替换为：

```nginx
server {
    listen 80;
    server_name control.yourdomain.com;

    # 所有请求 → 控制后端 (42617)
    # Express 同时提供 API、WebSocket 和静态前端
    location / {
        proxy_pass http://127.0.0.1:42617;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # WebSocket 支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    location ~ /\. { deny all; }
}
```

#### 域名 2：App 应用系统 (如 `app.yourdomain.com`)

同样添加站点，**设置 → 配置文件**替换为：

```nginx
server {
    listen 80;
    server_name app.yourdomain.com;

    # 所有请求 → 应用前端 Vite (53781)
    # Vite 内部已代理 /api/app/* → 容器内 3001
    location / {
        proxy_pass http://127.0.0.1:53781;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Vite HMR WebSocket
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

宝塔 → 网站 → 选择站点 → SSL → Let's Encrypt → 申请证书，对两个域名分别开启。

### 4. 安全加固（推荐）

如果只通过域名访问，不需要直接 IP:端口 访问，修改 `docker-compose.yml` 绑定到 127.0.0.1：

```yaml
ports:
  - "127.0.0.1:42617:3000"
  - "127.0.0.1:53781:5174"
  - "127.0.0.1:53783:3001"
```

这样 Docker 端口只监听本地回环，外部只能通过 Nginx 反向代理访问。

### 常见问题

| 问题 | 排查方法 |
|------|---------|
| WebSocket 连接失败 | 确认 Nginx 中 `/socket.io/` 有 `proxy_http_version 1.1` 和 `Upgrade` 头 |
| 502 Bad Gateway | `docker compose ps` 检查容器状态，`docker compose logs -f` 查看日志 |
| API 404 | 确认 Nginx `location /api/` 代理到正确端口 |

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

## 工作流程

```
用户输入需求 → 保存消息 → 队列调度 → 构建提示词(含技能)
    → Claude Code 生成代码 → 判断输出类型:
        ├── [RESPONSE]   → 直接回复
        ├── [PAGE_INFO]  → 写入文件 → 重启应用容器 → 验证 → 自动修复
        └── [SKILL_INFO] → 保存技能配置
    → WebSocket 实时推送结果
```

## License

MIT
