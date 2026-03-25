import express from 'express';

const router = express.Router();

const CONTROL_BACKEND = process.env.CONTROL_BACKEND_URL || 'http://localhost:3000';

const DEFAULT_MANIFEST = {
  name: 'Digital Avatar',
  short_name: 'Avatar',
  description: '我的数字分身',
  theme_color: '#667eea',
  background_color: '#f7f8fc',
  display: 'standalone',
  scope: '/',
  start_url: '/',
  icons: [
    { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
    { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
    { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
};

router.get('/api/pwa/manifest.json', async (req, res) => {
  const route = req.query.route;

  if (!route || route === '/') {
    return res.json(DEFAULT_MANIFEST);
  }

  try {
    const r = await fetch(`${CONTROL_BACKEND}/api/pages/active`);
    const d = await r.json();

    if (!d.success) return res.json(DEFAULT_MANIFEST);

    const page = d.data.find(p => p.route_path === route);
    if (!page || (!page.pwa_name && !page.pwa_icon && !page.pwa_theme_color)) {
      return res.json(DEFAULT_MANIFEST);
    }

    const name = page.pwa_name || page.title || 'Digital Avatar';
    const themeColor = page.pwa_theme_color || '#667eea';
    const iconSrc = page.pwa_icon || '/pwa-192x192.png';

    const manifest = {
      name,
      short_name: name.length > 12 ? name.slice(0, 12) : name,
      description: page.description || name,
      theme_color: themeColor,
      background_color: '#f7f8fc',
      display: 'standalone',
      scope: '/',
      start_url: route,
      icons: [
        { src: iconSrc, sizes: '192x192', type: 'image/png' },
        { src: iconSrc, sizes: '512x512', type: 'image/png' },
        { src: iconSrc, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    };

    res.json(manifest);
  } catch {
    res.json(DEFAULT_MANIFEST);
  }
});

export default router;
