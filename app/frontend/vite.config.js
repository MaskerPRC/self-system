import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174,
    proxy: {
      '/api/app': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/api/heartbeat': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
