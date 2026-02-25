#!/bin/bash

# CI 模式：避免 pnpm 交互式提示
export CI=true

echo "=========================================="
echo "  Digital Avatar - 应用容器"
echo "=========================================="

# ---- 处理应用项目目录（volume 挂载） ----
# 如果 volume 为空（首次运行），从备份目录复制初始文件
if [ ! -f "/app/frontend/package.json" ]; then
    echo "[初始化] 应用项目 volume 为空，复制初始文件..."
    if [ -d "/opt/app-init" ]; then
        cp -r /opt/app-init/* /app/
        echo "[初始化] 初始文件复制完成"
    else
        echo "[警告] 没有找到初始文件备份"
    fi
fi

# ---- 安装应用项目依赖（可能被 Claude Code 修改过） ----
echo "[启动] 安装应用项目依赖..."
cd /app/server && NODE_ENV=development pnpm install --silent 2>/dev/null
cd /app/frontend && NODE_ENV=development pnpm install --silent 2>/dev/null

# ---- 启动应用后端 ----
echo "[启动] 应用后端 (Port 3001)..."
cd /app/server
NODE_ENV=development node --watch index.js &
APP_SERVER_PID=$!

# ---- 启动应用前端（开发模式，支持 HMR） ----
echo "[启动] 应用前端 (Port 5174)..."
cd /app/frontend
NODE_ENV=development npx vite --port 5174 --host &
APP_FRONTEND_PID=$!

echo ""
echo "=========================================="
echo "  应用服务已启动！"
echo "=========================================="
echo "  应用前端: http://localhost:5174"
echo "  应用后端: http://localhost:3001"
echo "=========================================="
echo ""

# 优雅关闭
cleanup() {
    echo "[关闭] 正在停止应用服务..."
    kill $APP_SERVER_PID $APP_FRONTEND_PID 2>/dev/null
    wait
    echo "[关闭] 应用服务已停止"
    exit 0
}
trap cleanup SIGTERM SIGINT

# 保持容器运行
wait $APP_SERVER_PID $APP_FRONTEND_PID
