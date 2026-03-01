<template>
  <div class="app-shell">
    <!-- Loading -->
    <div v-if="authLoading" class="auth-center">
      <p class="auth-hint">加载中...</p>
    </div>

    <!-- Login (only for non-public routes) -->
    <div v-else-if="needLogin && !isCurrentRoutePublic" class="auth-center">
      <form @submit.prevent="handleLogin" class="auth-form">
        <h1 class="auth-title">Digital Avatar</h1>
        <div class="auth-field">
          <label>用户名</label>
          <input v-model="loginForm.username" type="text" autocomplete="username" />
        </div>
        <div class="auth-field">
          <label>密码</label>
          <input v-model="loginForm.password" type="password" autocomplete="current-password" />
        </div>
        <p v-if="loginError" class="auth-error">{{ loginError }}</p>
        <button type="submit" :disabled="loginLoading" class="auth-btn">
          {{ loginLoading ? '登录中...' : '登录' }}
        </button>
      </form>
    </div>

    <!-- App content -->
    <router-view v-else />

    <!-- Debug Console (visible when ?debug=1) -->
    <button v-if="isDebug && debugMinimized" class="debug-fab" @click="debugMinimized = false">
      Console ({{ debugLogs.length }})
    </button>
    <div v-if="isDebug && !debugMinimized" class="debug-panel">
      <div class="debug-header">
        <span class="debug-title">Console <span class="debug-count">{{ debugLogs.length }}</span></span>
        <div class="debug-btns">
          <button @click="clearDebugLogs">Clear</button>
          <button @click="debugMinimized = true">−</button>
        </div>
      </div>
      <div ref="debugBody" class="debug-body">
        <div v-if="!debugLogs.length" class="debug-empty">暂无日志</div>
        <div v-for="(log, i) in debugLogs" :key="i" class="debug-line" :class="'debug-' + log.type">
          <span class="debug-time">{{ log.time }}</span>
          <pre class="debug-msg">{{ log.msg }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const authLoading = ref(true)
const needLogin = ref(false)
const isPublicPage = ref(false)
const publicRoutes = ref(new Set())
const loginForm = ref({ username: '', password: '' })
const loginError = ref('')
const loginLoading = ref(false)

const isCurrentRoutePublic = computed(() => {
  return publicRoutes.value.has(route.path)
})

async function fetchPublicRoutes() {
  try {
    const r = await fetch('/api/auth/public-routes')
    const d = await r.json()
    if (d.success && Array.isArray(d.data)) {
      publicRoutes.value = new Set(d.data)
    }
  } catch {}
}

async function checkAuth() {
  try {
    // Check if current path is a public route (fetch from control server)
    const currentPath = window.location.pathname
    try {
      const base = import.meta.env.DEV ? '' : `http://${location.hostname}:3000`
      const pr = await fetch(`${base}/api/pages/public-routes`)
      const pd = await pr.json()
      if (pd.success && Array.isArray(pd.data)) {
        if (pd.data.some(route => currentPath === route || currentPath.startsWith(route + '/'))) {
          isPublicPage.value = true
          needLogin.value = false
          authLoading.value = false
          return
        }
      }
    } catch {}

    await Promise.all([
      fetchPublicRoutes(),
      (async () => {
        const r = await fetch('/api/auth/check')
        const d = await r.json()
        needLogin.value = d.authEnabled && !d.authenticated
      })()
    ])
  } catch {
    needLogin.value = false
  } finally {
    authLoading.value = false
  }
}

async function handleLogin() {
  loginLoading.value = true
  loginError.value = ''
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm.value)
    })
    const d = await r.json()
    if (d.success) {
      needLogin.value = false
    } else {
      loginError.value = d.error || '登录失败'
    }
  } catch {
    loginError.value = '网络错误'
  } finally {
    loginLoading.value = false
  }
}

// Intercept 401 globally (skip for public pages)
const _origFetch = window.fetch
window.fetch = async (...args) => {
  const res = await _origFetch(...args)
  if (res.status === 401 && !(args[0] + '').includes('/api/auth/') && !isPublicPage.value) {
    if (!isCurrentRoutePublic.value) {
      needLogin.value = true
    }
  }
  return res
}

onMounted(() => { checkAuth() })

// ---- Debug Console (when ?debug=1) ----
const isDebug = ref(false)
const debugMinimized = ref(false)
const debugLogs = ref([])
const debugBody = ref(null)

function clearDebugLogs() {
  debugLogs.value = []
}

function formatDebugArg(a) {
  if (a === null) return 'null'
  if (a === undefined) return 'undefined'
  if (typeof a === 'string') return a
  if (a instanceof Error) return `${a.message}\n${a.stack || ''}`
  try { return JSON.stringify(a, null, 2) } catch { return String(a) }
}

function initDebug() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('debug') !== '1') return
  isDebug.value = true

  const origLog = console.log
  const origWarn = console.warn
  const origError = console.error

  function addLog(type, args) {
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    debugLogs.value.push({ type, time, msg: Array.from(args).map(formatDebugArg).join(' ') })
    if (debugLogs.value.length > 500) debugLogs.value = debugLogs.value.slice(-300)
    nextTick(() => {
      if (debugBody.value) debugBody.value.scrollTop = debugBody.value.scrollHeight
    })
  }

  console.log = (...args) => { origLog.apply(console, args); addLog('log', args) }
  console.warn = (...args) => { origWarn.apply(console, args); addLog('warn', args) }
  console.error = (...args) => { origError.apply(console, args); addLog('error', args) }

  window.addEventListener('error', e => {
    addLog('error', [`[Uncaught] ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`])
  })
  window.addEventListener('unhandledrejection', e => {
    addLog('error', [`[UnhandledRejection] ${e.reason}`])
  })
}
initDebug()
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', sans-serif; background: #fafafa; color: #1a1a1a; }
.app-shell { min-height: 100vh; }
.auth-center { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
.auth-hint { color: #999; font-size: 14px; }
.auth-form { width: 100%; max-width: 360px; }
.auth-title { text-align: center; font-size: 22px; font-weight: 700; margin-bottom: 32px; }
.auth-field { margin-bottom: 16px; }
.auth-field label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: #555; }
.auth-field input { width: 100%; padding: 10px 12px; font-size: 14px; border: 1.5px solid #ddd; border-radius: 8px; outline: none; transition: border-color 0.2s; }
.auth-field input:focus { border-color: #333; }
.auth-error { color: #dc2626; font-size: 13px; margin-bottom: 12px; padding: 8px 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; }
.auth-btn { width: 100%; padding: 11px; background: #1a1a1a; color: #fff; font-size: 14px; font-weight: 600; border: none; border-radius: 8px; cursor: pointer; transition: background 0.2s; }
.auth-btn:hover { background: #333; }
.auth-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>

<style scoped>
.debug-fab {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 99999;
  background: #1a1a2e;
  color: #a5b4fc;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 20px;
  padding: 8px 16px;
  font-size: 12px;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.debug-fab:hover { background: #242450; }
.debug-panel {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 350px;
  max-width: 90vw;
  background: #1a1a2e;
  color: #d4d4d4;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  z-index: 99999;
  box-shadow: -2px 0 16px rgba(0,0,0,0.4);
}
.debug-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #16162a;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  min-height: 38px;
}
.debug-title { font-weight: 600; font-size: 12px; color: #a5b4fc; }
.debug-count {
  background: rgba(255,255,255,0.1);
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  margin-left: 6px;
  color: #999;
}
.debug-btns { display: flex; gap: 6px; align-items: center; }
.debug-btns button {
  background: none;
  border: 1px solid rgba(255,255,255,0.1);
  color: #999;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: inherit;
}
.debug-btns button:hover { color: #fff; border-color: rgba(255,255,255,0.2); }
.debug-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.debug-empty {
  color: #555;
  text-align: center;
  padding: 40px 0;
  font-size: 12px;
}
.debug-line {
  display: flex;
  gap: 8px;
  padding: 3px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.02);
  line-height: 1.5;
}
.debug-time { color: #555; flex-shrink: 0; }
.debug-msg {
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  font-family: inherit;
  font-size: inherit;
}
.debug-log { color: #d4d4d4; }
.debug-warn { color: #e5c07b; background: rgba(229,192,123,0.05); }
.debug-error { color: #e06c75; background: rgba(224,108,117,0.05); }
</style>
