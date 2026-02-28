import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// 控制后端地址：Docker 环境通过网络名称访问，本地开发用 localhost
const controlBackend = process.env.CONTROL_BACKEND_URL || 'http://localhost:3000'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Digital Avatar',
        short_name: 'Avatar',
        description: '我的数字分身',
        theme_color: '#667eea',
        background_color: '#f7f8fc',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5174,
    host: '0.0.0.0',
    proxy: {
      '/api/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/api/app': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/api/heartbeat': {
        target: controlBackend,
        changeOrigin: true
      },
      '/api/pages': {
        target: controlBackend,
        changeOrigin: true
      }
    },
    watch: {
      usePolling: true
    }
  }
})
