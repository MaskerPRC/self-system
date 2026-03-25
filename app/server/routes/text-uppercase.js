import express from 'express';
const router = express.Router();

// Manifest endpoint - declares this app's ports for the canvas system
router.get('/api/text-uppercase/manifest', (req, res) => {
  res.json({
    appId: 'text-uppercase',
    appName: '文本转大写',
    route: '/text-uppercase',
    ports: {
      dataIn: [
        { id: 'text', name: '输入文本', valueType: 'string' }
      ],
      controlIn: [
        { id: 'convert', name: '执行转换' }
      ],
      dataOut: [
        { id: 'result', name: '转换结果', valueType: 'string' }
      ],
      controlOut: [
        { id: 'completed', name: '转换完成' }
      ],
    }
  });
});

export default router;
