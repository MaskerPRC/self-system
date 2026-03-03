import express from 'express';
import { getSkills, getSkill, createSkill, updateSkill, deleteSkill } from '../modules/skills.js';

const router = express.Router();

router.get('/api/skills', async (req, res) => {
  try {
    const data = await getSkills();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/api/skills/:name', async (req, res) => {
  try {
    const data = await getSkill(req.params.name);
    if (!data) return res.status(404).json({ success: false, error: 'Skill 不存在' });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/api/skills', async (req, res) => {
  try {
    const { name, description, content } = req.body;
    if (!name || !description) return res.status(400).json({ success: false, error: 'name 和 description 必填' });
    const data = await createSkill(name, description, content || '');
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/api/skills/:name', async (req, res) => {
  try {
    const { description, content } = req.body;
    const data = await updateSkill(req.params.name, description, content);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/api/skills/:name', async (req, res) => {
  try {
    await deleteSkill(req.params.name);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
