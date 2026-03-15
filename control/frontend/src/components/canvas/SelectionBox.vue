<template>
  <div
    class="absolute pointer-events-none border-2 border-dashed border-brand-400 bg-brand-50/20 rounded"
    :style="boxStyle"
  ></div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  rect: { type: Object, default: () => ({ x: 0, y: 0, width: 0, height: 0 }) }
})

const boxStyle = computed(() => ({
  left: `${props.rect.x}px`,
  top: `${props.rect.y}px`,
  width: `${props.rect.width}px`,
  height: `${props.rect.height}px`
}))
</script>
