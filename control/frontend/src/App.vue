<template>
  <!-- Loading -->
  <div v-if="authLoading" class="min-h-screen flex items-center justify-center bg-surface">
    <div class="text-ink-400 text-sm">加载中...</div>
  </div>

  <!-- Login -->
  <div v-else-if="needLogin" class="min-h-screen flex items-center justify-center bg-surface px-4">
    <form @submit.prevent="handleLogin" class="w-full max-w-sm">
      <div class="flex items-center justify-center mb-8">
        <div class="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center">
          <i class="ph-fill ph-fingerprint text-3xl text-brand-500"></i>
        </div>
      </div>
      <h1 class="text-xl font-serif font-semibold text-ink-900 text-center mb-6">数字分身控制台</h1>
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-ink-600 mb-1.5">用户名</label>
          <input v-model="loginForm.username" type="text" autocomplete="username"
            class="w-full px-3.5 py-2.5 text-sm bg-paper border border-stone-200 rounded-xl outline-none focus:border-brand-400 transition-colors" />
        </div>
        <div>
          <label class="block text-xs font-medium text-ink-600 mb-1.5">密码</label>
          <input v-model="loginForm.password" type="password" autocomplete="current-password"
            class="w-full px-3.5 py-2.5 text-sm bg-paper border border-stone-200 rounded-xl outline-none focus:border-brand-400 transition-colors" />
        </div>
        <div v-if="loginError" class="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {{ loginError }}
        </div>
        <button type="submit" :disabled="loginLoading"
          class="w-full py-2.5 bg-brand-500 text-white rounded-xl text-sm font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors">
          {{ loginLoading ? '登录中...' : '登录' }}
        </button>
      </div>
    </form>
  </div>

  <!-- Main App -->
  <div v-else class="bg-surface text-ink-900 overflow-hidden flex flex-col font-sans antialiased selection:bg-brand-100 selection:text-brand-600 view-container">
    <!-- Main area: flex row for content + log panel -->
    <div class="flex-1 flex min-h-0">
      <!-- Page content -->
      <main class="flex-1 min-w-0 relative overflow-hidden">
        <router-view />
      </main>

      <!-- Resizable divider (desktop only) -->
      <div
        v-if="showLogs"
        class="hidden sm:flex w-1.5 cursor-col-resize items-center justify-center bg-stone-200/60 hover:bg-brand-300/60 active:bg-brand-400/60 transition-colors shrink-0"
        @mousedown="startResize"
        @touchstart.prevent="startResizeTouch"
      >
        <div class="w-0.5 h-8 bg-stone-400/40 rounded-full"></div>
      </div>

      <!-- Log panel: desktop = side panel, mobile = full-screen overlay -->
      <div
        v-if="showLogs"
        class="fixed inset-0 z-[90] sm:static sm:z-auto shrink-0"
        :style="panelStyle"
      >
        <LogPanel
          :appLines="appLogLines"
          :controlLines="controlLogLines"
          :activeTab="activeLogTab"
          @update:activeTab="activeLogTab = $event"
          @close="showLogs = false"
          @clear="clearCurrentLogs"
        />
      </div>
    </div>

    <!-- Bottom Navigation -->
    <nav class="fixed bottom-3 left-2 right-2 bg-paper/80 backdrop-blur-xl border border-stone-200 px-2 py-1.5 flex gap-0.5 z-50 rounded-2xl shadow-pill sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:rounded-full sm:px-1.5 sm:gap-1">
      <router-link
        to="/"
        class="relative flex-1 sm:flex-initial px-2 sm:px-6 py-2.5 rounded-full text-sm font-medium transition-colors duration-300 flex items-center justify-center gap-2 no-underline whitespace-nowrap"
        :class="$route.name === 'collection' ? 'text-brand-700 bg-brand-50' : 'text-ink-500 hover:text-ink-900 bg-transparent hover:bg-stone-50'"
      >
        <i class="text-xl sm:text-lg" :class="$route.name === 'collection' ? 'ph-fill ph-cards' : 'ph ph-cards'"></i>
        <span class="hidden sm:inline">页面集合</span>
      </router-link>

      <router-link
        to="/featured"
        class="relative flex-1 sm:flex-initial px-2 sm:px-6 py-2.5 rounded-full text-sm font-medium transition-colors duration-300 flex items-center justify-center gap-2 no-underline whitespace-nowrap"
        :class="$route.name === 'featured' ? 'text-amber-700 bg-amber-50' : 'text-ink-500 hover:text-ink-900 bg-transparent hover:bg-stone-50'"
      >
        <i class="text-xl sm:text-lg" :class="$route.name === 'featured' ? 'ph-fill ph-star' : 'ph ph-star'"></i>
        <span class="hidden sm:inline">精选</span>
      </router-link>

      <router-link
        to="/chat"
        class="relative flex-1 sm:flex-initial px-2 sm:px-6 py-2.5 rounded-full text-sm font-medium transition-colors duration-300 flex items-center justify-center gap-2 no-underline whitespace-nowrap"
        :class="$route.name === 'chat' ? 'text-brand-700 bg-brand-50' : 'text-ink-500 hover:text-ink-900 bg-transparent hover:bg-stone-50'"
      >
        <i class="text-xl sm:text-lg" :class="$route.name === 'chat' ? 'ph-fill ph-chat-teardrop' : 'ph ph-chat-teardrop'"></i>
        <span class="hidden sm:inline">AI 对话</span>
      </router-link>

      <button
        @click="toggleLogs"
        class="relative flex-1 sm:flex-initial px-2 sm:px-4 py-2.5 rounded-full text-sm font-medium transition-colors duration-300 flex items-center justify-center no-underline whitespace-nowrap"
        :class="showLogs ? 'text-brand-700 bg-brand-50' : 'text-ink-500 hover:text-ink-900 bg-transparent hover:bg-stone-50'"
      >
        <i class="ph ph-terminal-window text-xl sm:text-lg"></i>
        <span v-if="hasNewLogs" class="absolute top-2 right-2 sm:top-2.5 sm:right-3 w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
      </button>

      <button
        @click="showSettings = true"
        class="relative flex-1 sm:flex-initial px-2 sm:px-4 py-2.5 rounded-full text-sm font-medium transition-colors duration-300 flex items-center justify-center no-underline whitespace-nowrap text-ink-500 hover:text-ink-900 bg-transparent hover:bg-stone-50"
      >
        <i class="ph ph-gear-six text-xl sm:text-lg"></i>
      </button>
    </nav>

    <!-- Settings Modal -->
    <SettingsModal :visible="showSettings" @close="showSettings = false" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import SettingsModal from './components/SettingsModal.vue'
import LogPanel from './components/LogPanel.vue'

const API = ''
const MAX_LOG_LINES = 500

// ---- Auth ----

const authLoading = ref(true)
const needLogin = ref(false)
const loginForm = ref({ username: '', password: '' })
const loginError = ref('')
const loginLoading = ref(false)

async function checkAuth() {
  try {
    const r = await fetch(`${API}/api/auth/check`)
    const d = await r.json()
    needLogin.value = d.authEnabled && !d.authenticated
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
    const r = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginForm.value)
    })
    const d = await r.json()
    if (d.success) {
      needLogin.value = false
      connectWs()
    } else {
      loginError.value = d.error || '登录失败'
    }
  } catch (e) {
    loginError.value = '网络错误'
  } finally {
    loginLoading.value = false
  }
}

// Intercept 401 responses globally
const _origFetch = window.fetch
window.fetch = async (...args) => {
  const res = await _origFetch(...args)
  if (res.status === 401 && !(args[0] + '').includes('/api/auth/')) {
    needLogin.value = true
  }
  return res
}

// ---- App State ----

const showSettings = ref(false)
const showLogs = ref(false)
const activeLogTab = ref('app')
const appLogLines = ref([])
const controlLogLines = ref([])
const hasNewLogs = ref(false)
const logPanelWidth = ref(420)
let ws = null

// ---- Resize ----

const isMobile = ref(window.innerWidth < 640)
window.addEventListener('resize', () => { isMobile.value = window.innerWidth < 640 })

const panelStyle = computed(() => {
  if (isMobile.value) return {}
  return { width: logPanelWidth.value + 'px' }
})

let resizing = false
let startX = 0
let startW = 0

function startResize(e) {
  resizing = true
  startX = e.clientX
  startW = logPanelWidth.value
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function startResizeTouch(e) {
  resizing = true
  startX = e.touches[0].clientX
  startW = logPanelWidth.value
  document.addEventListener('touchmove', onResizeTouch)
  document.addEventListener('touchend', stopResize)
}

function onResize(e) {
  if (!resizing) return
  const delta = startX - e.clientX
  const maxW = window.innerWidth * 0.6
  logPanelWidth.value = Math.max(280, Math.min(maxW, startW + delta))
}

function onResizeTouch(e) {
  if (!resizing) return
  const delta = startX - e.touches[0].clientX
  const maxW = window.innerWidth * 0.6
  logPanelWidth.value = Math.max(280, Math.min(maxW, startW + delta))
}

function stopResize() {
  resizing = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  document.removeEventListener('touchmove', onResizeTouch)
  document.removeEventListener('touchend', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// ---- Log Management ----

const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07/g
function stripAnsi(str) {
  return str.replace(ANSI_RE, '')
}

function appendLogText(text, target) {
  if (!text) return
  const newLines = stripAnsi(text).split('\n').filter(l => l.trim())
  if (!newLines.length) return
  target.value = [...target.value, ...newLines].slice(-MAX_LOG_LINES)
  if (!showLogs.value) hasNewLogs.value = true
}

async function fetchInitialLogs() {
  try {
    const [appRes, ctrlRes] = await Promise.all([
      fetch(`${API}/api/app/logs?tail=200`),
      fetch(`${API}/api/control/logs?tail=200`)
    ])
    const [appData, ctrlData] = await Promise.all([appRes.json(), ctrlRes.json()])
    if (appData.success && appData.data) {
      appLogLines.value = stripAnsi(appData.data).split('\n').filter(l => l.trim()).slice(-MAX_LOG_LINES)
    }
    if (ctrlData.success && ctrlData.data) {
      controlLogLines.value = stripAnsi(ctrlData.data).split('\n').filter(l => l.trim()).slice(-MAX_LOG_LINES)
    }
  } catch {}
}

function toggleLogs() {
  showLogs.value = !showLogs.value
  if (showLogs.value) {
    hasNewLogs.value = false
    fetchInitialLogs()
  }
}

function clearCurrentLogs() {
  if (activeLogTab.value === 'app') {
    appLogLines.value = []
  } else {
    controlLogLines.value = []
  }
}

// ---- WebSocket ----

function connectWs() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = import.meta.env.DEV ? 'ws://localhost:3000' : `${protocol}//${location.host}`
  ws = new WebSocket(url)
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      if (data.type === 'app_logs' && data.logs) {
        appendLogText(data.logs, appLogLines)
      } else if (data.type === 'control_logs' && data.logs) {
        appendLogText(data.logs, controlLogLines)
      }
    } catch {}
  }
  ws.onclose = () => { setTimeout(connectWs, 5000) }
}

onMounted(async () => {
  await checkAuth()
  if (!needLogin.value) {
    connectWs()
  }
})

onUnmounted(() => {
  if (ws) ws.close()
  stopResize()
})
</script>
