<template>
  <div class="home">
    <h1>Digital Avatar</h1>
    <p class="sub">数字渐进式分身 · 交互中心</p>

    <div v-if="pages.length" class="page-list">
      <router-link v-for="p in pages" :key="p.id" :to="p.route_path" class="page-item">
        <span class="dot"></span>
        <span class="name">{{ p.title }}</span>
        <span class="path">{{ p.route_path }}</span>
      </router-link>
    </div>
    <p v-else class="empty">暂无交互页面，在控制台对话中创建</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const pages = ref([])

onMounted(async () => {
  try {
    // 从控制后端获取活跃页面列表
    const base = import.meta.env.DEV ? 'http://localhost:3000' : `http://${location.hostname}:3000`
    const r = await fetch(`${base}/api/pages/active`)
    const d = await r.json()
    if (d.success) pages.value = d.data
  } catch {}
})
</script>

<style scoped>
.home { max-width: 700px; margin: 0 auto; padding: 60px 20px; }
h1 { font-size: 28px; font-weight: 900; text-transform: uppercase; letter-spacing: -.02em; text-align: center; }
.sub { text-align: center; font-size: 13px; color: #888; margin-top: 6px; margin-bottom: 40px; }
.page-list { display: flex; flex-direction: column; gap: 8px; }
.page-item {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; background: white; border: 2px solid #000;
  text-decoration: none; color: #1a1a1a; box-shadow: 3px 3px 0 #000; transition: all .15s;
}
.page-item:hover { transform: translate(1px,1px); box-shadow: 2px 2px 0 #000; background: #f5f5f5; }
.dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; flex-shrink: 0; }
.name { font-weight: 600; font-size: 14px; }
.path { margin-left: auto; font-size: 11px; color: #aaa; font-family: monospace; }
.empty { text-align: center; color: #bbb; font-size: 14px; }
</style>
