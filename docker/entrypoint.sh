#!/bin/bash

# CI 模式：避免 pnpm 交互式提示
export CI=true

echo "=========================================="
echo "  Digital Avatar - 控制容器"
echo "=========================================="

# ---- 配置 Claude Code ----
echo "[配置] 正在配置 Claude Code..."
if [ -n "$CLAUDE_CODE_URL" ] && [ -n "$CLAUDE_CODE_KEY" ]; then
    curl -s ${CLAUDE_CODE_URL}/setup-claude-code.sh | bash -s -- --url ${CLAUDE_CODE_URL} --key ${CLAUDE_CODE_KEY}
    echo "[配置] Claude Code 配置完成"
else
    echo "[警告] 未设置 CLAUDE_CODE_URL 或 CLAUDE_CODE_KEY"
fi

# 将 Claude 配置复制到非 root 用户（--dangerously-skip-permissions 需要非 root）
echo "[配置] 设置 claude 用户权限..."
if [ -d /root/.claude ]; then
    cp -r /root/.claude /home/claude/.claude
    chown -R claude:claude /home/claude
fi
chown -R claude:claude /app

# 验证 Claude Code
echo "[检查] 验证 Claude Code..."
if command -v claude &> /dev/null; then
    echo "[检查] Claude Code 已安装"
    claude --version || true
else
    echo "[错误] Claude Code 未找到"
fi

# 验证 Docker CLI
echo "[检查] 验证 Docker CLI..."
if command -v docker &> /dev/null; then
    echo "[检查] Docker CLI 可用"
    docker --version || true
else
    echo "[警告] Docker CLI 不可用，无法管理应用容器"
fi

# ---- 启动控制后端（同时 serve 前端静态文件） ----
echo "[启动] 控制服务 (Port 3000, API + WebSocket + 静态前端)..."
cd /app/control/server
node index.js &
CTRL_SERVER_PID=$!
sleep 2

echo ""
echo "=========================================="
echo "  控制服务已启动！"
echo "=========================================="
echo "  控制面板: http://localhost:3000"
echo "=========================================="
echo ""

# 优雅关闭
cleanup() {
    echo "[关闭] 正在停止控制服务..."
    kill $CTRL_SERVER_PID 2>/dev/null
    wait
    echo "[关闭] 控制服务已停止"
    exit 0
}
trap cleanup SIGTERM SIGINT

# 保持容器运行
wait $CTRL_SERVER_PID
