<template>
  <div
    class="absolute z-30 pointer-events-none"
    :style="positionStyle"
  >
    <div
      class="pointer-events-auto w-80 bg-white rounded-xl shadow-xl border border-stone-200 overflow-hidden"
      @mousedown.stop
    >
      <!-- Attachment previews -->
      <div v-if="selectedNodes.length" class="px-3 pt-3 pb-1">
        <div class="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto">
          <!-- Image attachment -->
          <template v-for="node in selectedNodes" :key="node.id">
            <div v-if="node.type === 'image'" class="flex items-center gap-1.5 bg-blue-50 rounded-lg px-2 py-1.5 text-xs text-ink-700 border border-blue-100">
              <img
                :src="node.content?.src"
                class="w-8 h-8 rounded object-cover flex-shrink-0"
                @error="(e) => e.target.style.display = 'none'"
              />
              <span class="max-w-[100px] truncate">{{ node.content?.originalName || '图片' }}</span>
            </div>

            <!-- File attachment -->
            <div v-else-if="node.type === 'file'" class="flex items-center gap-1.5 bg-stone-100 rounded-lg px-2 py-1.5 text-xs text-ink-700">
              <i :class="fileIcon(node.content)" class="text-sm flex-shrink-0"></i>
              <span class="max-w-[100px] truncate">{{ node.content?.name || '文件' }}</span>
              <span v-if="node.content?.size" class="text-ink-400 text-[10px]">({{ formatSize(node.content.size) }})</span>
            </div>

            <!-- Text attachment -->
            <div v-else-if="node.type === 'text'" class="flex items-center gap-1.5 bg-stone-100 rounded-lg px-2 py-1.5 text-xs text-ink-700">
              <i class="ph ph-text-aa text-sm text-ink-400 flex-shrink-0"></i>
              <span class="max-w-[140px] truncate">{{ textPreview(node.content) }}</span>
            </div>

            <!-- Iframe/App attachment -->
            <div v-else-if="node.type === 'iframe'" class="flex items-center gap-1.5 bg-blue-50 rounded-lg px-2 py-1.5 text-xs text-blue-700 border border-blue-100">
              <i class="ph ph-browser text-sm flex-shrink-0"></i>
              <span class="max-w-[100px] truncate">{{ node.content?.title || node.content?.route || '应用' }}</span>
            </div>

            <!-- Request attachment -->
            <div v-else-if="node.type === 'request'" class="flex items-center gap-1.5 bg-amber-50 rounded-lg px-2 py-1.5 text-xs text-amber-700 border border-amber-100">
              <i class="ph ph-lightning text-sm flex-shrink-0"></i>
              <span class="max-w-[140px] truncate">{{ node.content?.prompt || '需求' }}</span>
            </div>
          </template>
        </div>
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
import { ref, computed, onMounted, nextTick } from 'vue'

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
  const left = Math.max(8, Math.min(r.x + r.width / 2 - 160, window.innerWidth - 340))
  const top = r.y + r.height + 12
  return {
    left: `${left}px`,
    top: `${top}px`
  }
})

function textPreview(content) {
  const text = content?.text || ''
  return text.length > 30 ? text.slice(0, 30) + '...' : text || '空文本'
}

function fileIcon(content) {
  const mime = content?.mimeType || ''
  if (mime.startsWith('image/')) return 'ph ph-image text-blue-500'
  if (mime.includes('pdf')) return 'ph ph-file-pdf text-red-500'
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return 'ph ph-file-zip text-yellow-600'
  if (mime.includes('text') || mime.includes('json') || mime.includes('xml')) return 'ph ph-file-text text-ink-500'
  if (mime.includes('video')) return 'ph ph-file-video text-purple-500'
  if (mime.includes('audio')) return 'ph ph-file-audio text-green-500'
  return 'ph ph-file text-ink-400'
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}

function submit() {
  if (!prompt.value.trim() || props.loading) return
  emit('submit', prompt.value.trim())
}

onMounted(() => {
  nextTick(() => promptRef.value?.focus())
})
</script>
