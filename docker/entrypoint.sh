#!/bin/bash

# CI 模式：避免 pnpm 交互式提示
export CI=true

echo "=========================================="
echo "  Digital Avatar - 控制容器"
echo "=========================================="

# ---- 配置 Claude Code ----
echo "[配置] 正在配置 Claude Code..."

if [ -n "$ZHIPU_API_KEY" ]; then
    # ===== 智谱 GLM5 模式 =====
    echo "[配置] 检测到 ZHIPU_API_KEY，使用智谱 GLM5 模式"

    ANTHROPIC_BASE_URL="https://open.bigmodel.cn/api/anthropic"
    API_TIMEOUT_MS="3000000"

    # 配置 ~/.claude.json（跳过 onboarding）
    node --eval '
        const fs = require("fs");
        const path = require("path");
        const filePath = path.join(process.env.HOME || "/root", ".claude.json");
        const content = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : {};
        fs.writeFileSync(filePath, JSON.stringify({ ...content, hasCompletedOnboarding: true }, null, 2));
    '

    # 配置 ~/.claude/settings.json
    mkdir -p "${HOME}/.claude"
    node --eval '
        const fs = require("fs");
        const path = require("path");
        const filePath = path.join(process.env.HOME || "/root", ".claude", "settings.json");
        const content = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : {};
        fs.writeFileSync(filePath, JSON.stringify({
            ...content,
            env: {
                ...(content.env || {}),
                ANTHROPIC_AUTH_TOKEN: process.env.ZHIPU_API_KEY,
                ANTHROPIC_BASE_URL: "'"${ANTHROPIC_BASE_URL}"'",
                API_TIMEOUT_MS: "'"${API_TIMEOUT_MS}"'",
                CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1"
            }
        }, null, 2));
    '

    echo "[配置] 智谱 GLM5 配置完成"

elif [ -n "$MINIMAX_API_KEY" ]; then
    # ===== MiniMax 模式 =====
    echo "[配置] 检测到 MINIMAX_API_KEY，使用 MiniMax 模式"

    ANTHROPIC_BASE_URL="https://api.minimaxi.com/anthropic"
    API_TIMEOUT_MS="3000000"
    MINIMAX_MODEL="MiniMax-M2.5"

    # 配置 ~/.claude.json（跳过 onboarding）
    node --eval '
        const fs = require("fs");
        const path = require("path");
        const filePath = path.join(process.env.HOME || "/root", ".claude.json");
        const content = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : {};
        fs.writeFileSync(filePath, JSON.stringify({ ...content, hasCompletedOnboarding: true }, null, 2));
    '

    # 配置 ~/.claude/settings.json
    mkdir -p "${HOME}/.claude"
    node --eval '
        const fs = require("fs");
        const path = require("path");
        const filePath = path.join(process.env.HOME || "/root", ".claude", "settings.json");
        const content = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : {};
        const model = "'"${MINIMAX_MODEL}"'";
        fs.writeFileSync(filePath, JSON.stringify({
            ...content,
            env: {
                ...(content.env || {}),
                ANTHROPIC_AUTH_TOKEN: process.env.MINIMAX_API_KEY,
                ANTHROPIC_BASE_URL: "'"${ANTHROPIC_BASE_URL}"'",
                API_TIMEOUT_MS: "'"${API_TIMEOUT_MS}"'",
                CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
                ANTHROPIC_MODEL: model,
                ANTHROPIC_SMALL_FAST_MODEL: model,
                ANTHROPIC_DEFAULT_SONNET_MODEL: model,
                ANTHROPIC_DEFAULT_OPUS_MODEL: model,
                ANTHROPIC_DEFAULT_HAIKU_MODEL: model
            }
        }, null, 2));
    '

    echo "[配置] MiniMax 配置完成"

elif [ -n "$CLAUDE_CODE_URL" ] && [ -n "$CLAUDE_CODE_KEY" ]; then
    # ===== 原有代理模式 =====
    echo "[配置] 使用代理模式: ${CLAUDE_CODE_URL}"
    curl -s ${CLAUDE_CODE_URL}/setup-claude-code.sh | bash -s -- --url ${CLAUDE_CODE_URL} --key ${CLAUDE_CODE_KEY}
    echo "[配置] Claude Code 配置完成"

else
    echo "[警告] 未设置 ZHIPU_API_KEY / MINIMAX_API_KEY 或 CLAUDE_CODE_URL/CLAUDE_CODE_KEY"
fi

# 将 Claude 配置复制到非 root 用户（--dangerously-skip-permissions 需要非 root）
echo "[配置] 设置 claude 用户权限..."
if [ -d /root/.claude ]; then
    cp -r /root/.claude /home/claude/.claude
    chown -R claude:claude /home/claude
fi
if [ -f /root/.claude.json ]; then
    cp /root/.claude.json /home/claude/.claude.json
    chown claude:claude /home/claude/.claude.json
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
