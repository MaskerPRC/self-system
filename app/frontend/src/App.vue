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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const authLoading = ref(true)
const needLogin = ref(false)
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

// Intercept 401 globally, but not for public routes
const _origFetch = window.fetch
window.fetch = async (...args) => {
  const res = await _origFetch(...args)
  if (res.status === 401 && !(args[0] + '').includes('/api/auth/')) {
    if (!isCurrentRoutePublic.value) {
      needLogin.value = true
    }
  }
  return res
}

onMounted(() => { checkAuth() })
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
