import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index.js'
import { registerSW } from 'virtual:pwa-register'

createApp(App).use(router).mount('#app')

// 注册 Service Worker，自动更新
registerSW({ immediate: true })
