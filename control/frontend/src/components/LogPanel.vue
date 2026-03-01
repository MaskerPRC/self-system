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
        <!-- 复制按钮 -->
        <button
          @click="copyLogs"
          class="w-7 h-7 flex items-center justify-center rounded transition-colors"
          :class="copied ? 'text-emerald-400 bg-emerald-400/10' : 'text-stone-500 hover:text-stone-300'"
          :title="copied ? '已复制' : '复制日志'"
        >
          <i :class="copied ? 'ph ph-check' : 'ph ph-copy'" class="text-sm"></i>
        </button>
        <!-- 修Bug按钮（仅应用日志显示） -->
        <button
          v-if="activeTab === 'app'"
          @click="showFixConfirm = true"
          class="w-7 h-7 flex items-center justify-center text-amber-500 hover:text-amber-400 hover:bg-amber-400/10 rounded transition-colors disabled:opacity-30"
          title="一键修Bug"
          :disabled="!currentLines.length"
        >
          <i class="ph ph-wrench text-sm"></i>
        </button>
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

    <!-- 修Bug确认弹窗 -->
    <div v-if="showFixConfirm" class="absolute inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showFixConfirm = false">
      <div class="bg-[#1e1e3a] border border-white/10 rounded-2xl p-6 mx-4 max-w-sm w-full shadow-2xl">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
            <i class="ph ph-wrench text-xl text-amber-400"></i>
          </div>
          <div>
            <h3 class="text-white font-medium text-sm">一键修Bug</h3>
            <p class="text-stone-400 text-xs mt-0.5">将应用错误日志发送给 AI 修复</p>
          </div>
        </div>
        <p class="text-stone-300 text-xs mb-5 leading-relaxed">
          将创建一个新对话，并将当前的应用日志（最近 {{ Math.min(currentLines.length, 100) }} 行）发送给 Claude，让它自动分析并修复问题。
        </p>
        <div class="flex gap-3">
          <button
            @click="showFixConfirm = false"
            class="flex-1 px-4 py-2 text-xs font-medium text-stone-400 bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
          >取消</button>
          <button
            @click="confirmFix"
            class="flex-1 px-4 py-2 text-xs font-medium text-white bg-amber-600 hover:bg-amber-500 rounded-xl transition-colors"
          >确认修复</button>
        </div>
      </div>
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

const emit = defineEmits(['close', 'clear', 'update:activeTab', 'fix-bug'])

const logContainer = ref(null)
const autoScroll = ref(true)
const copied = ref(false)
const showFixConfirm = ref(false)

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

function copyLogs() {
  const text = currentLines.value.join('\n')
  navigator.clipboard.writeText(text).then(() => {
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }).catch(() => {})
}

function confirmFix() {
  const lines = currentLines.value.slice(-100)
  const logContent = lines.join('\n')
  showFixConfirm.value = false
  emit('fix-bug', { logType: '后端', logContent })
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
