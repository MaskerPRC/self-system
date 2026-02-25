<template>
  <div class="flex flex-col h-full bg-[#1a1a2e]">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-white/10 shrink-0">
      <div class="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
        <button
          @click="$emit('update:activeTab', 'app')"
          class="px-3 py-1 text-xs font-medium rounded-md transition-colors"
          :class="activeTab === 'app' ? 'bg-white/10 text-emerald-400' : 'text-stone-500 hover:text-stone-300'"
        >应用日志</button>
        <button
          @click="$emit('update:activeTab', 'control')"
          class="px-3 py-1 text-xs font-medium rounded-md transition-colors"
          :class="activeTab === 'control' ? 'bg-white/10 text-cyan-400' : 'text-stone-500 hover:text-stone-300'"
        >控制日志</button>
      </div>
      <div class="flex items-center gap-1">
        <span class="text-[10px] px-1.5 py-0.5 bg-white/10 text-stone-500 rounded font-mono">{{ currentLines.length }}</span>
        <button
          @click="autoScroll = !autoScroll"
          class="w-7 h-7 flex items-center justify-center rounded transition-colors"
          :class="autoScroll ? 'text-emerald-400 bg-emerald-400/10' : 'text-stone-500 hover:text-stone-300'"
          title="自动滚动"
        >
          <i class="ph ph-arrow-line-down text-sm"></i>
        </button>
        <button
          @click="$emit('clear')"
          class="w-7 h-7 flex items-center justify-center text-stone-500 hover:text-stone-300 rounded transition-colors"
          title="清空"
        >
          <i class="ph ph-trash text-sm"></i>
        </button>
        <button
          @click="$emit('close')"
          class="w-7 h-7 flex items-center justify-center text-stone-500 hover:text-stone-300 rounded transition-colors"
          title="关闭"
        >
          <i class="ph ph-x text-sm"></i>
        </button>
      </div>
    </div>

    <!-- Log Content -->
    <div ref="logContainer" class="flex-1 overflow-y-auto overflow-x-hidden p-3 font-mono text-xs leading-5 select-text">
      <div v-if="!currentLines.length" class="flex items-center justify-center h-full text-stone-600">
        <span>暂无日志</span>
      </div>
      <div v-for="(line, i) in currentLines" :key="i" class="whitespace-pre-wrap break-all" :class="lineClass(line)">{{ line }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  appLines: { type: Array, default: () => [] },
  controlLines: { type: Array, default: () => [] },
  activeTab: { type: String, default: 'app' }
})

defineEmits(['close', 'clear', 'update:activeTab'])

const logContainer = ref(null)
const autoScroll = ref(true)

const currentLines = computed(() => {
  return props.activeTab === 'app' ? props.appLines : props.controlLines
})

function lineClass(line) {
  if (/error|Error|ERR!|FATAL/i.test(line)) return 'text-red-400'
  if (/warn|Warning|WARN/i.test(line)) return 'text-yellow-400'
  if (/\[Vite\]|vite/i.test(line)) return 'text-cyan-400'
  if (/\[启动\]|\[初始化\]|\[配置\]|\[检查\]/.test(line)) return 'text-emerald-400'
  if (/={10,}/.test(line)) return 'text-brand-400 font-bold'
  if (/^\s*at\s/.test(line)) return 'text-stone-600'
  return 'text-stone-300'
}

function scrollToBottom() {
  if (!autoScroll.value || !logContainer.value) return
  logContainer.value.scrollTop = logContainer.value.scrollHeight
}

watch(() => currentLines.value.length, () => {
  nextTick(scrollToBottom)
})

watch(() => props.activeTab, () => {
  nextTick(scrollToBottom)
})
</script>
