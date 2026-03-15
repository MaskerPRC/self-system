<template>
  <div class="w-full h-full flex flex-col bg-white rounded-lg shadow-sm border border-stone-200 overflow-hidden">
    <!-- Header bar -->
    <div class="h-8 bg-stone-800 text-white text-xs flex items-center px-2 gap-2 shrink-0 rounded-t-lg">
      <i class="ph ph-browser text-sm text-stone-400"></i>
      <span class="flex-1 truncate text-stone-300">{{ content?.title || content?.route || '/' }}</span>
      <button
        @click.stop="refresh"
        class="p-0.5 text-stone-400 hover:text-white transition-colors"
        title="刷新"
      >
        <i class="ph ph-arrow-clockwise text-sm"></i>
      </button>
      <a
        :href="appUrl"
        target="_blank"
        rel="noopener"
        class="p-0.5 text-stone-400 hover:text-white transition-colors no-underline"
        title="在新标签页打开"
        @click.stop
      >
        <i class="ph ph-arrow-square-out text-sm"></i>
      </a>
    </div>
    <!-- iframe -->
    <iframe
      ref="iframeRef"
      :src="appUrl"
      class="flex-1 w-full border-0 rounded-b-lg bg-white"
      :style="{ pointerEvents: isDragging ? 'none' : 'auto' }"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
    ></iframe>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  content: { type: Object, default: () => ({ route: '/', title: '' }) },
  isDragging: { type: Boolean, default: false },
  width: { type: Number, default: 480 },
  height: { type: Number, default: 360 },
  appBaseUrl: { type: String, default: '' }
})

const iframeRef = ref(null)

const appUrl = computed(() => {
  const route = props.content?.route || '/'
  const base = props.appBaseUrl || `http://${location.hostname}:5174`
  return base + route
})

function refresh() {
  if (iframeRef.value) {
    iframeRef.value.src = iframeRef.value.src
  }
}
</script>
