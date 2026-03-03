# Contributing to Self-System

感谢你对 Self-System 的关注！这个项目有一些独特之处——它的应用代码主要由 AI 生成，因此贡献方式与传统开源项目有所不同。

## 贡献方式

### 1. 贡献 Skill（最推荐）

Skill 是 Markdown 文件，描述一个有用的 API 集成或自动化能力。AI 在生成代码时会参考这些 Skill。

创建方式：在 `.claude/skills/` 目录下新建 `.md` 文件：

```markdown
---
name: your-skill-name
description: 简短描述这个技能做什么
---

## 使用说明
详细描述 API 接口、参数格式、使用场景等。
```

### 2. 改进核心架构

修改 Control 容器或 App 容器的核心逻辑（`control/` 和 `app/` 目录下的基础代码）。

### 3. 文档和翻译

改进 README、添加教程、翻译文档。

## 开发流程

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m 'Add some feature'`
4. 推送到分支：`git push origin feature/your-feature`
5. 创建 Pull Request

## 本地开发环境

```bash
# 克隆项目
git clone https://github.com/your-username/self-system.git
cd self-system

# 安装依赖
pnpm install
cd control/server && pnpm install && cd ../..
cd control/frontend && pnpm install && cd ../..
cd app/server && pnpm install && cd ../..
cd app/frontend && pnpm install && cd ../..

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入必要配置

# 启动开发服务
npm run dev
```

## 代码规范

- 每个新功能必须创建独立的路由文件和 Vue 页面文件
- 后端路由放在 `app/server/routes/` 目录
- 前端页面放在 `app/frontend/src/views/` 目录
- 定时任务必须有启动冷却期（60 秒延迟）
- 详细规范请参考 [CLAUDE.md](CLAUDE.md)

## Issue 指南

- 使用 Issue 模板提交 Bug 报告或功能请求
- 提交 Bug 时请附上复现步骤和环境信息
- 功能请求请描述使用场景和预期效果

## License

贡献的代码将遵循项目的 [MIT License](LICENSE)。
