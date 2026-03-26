<template>
  <div class="w-full h-full flex flex-col bg-white rounded-lg shadow-sm border border-stone-200 overflow-hidden">
    <!-- Header bar -->
    <div class="h-8 bg-stone-800 text-white text-xs flex items-center px-2 gap-2 shrink-0 rounded-t-lg">
      <i class="ph ph-browser text-sm text-stone-400"></i>
      <span class="flex-1 truncate text-stone-300">{{ content?.title || content?.route || '/' }}</span>
      <span v-if="bridgeConnected" class="w-1.5 h-1.5 rounded-full bg-green-400" title="已连接画布桥"></span>
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
      @load="onIframeLoad"
    ></iframe>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  content: { type: Object, default: () => ({ route: '/', title: '' }) },
  isDragging: { type: Boolean, default: false },
  width: { type: Number, default: 480 },
  height: { type: Number, default: 360 },
  appBaseUrl: { type: String, default: '' },
  nodeId: { type: String, default: '' },
  runtime: { type: Object, default: null },
})

const emit = defineEmits(['update-ports'])

const iframeRef = ref(null)
const bridgeConnected = ref(false)
let pingTimer = null

const appUrl = computed(() => {
  const route = props.content?.route || '/'
  const base = props.appBaseUrl || `http://${location.hostname}:5174`
  return base + route
})

function refresh() {
  if (iframeRef.value) {
    bridgeConnected.value = false
    iframeRef.value.src = iframeRef.value.src
  }
}

// ---- Bridge: postMessage communication with iframe app ----

function handleMessage(event) {
  const data = event.data
  // Only accept messages with the canvas-app protocol marker
  if (!data || data.source !== 'canvas-app') return
  // Filter: only accept messages from this node's iframe
  // 1. If message has nodeId (echoed back), it must match ours
  // 2. If no nodeId (initial 'ready'), try matching event.source to our iframe
  if (data.nodeId) {
    if (data.nodeId !== props.nodeId) return
  } else {
    // For 'ready' messages without nodeId, check event.source when possible
    try {
      if (iframeRef.value?.contentWindow && event.source !== iframeRef.value.contentWindow) return
    } catch { /* cross-origin: can't compare, allow through */ }
  }

  switch (data.type) {
    case 'ready':
    case 'pong':
      bridgeConnected.value = true
      stopPingPolling()
      // Only emit update-ports if ports actually changed
      if (data.manifest?.ports) {
        const newPorts = JSON.stringify(data.manifest.ports)
        const oldPorts = JSON.stringify(props.content?.ports)
        if (newPorts !== oldPorts) {
          emit('update-ports', data.manifest.ports)
        }
      }
      // Only send ping in response to 'ready' (initial handshake)
      // Do NOT ping back on 'pong' — that creates an infinite loop
      if (data.type === 'ready') {
        sendToIframe({ type: 'ping' })
      }
      syncInputsToIframe()
      break

    case 'data-output':
      // App is pushing a data output value → forward to runtime
      if (props.runtime && props.nodeId && data.portId) {
        props.runtime.setDataOutput(props.nodeId, data.portId, data.value)
      }
      break

    case 'control-output':
      // App is emitting a control signal → forward to runtime
      if (props.runtime && props.nodeId && data.portId) {
        props.runtime.emitControl(props.nodeId, data.portId)
      }
      break
  }
}

function sendToIframe(msg) {
  if (!iframeRef.value?.contentWindow) return
  try {
    iframeRef.value.contentWindow.postMessage({
      source: 'canvas-runtime',
      nodeId: props.nodeId,
      ...msg,
    }, '*')
  } catch (e) {
    // Cross-origin errors are expected sometimes
  }
}

/**
 * When iframe finishes loading, start polling with ping messages
 * The iframe app may take a moment to mount its Vue components
 */
function onIframeLoad() {
  if (bridgeConnected.value) return
  startPingPolling()
}

function startPingPolling() {
  stopPingPolling()
  let attempts = 0
  const maxAttempts = 10
  pingTimer = setInterval(() => {
    attempts++
    if (bridgeConnected.value || attempts >= maxAttempts) {
      stopPingPolling()
      return
    }
    sendToIframe({ type: 'ping' })
  }, 500) // Try every 500ms for up to 5 seconds
}

function stopPingPolling() {
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
}

/**
 * Send all current runtime input values to the iframe
 */
function syncInputsToIframe() {
  if (!props.runtime || !props.nodeId) return
  const state = props.runtime.nodeStates[props.nodeId]
  if (state?.inputs) {
    for (const [portId, value] of Object.entries(state.inputs)) {
      sendToIframe({ type: 'set-data-input', portId, value })
    }
  }
}

let stopInputWatch = null
let controlUnsubscribes = []

function subscribeControlPorts() {
  // Clean up old subscriptions
  for (const unsub of controlUnsubscribes) unsub()
  controlUnsubscribes = []

  if (!props.runtime || !props.nodeId) return
  const ports = props.content?.ports
  if (ports?.controlIn) {
    for (const port of ports.controlIn) {
      const unsub = props.runtime.onControl(props.nodeId, port.id, () => {
        // When control signal arrives: sync latest inputs first, then trigger
        syncInputsToIframe()
        sendToIframe({ type: 'trigger-control', portId: port.id })
      })
      controlUnsubscribes.push(unsub)
    }
  }
}

// Re-subscribe when ports change (e.g., manifest loaded from bridge)
watch(() => props.content?.ports, () => {
  subscribeControlPorts()
}, { deep: true })

onMounted(() => {
  window.addEventListener('message', handleMessage)

  if (props.runtime && props.nodeId) {
    // Watch data input changes → push to iframe in real-time
    stopInputWatch = watch(
      () => props.runtime.nodeStates[props.nodeId]?.inputs,
      (inputs) => {
        if (!inputs || !bridgeConnected.value) return
        for (const [portId, value] of Object.entries(inputs)) {
          sendToIframe({ type: 'set-data-input', portId, value })
        }
      },
      { deep: true }
    )

    subscribeControlPorts()
  }
})

onUnmounted(() => {
  window.removeEventListener('message', handleMessage)
  stopPingPolling()
  if (stopInputWatch) stopInputWatch()
  for (const unsub of controlUnsubscribes) unsub()
})
</script>
