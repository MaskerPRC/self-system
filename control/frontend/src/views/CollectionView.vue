<template>
  <div class="collection-page">
    <header class="page-header">
      <div class="header-left">
        <h1>交互集合</h1>
        <span class="count font-mono">{{ pages.length }}</span>
      </div>
      <div class="header-right">
        <span class="status-dot" :class="appRunning ? 'green' : 'gray'"></span>
        <span class="font-mono status-text">App {{ appRunning ? '运行中' : '停止' }}</span>
        <button @click="toggleApp" class="btn">{{ appRunning ? '停止' : '启动' }}</button>
        <button @click="fetchPages" class="btn">刷新</button>
      </div>
    </header>

    <div class="grid" v-if="pages.length">
      <PageCard v-for="p in pages" :key="p.id" :page="p" @open="openPage" @delete="deletePage" />
    </div>
    <div v-else class="empty">
      <p>暂无交互页面</p>
      <p class="font-mono hint">前往「对话」页，通过对话创建交互页面</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import PageCard from '../components/PageCard.vue'

const API = import.meta.env.DEV ? '' : `http://${location.hostname}:3000`
const pages = ref([])
const appRunning = ref(false)
let timer = null

async function fetchPages() {
  try {
    const r = await fetch(`${API}/api/pages`);
    const d = await r.json();
    if (d.success) pages.value = d.data;
  } catch {}
}

async function fetchStatus() {
  try {
    const r = await fetch(`${API}/api/app/status`);
    const d = await r.json();
    if (d.success) appRunning.value = d.data.frontend.running;
  } catch {}
}

async function toggleApp() {
  const action = appRunning.value ? 'stop' : 'start'
  await fetch(`${API}/api/app/${action}`, { method: 'POST' })
  setTimeout(fetchStatus, 2000)
}

function openPage(p) { window.open(`http://localhost:5174${p.route_path}`, '_blank') }

async function deletePage(id) {
  if (!confirm('确定删除？')) return
  await fetch(`${API}/api/pages/${id}`, { method: 'DELETE' })
  fetchPages()
}

onMounted(() => {
  fetchPages(); fetchStatus()
  timer = setInterval(() => { fetchPages(); fetchStatus(); }, 10000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
.collection-page { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.page-header {
  height: 52px; background: white; border-bottom: 2px solid #000;
  display: flex; align-items: center; justify-content: space-between; padding: 0 20px;
  flex-shrink: 0;
}
.header-left { display: flex; align-items: center; gap: 10px; }
.header-left h1 { font-size: 15px; font-weight: 900; text-transform: uppercase; }
.count {
  font-size: 10px; background: #eee; border: 1px solid #ddd; padding: 1px 6px;
}
.header-right { display: flex; align-items: center; gap: 10px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; }
.status-dot.green { background: #22c55e; }
.status-dot.gray { background: #bbb; }
.status-text { font-size: 11px; color: #666; }
.btn {
  background: white; border: 2px solid #000; font-weight: 700; font-size: 10px;
  padding: 4px 10px; cursor: pointer; box-shadow: 2px 2px 0 #000; transition: all .1s;
}
.btn:hover { transform: translate(1px,1px); box-shadow: 1px 1px 0 #000; }
.grid {
  flex: 1; padding: 20px; overflow-y: auto;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px; align-content: start;
}
.empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #aaa; }
.empty p { font-size: 15px; font-weight: 600; }
.hint { font-size: 12px; margin-top: 8px; color: #ccc; }
</style>
