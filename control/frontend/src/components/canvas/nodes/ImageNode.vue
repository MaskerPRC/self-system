<template>
  <div class="w-full h-full bg-white rounded-lg shadow-sm border border-stone-200 overflow-hidden relative">
    <img
      :src="content?.src"
      :alt="content?.originalName || '图片'"
      class="w-full h-full object-cover"
      draggable="false"
    />
    <div
      v-if="content?.originalName"
      class="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/50 text-white text-xs truncate"
    >
      {{ content.originalName }}
    </div>
  </div>
</template>

<script setup>
defineProps({
  content: { type: Object, default: () => ({ src: '', originalName: '' }) }
})
</script>
