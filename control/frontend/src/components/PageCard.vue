<template>
  <div class="card" :class="'s-' + page.status">
    <div class="card-top">
      <span class="dot" :class="page.status"></span>
      <span class="status font-mono">{{ statusMap[page.status] || page.status }}</span>
    </div>
    <div class="card-body">
      <h3>{{ page.title }}</h3>
      <p v-if="page.description" class="desc">{{ page.description }}</p>
      <code class="route font-mono">{{ page.route_path }}</code>
      <p v-if="page.conversations" class="from font-mono">{{ page.conversations?.title }}</p>
    </div>
    <div class="card-actions">
      <button class="open" @click="$emit('open', page)">
        打开
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
        </svg>
      </button>
      <button class="del" @click="$emit('delete', page.id)">删除</button>
    </div>
  </div>
</template>

<script setup>
defineProps({ page: Object })
defineEmits(['open', 'delete'])
const statusMap = { active: 'ACTIVE', inactive: 'OFFLINE', building: 'BUILDING' }
</script>

<style scoped>
.card {
  background: white; border: 2px solid #000; box-shadow: 3px 3px 0 #000;
  display: flex; flex-direction: column; transition: all .15s;
}
.card:hover { transform: translate(-1px,-1px); box-shadow: 4px 4px 0 #000; }
.card.s-inactive { opacity: .55; }
.card-top {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-bottom: 2px solid #000; background: #f8f8f8;
}
.dot { width: 7px; height: 7px; border-radius: 50%; }
.dot.active { background: #22c55e; }
.dot.building { background: #f59e0b; animation: pulse .8s infinite; }
.dot.inactive { background: #bbb; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
.status { font-size: 9px; font-weight: 700; color: #888; }
.card-body { flex: 1; padding: 14px; }
.card-body h3 { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
.desc { font-size: 11px; color: #777; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 6px; }
.route { font-size: 10px; color: #999; background: #f5f5f5; padding: 2px 6px; border: 1px solid #eee; }
.from { font-size: 9px; color: #bbb; margin-top: 6px; }
.card-actions { display: flex; border-top: 2px solid #000; }
.open {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;
  padding: 8px; background: #000; color: white; border: none;
  font-size: 11px; font-weight: 700; cursor: pointer;
}
.open:hover { background: #333; }
.del {
  padding: 8px 12px; background: white; border: none; border-left: 2px solid #000;
  font-size: 10px; font-weight: 600; color: #bbb; cursor: pointer;
}
.del:hover { background: #fee; color: #dc2626; }
</style>
