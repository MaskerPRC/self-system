<template>
  <div class="w-full h-full flex flex-col bg-white rounded-lg shadow-sm border border-purple-200 overflow-hidden">
    <div class="h-7 bg-purple-50 text-xs flex items-center px-2 gap-1.5 shrink-0 border-b border-purple-100">
      <i class="ph ph-image text-sm text-purple-500"></i>
      <span class="text-purple-700 font-medium">图片预览</span>
    </div>
    <div class="flex-1 flex items-center justify-center p-2 overflow-hidden bg-stone-50">
      <img
        v-if="imageSrc"
        :src="imageSrc"
        class="max-w-full max-h-full object-contain rounded"
        @error="imageError = true"
      />
      <div v-else class="text-center text-stone-400">
        <i class="ph ph-image-square text-3xl"></i>
        <p class="text-xs mt-1">等待图片输入...</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  content: { type: Object, default: () => ({}) },
  nodeId: { type: String, default: '' },
  runtime: { type: Object, default: null },
})

const imageError = ref(false)

const imageSrc = computed(() => {
  // Check runtime input first
  if (props.runtime) {
    const inputVal = props.runtime.getDataInput(props.nodeId, 'image')
    if (inputVal) return inputVal
  }
  // Fallback to content
  return props.content?.src || null
})

// Watch for runtime input changes
let stopWatch = null
onMounted(() => {
  if (props.runtime) {
    stopWatch = watch(
      () => props.runtime.nodeStates[props.nodeId]?.inputs?.image,
      () => { imageError.value = false },
    )
  }
})
onUnmounted(() => { if (stopWatch) stopWatch() })
</script>
