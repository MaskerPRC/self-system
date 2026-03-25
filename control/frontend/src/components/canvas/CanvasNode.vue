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
      :appBaseUrl="appBaseUrl"
    />
    <RequestNode
      v-else-if="node.type === 'request'"
      :content="node.content"
    />
    <TextInputNode
      v-else-if="node.type === 'text-input'"
      :content="node.content"
      :nodeId="node.id"
      :runtime="runtime"
      @update="(content) => $emit('update-content', content)"
    />
    <NumberInputNode
      v-else-if="node.type === 'number-input'"
      :content="node.content"
      :nodeId="node.id"
      :runtime="runtime"
      @update="(content) => $emit('update-content', content)"
    />
    <ButtonNode
      v-else-if="node.type === 'button'"
      :content="node.content"
      :nodeId="node.id"
      :runtime="runtime"
    />
    <ImageViewerNode
      v-else-if="node.type === 'image-viewer'"
      :content="node.content"
      :nodeId="node.id"
      :runtime="runtime"
    />

    <!-- Ports overlay (for nodes that have ports) -->
    <NodePorts
      v-if="hasPorts"
      :ports="nodePorts"
      :nodeId="node.id"
      :nodeHeight="node.height"
      :connectedPorts="connectedPorts"
      @port-mousedown="(data) => $emit('port-mousedown', data)"
      @port-mouseup="(data) => $emit('port-mouseup', data)"
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
import TextInputNode from './nodes/TextInputNode.vue'
import NumberInputNode from './nodes/NumberInputNode.vue'
import ButtonNode from './nodes/ButtonNode.vue'
import ImageViewerNode from './nodes/ImageViewerNode.vue'
import NodePorts from './NodePorts.vue'
import { getNodePorts } from './ports.js'

const props = defineProps({
  node: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  zoom: { type: Number, default: 1 },
  isDraggingAny: { type: Boolean, default: false },
  appBaseUrl: { type: String, default: '' },
  runtime: { type: Object, default: null },
  connectedPorts: { type: Set, default: () => new Set() },
})

const emit = defineEmits(['update-content', 'resize', 'resize-start', 'resize-end', 'port-mousedown', 'port-mouseup'])

const nodePorts = computed(() => getNodePorts(props.node))

const hasPorts = computed(() => {
  const p = nodePorts.value
  return (p.dataIn.length + p.dataOut.length + p.controlIn.length + p.controlOut.length) > 0
})

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

  emit('resize-start')

  function onMove(e) {
    const dx = (e.clientX - startX) / props.zoom
    const dy = (e.clientY - startY) / props.zoom
    const newW = Math.max(100, Math.round(startW + dx))
    const newH = Math.max(40, Math.round(startH + dy))
    emit('resize', { width: newW, height: newH })
  }

  function onUp() {
    emit('resize-end')
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>
