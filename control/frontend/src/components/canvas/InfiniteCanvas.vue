<template>
  <div
    ref="canvasEl"
    class="w-full h-full relative cursor-default select-none"
    :class="{ 'cursor-grab': spacePressed && !isPanning, 'cursor-grabbing': isPanning }"
    @mousedown="onMouseDown"
    @wheel.prevent="onWheel"
    @dragover.prevent
    @drop.prevent="onDrop"
    @paste="onPaste"
    tabindex="0"
  >
    <!-- Grid background -->
    <div class="absolute inset-0 pointer-events-none" :style="gridStyle"></div>

    <!-- World container -->
    <div ref="worldEl" class="absolute origin-top-left" :style="worldStyle">
      <CanvasNode
        v-for="node in nodes"
        :key="node.id"
        :node="node"
        :selected="selectedIds.has(node.id)"
        :zoom="zoom"
        :isDraggingAny="isDragging"
        @mousedown.stop="onNodeMouseDown($event, node)"
        @update-content="(content) => $emit('update-node', { id: node.id, content })"
        @resize="(size) => $emit('update-node', { id: node.id, ...size })"
      />
    </div>

    <!-- Selection box overlay -->
    <SelectionBox v-if="isSelecting" :rect="selectionRect" />

    <!-- Floating action buttons -->
    <div v-if="selectedIds.size > 0" class="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-20">
      <button
        @click="$emit('request-ai')"
        class="px-4 py-2 bg-brand-500 text-white rounded-full shadow-lg hover:bg-brand-600 flex items-center gap-2 text-sm font-medium transition-colors"
      >
        <i class="ph ph-lightning"></i>
        提交需求
      </button>
      <button
        @click="deleteSelected"
        class="px-3 py-2 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 flex items-center gap-2 text-sm transition-colors"
      >
        <i class="ph ph-trash"></i>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import CanvasNode from './CanvasNode.vue'
import SelectionBox from './SelectionBox.vue'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  zoom: { type: Number, default: 1 },
  offset: { type: Object, default: () => ({ x: 0, y: 0 }) }
})

const emit = defineEmits([
  'update:zoom', 'update:offset',
  'update-node', 'update-nodes-batch', 'delete-nodes',
  'create-node', 'select-nodes', 'request-ai', 'upload-files'
])

const canvasEl = ref(null)
const worldEl = ref(null)

// ---- State ----
const selectedIds = ref(new Set())
const isDragging = ref(false)
const isPanning = ref(false)
const isSelecting = ref(false)
const selectionRect = ref({ x: 0, y: 0, width: 0, height: 0 })
const spacePressed = ref(false)
const dragStart = ref(null)
let dragMoved = false
let panStart = null
let selectStart = null
let updateDebounce = null

// ---- Coordinate conversion ----
function screenToWorld(sx, sy) {
  const rect = canvasEl.value.getBoundingClientRect()
  return {
    x: (sx - rect.left - props.offset.x) / props.zoom,
    y: (sy - rect.top - props.offset.y) / props.zoom
  }
}

// ---- Computed styles ----
const worldStyle = computed(() => ({
  transform: `translate(${props.offset.x}px, ${props.offset.y}px) scale(${props.zoom})`,
  transformOrigin: '0 0'
}))

const gridStyle = computed(() => {
  const size = 20 * props.zoom
  const ox = props.offset.x % size
  const oy = props.offset.y % size
  return {
    backgroundImage: 'radial-gradient(circle, #d4d4d8 1px, transparent 1px)',
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${ox}px ${oy}px`
  }
})

// ---- Pan ----
function startPan(e) {
  isPanning.value = true
  panStart = { x: e.clientX, y: e.clientY, ox: props.offset.x, oy: props.offset.y }
  document.addEventListener('mousemove', onPanMove)
  document.addEventListener('mouseup', onPanEnd)
}

function onPanMove(e) {
  if (!isPanning.value) return
  const dx = e.clientX - panStart.x
  const dy = e.clientY - panStart.y
  emit('update:offset', { x: panStart.ox + dx, y: panStart.oy + dy })
}

function onPanEnd() {
  isPanning.value = false
  panStart = null
  document.removeEventListener('mousemove', onPanMove)
  document.removeEventListener('mouseup', onPanEnd)
}

// ---- Zoom ----
function onWheel(e) {
  const factor = e.deltaY > 0 ? 0.9 : 1.1
  const newZoom = Math.min(3, Math.max(0.1, props.zoom * factor))
  const rect = canvasEl.value.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const newOx = mx - (mx - props.offset.x) * (newZoom / props.zoom)
  const newOy = my - (my - props.offset.y) * (newZoom / props.zoom)
  emit('update:zoom', newZoom)
  emit('update:offset', { x: newOx, y: newOy })
}

// ---- Mouse down dispatcher ----
function onMouseDown(e) {
  // Middle mouse button: always pan
  if (e.button === 1) {
    e.preventDefault()
    startPan(e)
    return
  }

  // Left button
  if (e.button === 0) {
    // Space held: pan mode
    if (spacePressed.value) {
      startPan(e)
      return
    }
    // Click on canvas background: start selection box
    startSelection(e)
  }
}

// ---- Node mouse down ----
function onNodeMouseDown(e, node) {
  if (e.button !== 0) return

  if (spacePressed.value) {
    startPan(e)
    return
  }

  // Selection logic
  if (e.shiftKey) {
    const next = new Set(selectedIds.value)
    if (next.has(node.id)) next.delete(node.id)
    else next.add(node.id)
    selectedIds.value = next
    emitSelection()
  } else if (!selectedIds.value.has(node.id)) {
    selectedIds.value = new Set([node.id])
    emitSelection()
  }

  // Prepare drag
  const nodePositions = new Map()
  for (const id of selectedIds.value) {
    const n = props.nodes.find(n => n.id === id)
    if (n) nodePositions.set(id, { x: n.x, y: n.y })
  }
  dragStart.value = { startX: e.clientX, startY: e.clientY, nodePositions }
  dragMoved = false

  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e) {
  if (!dragStart.value) return
  const dx = (e.clientX - dragStart.value.startX) / props.zoom
  const dy = (e.clientY - dragStart.value.startY) / props.zoom
  if (!dragMoved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
    dragMoved = true
    isDragging.value = true
  }
  if (!dragMoved) return

  const updates = []
  for (const [id, pos] of dragStart.value.nodePositions) {
    const newX = Math.round(pos.x + dx)
    const newY = Math.round(pos.y + dy)
    // Update local node position immediately for smooth drag
    const node = props.nodes.find(n => n.id === id)
    if (node) {
      node.x = newX
      node.y = newY
    }
    updates.push({ id, x: newX, y: newY })
  }

  // Debounce API calls
  clearTimeout(updateDebounce)
  updateDebounce = setTimeout(() => {
    emit('update-nodes-batch', updates)
  }, 300)
}

function onDragEnd() {
  if (dragMoved && dragStart.value) {
    // Final batch update
    clearTimeout(updateDebounce)
    const updates = []
    for (const id of selectedIds.value) {
      const node = props.nodes.find(n => n.id === id)
      if (node) updates.push({ id, x: node.x, y: node.y })
    }
    if (updates.length) emit('update-nodes-batch', updates)
  }
  isDragging.value = false
  dragStart.value = null
  dragMoved = false
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

// ---- Box Selection ----
function startSelection(e) {
  if (!e.shiftKey) {
    selectedIds.value = new Set()
    emitSelection()
  }
  isSelecting.value = true
  const rect = canvasEl.value.getBoundingClientRect()
  selectStart = { x: e.clientX - rect.left, y: e.clientY - rect.top }
  selectionRect.value = { x: selectStart.x, y: selectStart.y, width: 0, height: 0 }
  document.addEventListener('mousemove', onSelectMove)
  document.addEventListener('mouseup', onSelectEnd)
}

function onSelectMove(e) {
  if (!isSelecting.value || !selectStart) return
  const rect = canvasEl.value.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  const x = Math.min(selectStart.x, cx)
  const y = Math.min(selectStart.y, cy)
  const width = Math.abs(cx - selectStart.x)
  const height = Math.abs(cy - selectStart.y)
  selectionRect.value = { x, y, width, height }

  // Compute intersecting nodes
  const sel = new Set(e.shiftKey ? selectedIds.value : [])
  for (const node of props.nodes) {
    const nodeScreenX = node.x * props.zoom + props.offset.x
    const nodeScreenY = node.y * props.zoom + props.offset.y
    const nodeScreenW = node.width * props.zoom
    const nodeScreenH = (node.height || 60) * props.zoom
    if (
      nodeScreenX + nodeScreenW > x &&
      nodeScreenX < x + width &&
      nodeScreenY + nodeScreenH > y &&
      nodeScreenY < y + height
    ) {
      sel.add(node.id)
    }
  }
  selectedIds.value = sel
}

function onSelectEnd() {
  isSelecting.value = false
  selectStart = null
  emitSelection()
  document.removeEventListener('mousemove', onSelectMove)
  document.removeEventListener('mouseup', onSelectEnd)
}

// ---- File Drop ----
async function onDrop(e) {
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return
  const dropPos = screenToWorld(e.clientX, e.clientY)
  emit('upload-files', { files: Array.from(files), position: dropPos })
}

// ---- Paste ----
function onPaste(e) {
  const items = e.clipboardData?.items
  if (!items) return

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const file = item.getAsFile()
      if (!file) continue
      const center = getCenter()
      emit('upload-files', { files: [file], position: center })
      return
    }
    if (item.type === 'text/plain') {
      // Only handle paste if no input/textarea is focused
      if (document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'INPUT') return
      item.getAsString(text => {
        if (text.trim()) {
          const center = getCenter()
          emit('create-node', {
            type: 'text',
            x: center.x,
            y: center.y,
            width: 200,
            height: 80,
            content: { text, fontSize: 14 }
          })
        }
      })
      return
    }
  }
}

function getCenter() {
  if (!canvasEl.value) return { x: 200, y: 200 }
  const rect = canvasEl.value.getBoundingClientRect()
  return {
    x: (rect.width / 2 - props.offset.x) / props.zoom,
    y: (rect.height / 2 - props.offset.y) / props.zoom
  }
}

// ---- Delete selected ----
function deleteSelected() {
  if (selectedIds.value.size === 0) return
  emit('delete-nodes', [...selectedIds.value])
  selectedIds.value = new Set()
  emitSelection()
}

// ---- Keyboard ----
function onKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

  if (e.code === 'Space') {
    e.preventDefault()
    spacePressed.value = true
  }
  if (e.code === 'Delete' || e.code === 'Backspace') {
    if (selectedIds.value.size > 0) {
      e.preventDefault()
      deleteSelected()
    }
  }
  if (e.code === 'Escape') {
    selectedIds.value = new Set()
    emitSelection()
  }
  // Ctrl/Cmd+A: select all
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') {
    e.preventDefault()
    selectedIds.value = new Set(props.nodes.map(n => n.id))
    emitSelection()
  }
}

function onKeyUp(e) {
  if (e.code === 'Space') {
    spacePressed.value = false
  }
}

function emitSelection() {
  emit('select-nodes', [...selectedIds.value])
}

// Watch for external node changes (e.g. deleted nodes)
watch(() => props.nodes, () => {
  const nodeIdSet = new Set(props.nodes.map(n => n.id))
  let changed = false
  const next = new Set()
  for (const id of selectedIds.value) {
    if (nodeIdSet.has(id)) next.add(id)
    else changed = true
  }
  if (changed) {
    selectedIds.value = next
    emitSelection()
  }
}, { deep: true })

onMounted(() => {
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('mousemove', onPanMove)
  document.removeEventListener('mouseup', onPanEnd)
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  document.removeEventListener('mousemove', onSelectMove)
  document.removeEventListener('mouseup', onSelectEnd)
  clearTimeout(updateDebounce)
})

defineExpose({ screenToWorld })
</script>
