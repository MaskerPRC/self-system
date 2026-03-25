import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getSupabase } from '../modules/supabase.js';
import { getAllPages, getActivePages, registerHeartbeat } from '../modules/heartbeat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PWA_ICONS_DIR = path.resolve(__dirname, '../../../app/frontend/public/pwa-icons');

// 确保 pwa-icons 目录存在
fs.mkdirSync(PWA_ICONS_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只允许上传图片文件'));
  }
});

const router = express.Router();

// ==================== 页面 API ====================

router.get('/api/pages', async (req, res) => {
  try {
    const data = await getAllPages();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/pages/active', async (req, res) => {
  try {
    const data = await getActivePages();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/pages/:id', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('interactive_pages').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 精选页 API ====================

router.get('/api/pages/featured', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('interactive_pages')
      .select('*, conversations(title)')
      .eq('is_featured', true)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/pages/:id/feature', async (req, res) => {
  try {
    const supabase = getSupabase();
    // 先取消所有精选
    await supabase.from('interactive_pages').update({ is_featured: false }).eq('is_featured', true);
    // 设置新精选
    const { error } = await supabase.from('interactive_pages').update({ is_featured: true }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/pages/:id/feature', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('interactive_pages').update({ is_featured: false }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 公开页面 API ====================

router.get('/api/pages/public-routes', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('interactive_pages')
      .select('route_path')
      .eq('is_public', true);
    if (error) throw error;
    res.json({ success: true, data: data.map(p => p.route_path) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/pages/:id/public', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('interactive_pages').update({ is_public: true, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/pages/:id/public', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('interactive_pages').update({ is_public: false, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== PWA 配置 API ====================

router.get('/api/pages/:id/pwa', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('interactive_pages')
      .select('id, pwa_name, pwa_icon, pwa_theme_color')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/api/pages/:id/pwa', async (req, res) => {
  try {
    const { pwa_name, pwa_theme_color } = req.body;
    const supabase = getSupabase();
    const { error } = await supabase
      .from('interactive_pages')
      .update({ pwa_name, pwa_theme_color, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/pages/:id/pwa-icon', upload.single('icon'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: '未上传文件' });

    const pageId = req.params.id;
    const ext = path.extname(req.file.originalname) || '.png';
    const filename = `${pageId}${ext}`;
    const filepath = path.join(PWA_ICONS_DIR, filename);

    fs.writeFileSync(filepath, req.file.buffer);

    const iconPath = `/pwa-icons/${filename}`;
    const supabase = getSupabase();
    const { error } = await supabase
      .from('interactive_pages')
      .update({ pwa_icon: iconPath, updated_at: new Date().toISOString() })
      .eq('id', pageId);
    if (error) throw error;

    res.json({ success: true, data: { pwa_icon: iconPath } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/pages/:id/pwa-icon', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('interactive_pages')
      .select('pwa_icon')
      .eq('id', req.params.id)
      .single();

    if (data?.pwa_icon) {
      const filepath = path.join(PWA_ICONS_DIR, path.basename(data.pwa_icon));
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }

    const { error } = await supabase
      .from('interactive_pages')
      .update({ pwa_icon: null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== 心跳 API（应用项目调用） ====================

router.post('/api/heartbeat', async (req, res) => {
  const { routePath } = req.body;
  if (!routePath) return res.status(400).json({ success: false, error: 'routePath 必填' });

  try {
    await registerHeartbeat(routePath);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
