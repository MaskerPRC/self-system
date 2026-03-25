<template>
  <div>
    <!-- Left side: input ports -->
    <div
      v-for="(port, i) in leftPorts"
      :key="'l-' + port.id"
      class="absolute flex items-center gap-1"
      :style="leftPortStyle(i)"
    >
      <div
        class="w-3 h-3 rounded-full border-2 cursor-crosshair z-20 transition-transform hover:scale-150 shrink-0"
        :class="portClasses(port)"
        :style="{ borderColor: portColor(port), backgroundColor: isConnected(port) ? portColor(port) : 'white' }"
        @mousedown.stop="$emit('port-mousedown', { port, event: $event })"
        @mouseup.stop="$emit('port-mouseup', { port, event: $event })"
        :title="port.name"
        :data-node-id="nodeId"
        :data-port-id="port.id"
        :data-port-kind="port.kind"
      ></div>
      <!-- Label outside the node (to the left) -->
      <span
        class="absolute text-[10px] whitespace-nowrap pointer-events-none select-none right-full mr-2"
        :class="port.kind.startsWith('control') ? 'text-orange-500 font-medium' : 'text-ink-500'"
      >{{ port.name }}</span>
    </div>

    <!-- Right side: output ports -->
    <div
      v-for="(port, i) in rightPorts"
      :key="'r-' + port.id"
      class="absolute flex items-center gap-1"
      :style="rightPortStyle(i)"
    >
      <div
        class="w-3 h-3 rounded-full border-2 cursor-crosshair z-20 transition-transform hover:scale-150 shrink-0"
        :class="portClasses(port)"
        :style="{ borderColor: portColor(port), backgroundColor: isConnected(port) ? portColor(port) : 'white' }"
        @mousedown.stop="$emit('port-mousedown', { port, event: $event })"
        @mouseup.stop="$emit('port-mouseup', { port, event: $event })"
        :title="port.name"
        :data-node-id="nodeId"
        :data-port-id="port.id"
        :data-port-kind="port.kind"
      ></div>
      <!-- Label outside the node (to the right) -->
      <span
        class="absolute text-[10px] whitespace-nowrap pointer-events-none select-none left-full ml-2"
        :class="port.kind.startsWith('control') ? 'text-orange-500 font-medium' : 'text-ink-500'"
      >{{ port.name }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { PORT_COLORS } from './ports.js'

const props = defineProps({
  ports: { type: Object, default: () => ({ dataIn: [], dataOut: [], controlIn: [], controlOut: [] }) },
  nodeId: { type: String, required: true },
  nodeHeight: { type: Number, default: 100 },
  connectedPorts: { type: Set, default: () => new Set() },
})

defineEmits(['port-mousedown', 'port-mouseup'])

// Left ports = inputs (control-in first, then data-in)
const leftPorts = computed(() => [
  ...props.ports.controlIn.map(p => ({ ...p, kind: 'control-in' })),
  ...props.ports.dataIn.map(p => ({ ...p, kind: 'data-in' })),
])

// Right ports = outputs (control-out first, then data-out)
const rightPorts = computed(() => [
  ...props.ports.controlOut.map(p => ({ ...p, kind: 'control-out' })),
  ...props.ports.dataOut.map(p => ({ ...p, kind: 'data-out' })),
])

const HEADER_HEIGHT = 28  // height of node header
const PORT_SPACING = 22
const PORT_START_Y = HEADER_HEIGHT + 12

function leftPortStyle(index) {
  const y = PORT_START_Y + index * PORT_SPACING
  return {
    left: '-6px',
    top: `${y}px`,
  }
}

function rightPortStyle(index) {
  const y = PORT_START_Y + index * PORT_SPACING
  return {
    right: '-6px',
    top: `${y}px`,
  }
}

function portColor(port) {
  return PORT_COLORS[port.kind] || '#9ca3af'
}

function portClasses(port) {
  if (port.kind === 'control-in' || port.kind === 'control-out') {
    return 'rotate-45 rounded-sm'  // diamond shape for control
  }
  return ''
}

function isConnected(port) {
  return props.connectedPorts.has(`${props.nodeId}:${port.id}`)
}
</script>
