# syntax=docker/dockerfile:1
FROM ubuntu:24.04

# 避免 apt 交互提示
ENV DEBIAN_FRONTEND=noninteractive

# 安装 Node.js 20 和必要工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends \
    nodejs \
    git \
    bash \
    openssh-client \
    python3 \
    make \
    g++ \
    jq \
    iproute2 \
    lsof \
    unzip \
    p7zip-full \
    locales \
    && rm -rf /var/lib/apt/lists/*

# 安装 Docker CLI
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && apt-get install -y --no-install-recommends docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

# 安装 GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && apt-get install -y --no-install-recommends gh && \
    rm -rf /var/lib/apt/lists/*

# UTF-8 locale 支持（含中文）
RUN sed -i 's/# en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen && \
    sed -i 's/# zh_CN.UTF-8/zh_CN.UTF-8/' /etc/locale.gen && \
    locale-gen
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

# 安装 pnpm、serve（静态文件服务）、Claude Code CLI
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm serve @anthropic-ai/claude-code

# 创建非 root 用户（--dangerously-skip-permissions 不允许 root）
RUN useradd -m -d /home/claude -s /bin/bash claude

# CI 模式避免 pnpm 交互提示
ENV CI=true

WORKDIR /app

# ---- 复制控制项目 package.json，利用缓存 ----
COPY control/server/package.json /app/control/server/package.json
COPY control/frontend/package.json /app/control/frontend/package.json

# ---- 安装控制项目依赖 ----
RUN cd /app/control/server && pnpm install && \
    cd /app/control/frontend && pnpm install

# ---- 复制控制项目源码 ----
COPY control/ /app/control/
COPY .env* /app/

# 构建控制前端
WORKDIR /app/control/frontend
RUN pnpm run build

WORKDIR /app

# 环境变量
ENV NODE_ENV=production

# Claude Code 配置（通过 docker-compose 覆盖，优先级从高到低）
# 模式零：Anthropic 官方 API
ENV ANTHROPIC_API_KEY=
# 模式一：智谱 GLM5
ENV ZHIPU_API_KEY=
# 模式二：MiniMax
ENV MINIMAX_API_KEY=
# 模式三：通义千问 Coding Plan
ENV QWEN_API_KEY=
# 模式四：代理模式
ENV CLAUDE_CODE_URL=
ENV CLAUDE_CODE_KEY=
# Claude Code 模型名称（可选，默认 opus）
ENV CLAUDE_MODEL=

# 应用容器名称
ENV APP_CONTAINER_NAME=digital-avatar-app

# 端口：3000 控制服务（API + WebSocket + 静态前端）
EXPOSE 3000

# 启动脚本
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# 在构建阶段将 /app 所有权交给 claude 用户，避免 entrypoint 中 chown -R 导致启动缓慢
RUN chown -R claude:claude /app

ENTRYPOINT ["/app/entrypoint.sh"]
