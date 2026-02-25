<template>
  <aside class="sidebar">
    <div class="sidebar-top">
      <span class="title">对话</span>
      <button class="add-btn" @click="$emit('create')">+</button>
    </div>
    <div class="list">
      <div v-if="!conversations.length" class="empty font-mono">暂无对话</div>
      <div
        v-for="c in conversations" :key="c.id"
        class="item" :class="{ active: c.id === activeId }"
        @click="$emit('select', c.id)"
      >
        <div class="info">
          <p class="name">{{ c.title }}</p>
          <p class="time font-mono">{{ fmt(c.updated_at) }}</p>
        </div>
        <button class="rm" @click.stop="$emit('delete', c.id)">&times;</button>
      </div>
    </div>
  </aside>
</template>

<script setup>
defineProps({ conversations: Array, activeId: String })
defineEmits(['select', 'create', 'delete'])

function fmt(s) {
  if (!s) return ''
  const d = new Date(s), n = new Date()
  return d.toDateString() === n.toDateString()
    ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
</script>

<style scoped>
.sidebar {
  width: 240px; border-right: 2px solid #000; background: white;
  display: flex; flex-direction: column; flex-shrink: 0;
}
.sidebar-top {
  height: 52px; display: flex; align-items: center; justify-content: space-between;
  padding: 0 14px; border-bottom: 2px solid #000; background: #f8f8f8;
}
.title { font-size: 13px; font-weight: 900; }
.add-btn {
  width: 28px; height: 28px; background: #000; color: white; border: none;
  font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.add-btn:hover { background: #333; }
.list { flex: 1; overflow-y: auto; }
.empty { padding: 24px; text-align: center; font-size: 11px; color: #bbb; }
.item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid #f0f0f0; cursor: pointer;
}
.item:hover { background: #fafafa; }
.item.active { background: #f0f0f0; border-left: 3px solid #000; padding-left: 11px; }
.info { flex: 1; min-width: 0; }
.name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.time { font-size: 10px; color: #aaa; margin-top: 2px; }
.rm {
  background: none; border: none; color: #ddd; font-size: 16px; cursor: pointer;
  opacity: 0; transition: .15s;
}
.item:hover .rm { opacity: 1; }
.rm:hover { color: #dc2626; }
</style>
