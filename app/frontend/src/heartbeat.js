import { onMounted, onUnmounted } from 'vue'

const HEARTBEAT_INTERVAL = 10000 // 10秒

/**
 * 心跳 composable
 * 每个交互页面必须调用: useHeartbeat('/your-route')
 * 心跳发往控制项目后端 (port 3000)
 */
export function useHeartbeat(routePath) {
  let timer = null

  const send = async () => {
    try {
      // 开发环境走 vite proxy，生产环境直连控制后端
      const base = import.meta.env.DEV ? '' : `http://${location.hostname}:3000`
      await fetch(`${base}/api/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routePath })
      })
    } catch (e) {
      console.warn('[Heartbeat] 失败:', e.message)
    }
  }

  onMounted(() => {
    send()
    timer = setInterval(send, HEARTBEAT_INTERVAL)
  })

  onUnmounted(() => {
    if (timer) { clearInterval(timer); timer = null }
  })
}
