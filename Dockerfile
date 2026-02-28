# syntax=docker/dockerfile:1
FROM node:20-alpine

# 安装必要工具（包含 docker-cli 用于管理应用容器）
RUN apk add --no-cache \
    git \
    bash \
    curl \
    openssh-client \
    python3 \
    make \
    g++ \
    dos2unix \
    jq \
    iproute2 \
    lsof \
    github-cli \
    docker-cli

# 安装 pnpm、serve（静态文件服务）、Claude Code CLI
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm serve @anthropic-ai/claude-code

# 创建非 root 用户（--dangerously-skip-permissions 不允许 root）
RUN adduser -D -h /home/claude claude

# CI 模式避免 pnpm 交互提示
ENV CI=true

WORKDIR /app

# ---- 复制控制项目 package.json，利用缓存 ----
COPY control/server/package.json /app/control/server/package.json
COPY control/frontend/package.json /app/control/frontend/package.json

# ---- 安装控制项目依赖 ----
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    cd /app/control/server && pnpm install && \
    cd /app/control/frontend && pnpm install

# ---- 复制控制项目源码 ----
COPY control/ /app/control/
COPY supabase/ /app/supabase/
COPY .env* /app/

# 构建控制前端
WORKDIR /app/control/frontend
RUN pnpm run build

WORKDIR /app

# 环境变量
ENV NODE_ENV=production

# Claude Code 配置（通过 docker-compose 覆盖，优先级从高到低）
# 模式一：智谱 GLM5
ENV ZHIPU_API_KEY=
# 模式二：MiniMax
ENV MINIMAX_API_KEY=
# 模式三：代理模式
ENV CLAUDE_CODE_URL=
ENV CLAUDE_CODE_KEY=
# Claude Code 模型名称（可选，默认 opus）
ENV CLAUDE_MODEL=

# Supabase（通过 docker-compose 覆盖或用 .env）
ENV SUPABASE_URL=
ENV SUPABASE_ANON_KEY=

# 应用容器名称
ENV APP_CONTAINER_NAME=digital-avatar-app

# 端口：3000 控制服务（API + WebSocket + 静态前端）
EXPOSE 3000

# 启动脚本
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN dos2unix /app/entrypoint.sh && chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
