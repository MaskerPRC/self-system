<template>
  <div class="w-full h-full flex flex-col bg-white rounded-lg shadow-sm border border-orange-200 overflow-hidden">
    <div class="h-7 bg-orange-50 text-xs flex items-center px-2 gap-1.5 shrink-0 border-b border-orange-100">
      <i class="ph ph-cursor-click text-sm text-orange-500"></i>
      <span class="text-orange-700 font-medium">控制按钮</span>
    </div>
    <div class="flex-1 flex items-center justify-center p-3">
      <button
        @click.stop="onClick"
        class="px-6 py-2.5 bg-orange-500 text-white rounded-lg font-medium text-sm hover:bg-orange-600 active:bg-orange-700 transition-colors shadow-sm flex items-center gap-2"
        :class="{ 'animate-pulse': firing }"
      >
        <i class="ph ph-play-circle text-base"></i>
        {{ content?.label || '执行' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  content: { type: Object, default: () => ({}) },
  nodeId: { type: String, default: '' },
  runtime: { type: Object, default: null },
})

const firing = ref(false)

function onClick() {
  if (props.runtime) {
    props.runtime.emitControl(props.nodeId, 'click')
  }
  // Visual feedback
  firing.value = true
  setTimeout(() => { firing.value = false }, 300)
}
</script>
