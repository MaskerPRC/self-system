#!/bin/bash

# CI 模式：避免 pnpm 交互式提示
export CI=true

echo "=========================================="
echo "  Digital Avatar - 应用容器（生产模式）"
echo "=========================================="

# ---- 处理应用项目目录（volume 挂载） ----
if [ ! -f "/app/frontend/package.json" ]; then
    echo "[初始化] 应用项目 volume 为空，复制初始文件..."
    if [ -d "/opt/app-init" ]; then
        cp -r /opt/app-init/* /app/
        echo "[初始化] 初始文件复制完成"
    else
        echo "[警告] 没有找到初始文件备份"
    fi
fi

# ---- 安装应用项目依赖 ----
echo "[启动] 安装应用项目依赖..."
cd /app/server && pnpm install --silent 2>/dev/null
cd /app/frontend && pnpm install --silent 2>/dev/null

# 确保 PWA 构建依赖存在
cd /app/frontend && pnpm add workbox-window --silent 2>/dev/null

# ---- 构建前端静态文件 ----
echo "[构建] 构建前端生产版本..."
cd /app/frontend && npx vite build
BUILD_EXIT=$?

if [ $BUILD_EXIT -ne 0 ]; then
    echo "[错误] 前端构建失败，退出码: $BUILD_EXIT"
    echo "[回退] 将以开发模式启动..."
fi

# ---- 启动应用后端 ----
cd /app/server
if [ $BUILD_EXIT -eq 0 ]; then
    echo "[启动] 应用后端 - 生产模式 (Port 3001)..."
    NODE_ENV=production node index.js &
else
    echo "[启动] 应用后端 - 开发模式 (Port 3001)..."
    NODE_ENV=development node index.js &
fi
APP_SERVER_PID=$!

# 如果前端构建失败，回退到 Vite 开发模式
if [ $BUILD_EXIT -ne 0 ]; then
    echo "[启动] 应用前端 - 回退到开发模式 (Port 5174)..."
    cd /app/frontend
    NODE_ENV=development npx vite --port 5174 --host &
    APP_FRONTEND_PID=$!
fi

echo ""
echo "=========================================="
echo "  应用服务已启动！（生产模式）"
echo "=========================================="
echo "  应用地址: http://localhost:3001"
if [ $BUILD_EXIT -ne 0 ]; then
    echo "  前端回退: http://localhost:5174（开发模式）"
fi
echo "=========================================="
echo ""

# 优雅关闭
cleanup() {
    echo "[关闭] 正在停止应用服务..."
    kill $APP_SERVER_PID 2>/dev/null
    [ -n "$APP_FRONTEND_PID" ] && kill $APP_FRONTEND_PID 2>/dev/null
    wait
    echo "[关闭] 应用服务已停止"
    exit 0
}
trap cleanup SIGTERM SIGINT

# 保持容器运行
if [ -n "$APP_FRONTEND_PID" ]; then
    wait $APP_SERVER_PID $APP_FRONTEND_PID
else
    wait $APP_SERVER_PID
fi
