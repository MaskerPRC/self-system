import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 控制后端地址：Docker 环境通过网络名称访问，本地开发用 localhost
const controlBackend = process.env.CONTROL_BACKEND_URL || 'http://localhost:3000'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174,
    host: '0.0.0.0',
    proxy: {
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
