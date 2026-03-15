<template>
  <div
    class="absolute z-30 pointer-events-none"
    :style="positionStyle"
  >
    <div
      class="pointer-events-auto w-72 bg-white rounded-xl shadow-xl border border-stone-200 overflow-hidden"
      @mousedown.stop
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-3 py-2 border-b border-stone-100 bg-stone-50/80">
        <div class="flex items-center gap-1.5">
          <i class="ph ph-lightning text-brand-500 text-sm"></i>
          <span class="text-xs font-medium text-ink-700">{{ selectionSummary }}</span>
        </div>
        <button
          @click="$emit('close')"
          class="p-1 text-ink-400 hover:text-ink-700 rounded transition-colors"
        >
          <i class="ph ph-x text-sm"></i>
        </button>
      </div>

      <!-- Input -->
      <div class="p-2.5">
        <textarea
          ref="promptRef"
          v-model="prompt"
          placeholder="描述你的需求..."
          rows="2"
          class="w-full px-2.5 py-2 text-sm border border-stone-200 rounded-lg outline-none focus:border-brand-400 resize-none bg-white transition-colors"
          @keydown.ctrl.enter="submit"
          @keydown.meta.enter="submit"
          @keydown.escape="$emit('close')"
          :disabled="loading"
        ></textarea>
        <div class="flex items-center justify-between mt-2">
          <span class="text-[10px] text-ink-300">Ctrl+Enter</span>
          <button
            @click="submit"
            :disabled="!prompt.trim() || loading"
            class="px-3 py-1.5 text-xs text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1"
          >
            <i v-if="loading" class="ph ph-circle-notch animate-spin"></i>
            <i v-else class="ph ph-paper-plane-right"></i>
            {{ loading ? '处理中' : '提交' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'

const props = defineProps({
  selectedNodes: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  anchorRect: { type: Object, default: () => ({ x: 0, y: 0, width: 0, height: 0 }) }
})

const emit = defineEmits(['submit', 'close'])

const prompt = ref('')
const promptRef = ref(null)

const positionStyle = computed(() => {
  const r = props.anchorRect
  // Position below the selection, centered horizontally
  const left = Math.max(8, Math.min(r.x + r.width / 2 - 144, window.innerWidth - 300))
  const top = r.y + r.height + 12
  return {
    left: `${left}px`,
    top: `${top}px`
  }
})

const selectionSummary = computed(() => {
  const count = props.selectedNodes.length
  if (count === 0) return '未选择'
  const typeLabels = { text: '文本', image: '图片', file: '文件', iframe: '应用', request: '需求' }
  const typeCounts = {}
  for (const node of props.selectedNodes) {
    const label = typeLabels[node.type] || node.type
    typeCounts[label] = (typeCounts[label] || 0) + 1
  }
  const parts = Object.entries(typeCounts).map(([l, c]) => `${c}${l}`)
  return `${parts.join(' + ')}`
})

function submit() {
  if (!prompt.value.trim() || props.loading) return
  emit('submit', prompt.value.trim())
}

onMounted(() => {
  nextTick(() => promptRef.value?.focus())
})
</script>
