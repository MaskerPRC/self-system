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
// Claude Code 会在下方添加新的 API 路由
// --- APP ROUTES START ---

// --- APP ROUTES END ---

app.listen(PORT, () => {
  console.log(`[App Server] http://localhost:${PORT}`);
});
