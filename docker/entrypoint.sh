#!/bin/bash

# CI 模式：避免 pnpm 交互式提示
export CI=true

# UTF-8 locale（解决 CJK 文件名编码问题）
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

echo "=========================================="
echo "  Digital Avatar - 控制容器"
echo "=========================================="

# ---- 配置 Claude Code ----
echo "[配置] 正在配置 Claude Code..."

if [ -n "$ANTHROPIC_API_KEY" ]; then
    # ===== Anthropic 官方 API 模式 =====
    echo "[配置] 检测到 ANTHROPIC_API_KEY，使用 Anthropic 官方 API"

    CLAUDE_MODEL="${CLAUDE_MODEL:-claude-sonnet-4-20250514}"

    # 配置 ~/.claude.json（跳过 onboarding）
    node --eval '
        const os = require("os");
        const fs = require("fs");
        const path = require("path");
        const filePath = path.join(os.homedir(), ".claude.json");
        const content = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : {};
        fs.writeFileSync(filePath, JSON.stringify({ ...content, hasCompletedOnboarding: true }, null, 2), "utf-8");
    '

    # 配置 ~/.claude/settings.json
    mkdir -p "$HOME/.claude"
    node --eval '
        const os = require("os");
        const fs = require("fs");
        const path = require("path");
        const filePath = path.join(os.homedir(), ".claude", "settings.json");
        const apiKey = "'"$ANTHROPIC_API_KEY"'";
        const content = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : {};
        fs.writeFileSync(filePath, JSON.stringify({
            ...content,
            env: {
                ANTHROPIC_API_KEY: apiKey
            }
        }, null, 2), "utf-8");
    '

    echo "[配置] Anthropic 官方 API 配置完成 (模型: ${CLAUDE_MODEL})"

elif [ -n "$ZHIPU_API_KEY" ]; then
    # ===== 智谱 GLM5 模式（官方脚本） =====
    echo "[配置] 检测到 ZHIPU_API_KEY，使用智谱 GLM5 模式"
    curl -sO "https://cdn.bigmodel.cn/install/claude_code_env.sh"
    echo "$ZHIPU_API_KEY" | bash ./claude_code_env.sh
    rm -f ./claude_code_env.sh
    echo "[配置] 智谱 GLM5 配置完成"

elif [ -n "$MINIMAX_API_KEY" ]; then
    # ===== MiniMax 模式 =====
    echo "[配置] 检测到 MINIMAX_API_KEY，使用 MiniMax 模式"

    # 配置 ~/.claude.json（跳过 onboarding）
    node --eval '
        const os = require("os");
        const fs = require("fs");
        const path = require("path");
        const filePath = path.join(os.homedir(), ".claude.json");
        const content = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : {};
        fs.writeFileSync(filePath, JSON.stringify({ ...content, hasCompletedOnboarding: true }, null, 2), "utf-8");
    '

    # 配置 ~/.claude/settings.json
    mkdir -p "$HOME/.claude"
    node --eval '
        const os = require("os");
        const fs = require("fs");
        const path = require("path");
        const filePath = path.join(os.homedir(), ".claude", "settings.json");
        const apiKey = "'"$MINIMAX_API_KEY"'";
        const content = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : {};
        fs.writeFileSync(filePath, JSON.stringify({
            ...content,
            env: {
                ANTHROPIC_BASE_URL: "https://api.minimaxi.com/anthropic",
                ANTHROPIC_AUTH_TOKEN: apiKey,
                API_TIMEOUT_MS: "3000000",
                CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: 1,
                ANTHROPIC_MODEL: "MiniMax-M2.5",
                ANTHROPIC_SMALL_FAST_MODEL: "MiniMax-M2.5",
                ANTHROPIC_DEFAULT_SONNET_MODEL: "MiniMax-M2.5",
                ANTHROPIC_DEFAULT_OPUS_MODEL: "MiniMax-M2.5",
                ANTHROPIC_DEFAULT_HAIKU_MODEL: "MiniMax-M2.5"
            }
        }, null, 2), "utf-8");
    '

    echo "[配置] MiniMax 配置完成"

elif [ -n "$QWEN_API_KEY" ]; then
    # ===== 通义千问 Qwen 模式 =====
    echo "[配置] 检测到 QWEN_API_KEY，使用通义千问 Coding Plan 模式"

    CLAUDE_MODEL="${CLAUDE_MODEL:-qwen3.5-plus}"

    # 配置 ~/.claude.json（跳过 onboarding）
    node --eval '
        const os = require("os");
        const fs = require("fs");
        const path = require("path");
        const filePath = path.join(os.homedir(), ".claude.json");
        const content = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : {};
        fs.writeFileSync(filePath, JSON.stringify({ ...content, hasCompletedOnboarding: true }, null, 2), "utf-8");
    '

    # 配置 ~/.claude/settings.json
    mkdir -p "$HOME/.claude"
    node --eval '
        const os = require("os");
        const fs = require("fs");
        const path = require("path");
        const filePath = path.join(os.homedir(), ".claude", "settings.json");
        const apiKey = "'"$QWEN_API_KEY"'";
        const model = "'"$CLAUDE_MODEL"'";
        const content = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf-8")) : {};
        fs.writeFileSync(filePath, JSON.stringify({
            ...content,
            env: {
                ANTHROPIC_AUTH_TOKEN: apiKey,
                ANTHROPIC_BASE_URL: "https://coding.dashscope.aliyuncs.com/apps/anthropic",
                ANTHROPIC_MODEL: model
            }
        }, null, 2), "utf-8");
    '

    echo "[配置] 通义千问 Coding Plan 配置完成 (模型: ${CLAUDE_MODEL})"

elif [ -n "$CLAUDE_CODE_URL" ] && [ -n "$CLAUDE_CODE_KEY" ]; then
    # ===== 原有代理模式 =====
    echo "[配置] 使用代理模式: ${CLAUDE_CODE_URL}"
    curl -s ${CLAUDE_CODE_URL}/setup-claude-code.sh | bash -s -- --url ${CLAUDE_CODE_URL} --key ${CLAUDE_CODE_KEY}
    echo "[配置] Claude Code 配置完成"

else
    echo "[警告] 未设置 ANTHROPIC_API_KEY / ZHIPU_API_KEY / MINIMAX_API_KEY / QWEN_API_KEY 或 CLAUDE_CODE_URL/CLAUDE_CODE_KEY"
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
