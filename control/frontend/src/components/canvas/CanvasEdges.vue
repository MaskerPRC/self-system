<template>
  <svg class="absolute top-0 left-0 pointer-events-none" style="z-index: 5; width: 1px; height: 1px; overflow: visible">
    <!-- Existing edges -->
    <g v-for="edge in edgePaths" :key="edge.id">
      <path
        :d="edge.path"
        fill="none"
        :stroke="edge.color"
        :stroke-width="2 / zoom"
        :stroke-dasharray="edge.type === 'control' ? `${6/zoom} ${4/zoom}` : 'none'"
        class="pointer-events-auto cursor-pointer"
        :class="{ 'opacity-50': dragging }"
        @click.stop="$emit('delete-edge', edge.id)"
        @mouseenter="hoveredEdge = edge.id"
        @mouseleave="hoveredEdge = null"
      />
      <!-- Wider invisible hit area for easier clicking -->
      <path
        :d="edge.path"
        fill="none"
        stroke="transparent"
        :stroke-width="12 / zoom"
        class="pointer-events-auto cursor-pointer"
        @click.stop="$emit('delete-edge', edge.id)"
        @mouseenter="hoveredEdge = edge.id"
        @mouseleave="hoveredEdge = null"
      />
      <!-- Delete indicator on hover -->
      <circle
        v-if="hoveredEdge === edge.id"
        :cx="edge.midX"
        :cy="edge.midY"
        :r="8 / zoom"
        fill="#ef4444"
        class="pointer-events-none"
      />
      <text
        v-if="hoveredEdge === edge.id"
        :x="edge.midX"
        :y="edge.midY"
        text-anchor="middle"
        dominant-baseline="central"
        fill="white"
        :font-size="10 / zoom"
        class="pointer-events-none select-none"
      >×</text>
    </g>

    <!-- Dragging edge preview -->
    <path
      v-if="dragging"
      :d="dragPath"
      fill="none"
      :stroke="dragColor"
      :stroke-width="2 / zoom"
      :stroke-dasharray="dragType === 'control' ? `${6/zoom} ${4/zoom}` : 'none'"
      opacity="0.6"
    />
  </svg>
</template>

<script setup>
import { ref, computed } from 'vue'
import { EDGE_COLORS } from './ports.js'

const props = defineProps({
  edges: { type: Array, default: () => [] },
  nodes: { type: Array, default: () => [] },
  zoom: { type: Number, default: 1 },
  dragging: { type: Object, default: null }, // { fromNodeId, fromPortId, fromKind, mouseX, mouseY }
})

defineEmits(['delete-edge'])

const hoveredEdge = ref(null)

const HEADER_HEIGHT = 28
const PORT_SPACING = 22
const PORT_START_Y = HEADER_HEIGHT + 12
const PORT_RADIUS = 6

/**
 * Calculate port position in world coordinates
 */
function getPortPosition(nodeId, portId, portKind) {
  const node = props.nodes.find(n => n.id === nodeId)
  if (!node) return null

  const ports = getNodePortList(node)
  const isInput = portKind === 'data-in' || portKind === 'control-in'
  const side = isInput ? 'left' : 'right'

  const sideList = side === 'left'
    ? [...(ports.dataIn || []), ...(ports.controlIn || [])]
    : [...(ports.dataOut || []), ...(ports.controlOut || [])]

  const index = sideList.findIndex(p => p.id === portId)
  if (index === -1) return null

  const y = node.y + PORT_START_Y + index * PORT_SPACING + PORT_RADIUS
  const x = side === 'left' ? node.x : node.x + node.width

  return { x, y }
}

function getNodePortList(node) {
  // Import port definitions inline to avoid circular deps
  const defs = {
    'text-input': { dataOut: [{ id: 'text' }] },
    'number-input': { dataOut: [{ id: 'number' }] },
    'button': { controlOut: [{ id: 'click' }] },
    'image-viewer': { dataIn: [{ id: 'image' }] },
  }
  const typeDef = defs[node.type] || {}
  const ports = {
    dataIn: [...(typeDef.dataIn || [])],
    dataOut: [...(typeDef.dataOut || [])],
    controlIn: [...(typeDef.controlIn || [])],
    controlOut: [...(typeDef.controlOut || [])],
  }
  if (node.content?.ports) {
    const dp = node.content.ports
    if (dp.dataIn) ports.dataIn.push(...dp.dataIn)
    if (dp.dataOut) ports.dataOut.push(...dp.dataOut)
    if (dp.controlIn) ports.controlIn.push(...dp.controlIn)
    if (dp.controlOut) ports.controlOut.push(...dp.controlOut)
  }
  return ports
}

function bezierPath(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1) * 0.5
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

const edgePaths = computed(() => {
  return props.edges.map(edge => {
    const fromKind = edge.edge_type === 'data' ? 'data-out' : 'control-out'
    const toKind = edge.edge_type === 'data' ? 'data-in' : 'control-in'
    const from = getPortPosition(edge.from_node_id, edge.from_port_id, fromKind)
    const to = getPortPosition(edge.to_node_id, edge.to_port_id, toKind)

    if (!from || !to) return null

    const path = bezierPath(from.x, from.y, to.x, to.y)
    const color = EDGE_COLORS[edge.edge_type] || '#9ca3af'

    return {
      id: edge.id,
      path,
      color,
      type: edge.edge_type,
      midX: (from.x + to.x) / 2,
      midY: (from.y + to.y) / 2,
    }
  }).filter(Boolean)
})

const dragPath = computed(() => {
  if (!props.dragging) return ''
  const { fromNodeId, fromPortId, fromKind, mouseX, mouseY } = props.dragging
  const from = getPortPosition(fromNodeId, fromPortId, fromKind)
  if (!from) return ''
  return bezierPath(from.x, from.y, mouseX, mouseY)
})

const dragColor = computed(() => {
  if (!props.dragging) return '#9ca3af'
  return props.dragging.fromKind.startsWith('control') ? EDGE_COLORS.control : EDGE_COLORS.data
})

const dragType = computed(() => {
  if (!props.dragging) return 'data'
  return props.dragging.fromKind.startsWith('control') ? 'control' : 'data'
})
</script>
