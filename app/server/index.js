import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// 健康检查
app.get('/api/app/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== 应用路由 ====================
// 每个功能模块放在 routes/ 目录下的独立文件中
// Claude Code 在下方通过 import + app.use() 引入路由文件
// --- APP ROUTES START ---

// --- APP ROUTES END ---

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[App Server] http://localhost:${PORT}`);
});
