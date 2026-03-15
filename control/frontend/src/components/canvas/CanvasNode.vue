<template>
  <div
    class="absolute group"
    :style="nodeStyle"
    :class="{ 'ring-2 ring-brand-500 ring-offset-1': selected }"
  >
    <TextNode
      v-if="node.type === 'text'"
      :content="node.content"
      @update="(content) => $emit('update-content', content)"
    />
    <ImageNode
      v-else-if="node.type === 'image'"
      :content="node.content"
    />
    <FileNode
      v-else-if="node.type === 'file'"
      :content="node.content"
    />
    <IframeNode
      v-else-if="node.type === 'iframe'"
      :content="node.content"
      :isDragging="isDraggingAny"
      :width="node.width"
      :height="node.height"
    />
    <RequestNode
      v-else-if="node.type === 'request'"
      :content="node.content"
    />

    <!-- Resize handle -->
    <div
      v-if="selected && node.type !== 'file'"
      class="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-brand-500 rounded-sm cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity z-10"
      @mousedown.stop="startResize"
    ></div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import TextNode from './nodes/TextNode.vue'
import ImageNode from './nodes/ImageNode.vue'
import FileNode from './nodes/FileNode.vue'
import IframeNode from './nodes/IframeNode.vue'
import RequestNode from './nodes/RequestNode.vue'

const props = defineProps({
  node: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  zoom: { type: Number, default: 1 },
  isDraggingAny: { type: Boolean, default: false }
})

const emit = defineEmits(['update-content', 'resize'])

const nodeStyle = computed(() => ({
  left: `${props.node.x}px`,
  top: `${props.node.y}px`,
  width: `${props.node.width}px`,
  height: props.node.type === 'file' ? 'auto' : `${props.node.height}px`,
  zIndex: props.node.z_index || 0
}))

function startResize(e) {
  const startX = e.clientX
  const startY = e.clientY
  const startW = props.node.width
  const startH = props.node.height || 80

  function onMove(e) {
    const dx = (e.clientX - startX) / props.zoom
    const dy = (e.clientY - startY) / props.zoom
    const newW = Math.max(100, Math.round(startW + dx))
    const newH = Math.max(40, Math.round(startH + dy))
    emit('resize', { width: newW, height: newH })
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>
