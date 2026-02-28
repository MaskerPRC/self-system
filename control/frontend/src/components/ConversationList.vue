<template>
  <aside class="absolute sm:relative z-50 w-72 h-full bg-surface sm:bg-transparent border-r border-stone-200 flex flex-col transition-transform duration-300 ease-out"
    :class="open ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'">
    <div class="p-6 pb-2 flex items-center justify-between">
      <h2 class="font-serif font-semibold text-lg text-ink-900">对话</h2>
      <button @click="$emit('create')" class="w-8 h-8 flex items-center justify-center bg-paper border border-stone-200 text-ink-800 hover:border-brand-500 hover:text-brand-600 rounded-full shadow-subtle transition-all">
        <i class="ph-bold ph-plus"></i>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-4 pt-2 space-y-1">
      <div v-if="!conversations.length" class="flex flex-col items-center justify-center py-12 text-ink-400">
        <p class="text-sm">暂无对话</p>
      </div>
      <div
        v-for="c in conversations" :key="c.id"
        @click="$emit('select', c.id)"
        class="group flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer transition-all duration-200"
        :class="c.id === activeId ? 'bg-paper shadow-subtle border border-stone-100' : 'hover:bg-stone-100 border border-transparent'"
      >
        <div class="overflow-hidden flex-1">
          <div class="flex items-center gap-2">
            <!-- 状态圆点 -->
            <span v-if="processingIds.includes(c.id)" class="status-dot processing" title="正在回答"></span>
            <span v-else-if="queuedIds.includes(c.id)" class="status-dot queued" title="排队中"></span>
            <span v-else-if="unreadIds.includes(c.id)" class="status-dot unread" title="有新回复"></span>
            <input v-if="editingId === c.id" ref="editInput"
              v-model="editingTitle"
              @keydown.enter="confirmEdit(c.id)"
              @keydown.escape="cancelEdit"
              @blur="confirmEdit(c.id)"
              @click.stop
              class="w-full text-[15px] font-medium bg-white border border-brand-400 rounded-lg px-2 py-0.5 outline-none text-ink-800"
            />
            <div v-else @dblclick.stop="startEdit(c)" class="text-[15px] font-medium truncate" :class="c.id === activeId ? 'text-brand-700' : 'text-ink-700 group-hover:text-ink-900'">{{ c.title }}</div>
          </div>
          <div class="text-xs mt-1 text-ink-400">{{ fmt(c.updated_at) }}</div>
        </div>
        <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button @click.stop="startEdit(c)" class="w-6 h-6 flex items-center justify-center text-ink-300 hover:text-brand-500 rounded-full">
            <i class="ph ph-pencil-simple text-sm"></i>
          </button>
          <button @click.stop="$emit('delete', c.id)" class="w-6 h-6 flex items-center justify-center text-ink-300 hover:text-red-500 rounded-full">
            <i class="ph ph-x text-sm"></i>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { ref, nextTick } from 'vue'

defineProps({
  conversations: Array,
  activeId: String,
  open: Boolean,
  processingIds: { type: Array, default: () => [] },
  queuedIds: { type: Array, default: () => [] },
  unreadIds: { type: Array, default: () => [] }
})
const emit = defineEmits(['select', 'create', 'delete', 'rename'])

const editingId = ref(null)
const editingTitle = ref('')
const editInput = ref(null)

function startEdit(c) {
  editingId.value = c.id
  editingTitle.value = c.title
  nextTick(() => { editInput.value?.[0]?.focus?.() || editInput.value?.focus?.() })
}

function confirmEdit(id) {
  const title = editingTitle.value.trim()
  if (title && editingId.value === id) {
    emit('rename', id, title)
  }
  editingId.value = null
}

function cancelEdit() {
  editingId.value = null
}

function fmt(s) {
  if (!s) return ''
  const d = new Date(s), n = new Date()
  return d.toDateString() === n.toDateString()
    ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
</script>

<style scoped>
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.processing {
  background-color: #e05d34;
  animation: pulse-dot 1.5s ease-in-out infinite;
}
.status-dot.queued {
  background-color: #e5a820;
}
.status-dot.unread {
  background-color: #3b82f6;
}
@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.75); }
}
</style>
