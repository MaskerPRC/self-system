# syntax=docker/dockerfile:1
FROM node:20-alpine

# 安装必要工具（含编译工具，以支持原生 npm 模块）
RUN apk add --no-cache bash curl dos2unix python3 make g++

# 安装 pnpm
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm

# CI 模式避免 pnpm 交互提示
ENV CI=true

WORKDIR /opt/app-init

# ---- 复制 package.json，利用缓存 ----
COPY app/server/package.json /opt/app-init/server/package.json
COPY app/frontend/package.json /opt/app-init/frontend/package.json

# ---- 安装依赖 ----
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    cd /opt/app-init/server && pnpm install && \
    cd /opt/app-init/frontend && pnpm install

# ---- 复制应用项目源码到备份目录（volume 挂载路径之外） ----
COPY app/server/ /opt/app-init/server/
COPY app/frontend/ /opt/app-init/frontend/

# 启动脚本（放在 volume 挂载路径之外）
COPY app/docker/entrypoint.sh /entrypoint.sh
RUN dos2unix /entrypoint.sh && chmod +x /entrypoint.sh

WORKDIR /app

# 端口：3001 应用后端，5174 应用前端
EXPOSE 3001 5174

ENTRYPOINT ["/entrypoint.sh"]
