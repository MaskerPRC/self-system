<template>
  <div class="absolute bottom-0 left-0 right-0 z-30">
    <div class="bg-white rounded-t-2xl shadow-2xl border-t border-stone-200 px-6 py-4">
      <!-- Header -->
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <i class="ph ph-lightning text-brand-500 text-lg"></i>
          <span class="text-sm font-medium text-ink-800">提交 AI 需求</span>
        </div>
        <button
          @click="$emit('close')"
          class="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-stone-100 rounded-lg transition-colors"
        >
          <i class="ph ph-x text-base"></i>
        </button>
      </div>

      <!-- Selected items summary -->
      <div class="text-xs text-ink-500 mb-3 bg-stone-50 rounded-lg px-3 py-2">
        {{ selectionSummary }}
      </div>

      <!-- Prompt input -->
      <div class="relative mb-3">
        <textarea
          ref="promptRef"
          v-model="prompt"
          placeholder="描述你的需求..."
          rows="3"
          class="w-full px-3 py-2.5 text-sm border border-stone-200 rounded-xl outline-none focus:border-brand-400 resize-none bg-white transition-colors"
          @keydown.ctrl.enter="submit"
          @keydown.meta.enter="submit"
          :disabled="loading"
        ></textarea>
      </div>

      <!-- Actions -->
      <div class="flex items-center justify-between">
        <span class="text-xs text-ink-400">Ctrl+Enter 提交</span>
        <div class="flex gap-2">
          <button
            @click="$emit('close')"
            class="px-4 py-2 text-sm text-ink-500 hover:bg-stone-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            @click="submit"
            :disabled="!prompt.trim() || loading"
            class="px-4 py-2 text-sm text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1.5"
          >
            <i v-if="loading" class="ph ph-circle-notch animate-spin text-sm"></i>
            <i v-else class="ph ph-paper-plane-right text-sm"></i>
            {{ loading ? '提交中...' : '提交' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  selectedNodes: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false }
})

const emit = defineEmits(['submit', 'close'])

const prompt = ref('')
const promptRef = ref(null)

const selectionSummary = computed(() => {
  const count = props.selectedNodes.length
  if (count === 0) return '未选择元素'

  const typeCounts = {}
  const typeLabels = {
    text: '文本',
    image: '图片',
    file: '文件',
    iframe: '应用',
    request: '需求'
  }

  for (const node of props.selectedNodes) {
    const label = typeLabels[node.type] || node.type
    typeCounts[label] = (typeCounts[label] || 0) + 1
  }

  const parts = Object.entries(typeCounts).map(([label, c]) => `${c} 个${label}`)
  return `已选择 ${count} 个元素：${parts.join('、')}`
})

function submit() {
  if (!prompt.value.trim() || props.loading) return
  emit('submit', prompt.value.trim())
}

onMounted(() => {
  promptRef.value?.focus()
})
</script>
