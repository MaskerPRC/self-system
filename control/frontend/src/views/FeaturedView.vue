<template>
  <div class="absolute inset-0 w-full h-full flex flex-col">
    <!-- 有精选页：全屏 iframe -->
    <template v-if="featured">
      <div class="flex items-center justify-between px-5 py-3 bg-paper border-b border-stone-200 shrink-0">
        <div class="flex items-center gap-3 min-w-0">
          <i class="ph-fill ph-star text-amber-500"></i>
          <h3 class="font-serif font-semibold text-ink-900 truncate">{{ featured.title }}</h3>
          <span class="text-xs font-mono text-ink-400 bg-surface px-2 py-0.5 rounded border border-stone-100 shrink-0">{{ featured.route_path }}</span>
        </div>
        <div class="flex items-center gap-1 shrink-0 ml-3">
          <button
            @click="openInNewWindow"
            class="w-8 h-8 rounded-full flex items-center justify-center text-ink-500 hover:text-brand-600 hover:bg-brand-50 transition-colors"
            title="新窗口打开"
          >
            <i class="ph ph-arrow-up-right text-lg"></i>
          </button>
          <button
            @click="refreshIframe"
            class="w-8 h-8 rounded-full flex items-center justify-center text-ink-500 hover:text-brand-600 hover:bg-brand-50 transition-colors"
            title="刷新"
          >
            <i class="ph ph-arrows-clockwise text-lg"></i>
          </button>
        </div>
      </div>
      <div class="flex-1 min-h-0 relative">
        <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-surface">
          <div class="flex flex-col items-center gap-3 text-ink-400">
            <i class="ph ph-circle-notch text-3xl animate-spin"></i>
            <span class="text-sm">加载中...</span>
          </div>
        </div>
        <iframe
          ref="iframeRef"
          :src="iframeSrc"
          class="w-full h-full border-0"
          @load="loading = false"
        ></iframe>
      </div>
    </template>

    <!-- 无精选页：空状态 -->
    <div v-else class="flex-1 flex flex-col items-center justify-center text-ink-400 text-center px-6">
      <div class="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mb-6">
        <i class="ph ph-star text-4xl text-ink-300"></i>
      </div>
      <h3 class="font-serif text-xl font-medium text-ink-800 mb-2">尚未设置精选页</h3>
      <p class="text-ink-500">前往<router-link to="/" class="text-brand-600 hover:underline mx-1">页面集合</router-link>，点击卡片上的星标设为精选。</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'

const featured = ref(null)
const loading = ref(true)
const iframeRef = ref(null)
const appBaseUrl = ref('')
const iframeSrc = ref('')

async function fetchConfig() {
  try {
    const r = await fetch('/api/config')
    const d = await r.json()
    appBaseUrl.value = d.appExternalUrl || `http://${location.hostname}:5174`
  } catch {
    appBaseUrl.value = `http://${location.hostname}:5174`
  }
}

async function fetchFeatured() {
  try {
    const r = await fetch('/api/pages/featured')
    const d = await r.json()
    featured.value = d.data || null
    if (featured.value) {
      loading.value = true
      iframeSrc.value = `${appBaseUrl.value}${featured.value.route_path}`
    }
  } catch {
    featured.value = null
  }
}

function openInNewWindow() {
  if (iframeSrc.value) window.open(iframeSrc.value, '_blank')
}

function refreshIframe() {
  if (iframeRef.value) {
    loading.value = true
    iframeRef.value.src = iframeSrc.value
  }
}

onMounted(async () => {
  await fetchConfig()
  await fetchFeatured()
})
</script>
