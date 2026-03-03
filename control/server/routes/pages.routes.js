import express from 'express';
import { getSupabase } from '../modules/supabase.js';
import { getAllPages, getActivePages, registerHeartbeat } from '../modules/heartbeat.js';

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
