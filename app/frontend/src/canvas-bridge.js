/**
 * Canvas Bridge SDK
 *
 * App pages import this module to communicate with the canvas runtime
 * when embedded as iframe nodes. Works via postMessage.
 *
 * Usage in a Vue app page:
 *
 *   import { useCanvasBridge } from '@/canvas-bridge.js'
 *
 *   const bridge = useCanvasBridge({
 *     manifest: {
 *       ports: {
 *         dataIn: [{ id: 'prompt', name: '提示词', valueType: 'string' }],
 *         controlIn: [{ id: 'generate', name: '生成' }],
 *         dataOut: [{ id: 'result', name: '结果', valueType: 'string' }],
 *         controlOut: [{ id: 'completed', name: '完成' }],
 *       }
 *     },
 *     onDataInput(portId, value) {
 *       // Called when canvas sends data to this app
 *     },
 *     onControl(portId) {
 *       // Called when canvas sends a control signal
 *     }
 *   })
 *
 *   // Push output data
 *   bridge.setDataOutput('result', someValue)
 *
 *   // Emit control signal
 *   bridge.emitControl('completed')
 */

import { ref, onMounted, onUnmounted } from 'vue'

/**
 * Check if we're running inside an iframe (embedded in canvas)
 */
export function isInCanvas() {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/**
 * Canvas Bridge composable
 */
export function useCanvasBridge(options = {}) {
  const { manifest = {}, onDataInput, onControl } = options
  const connected = ref(false)
  const inputs = ref({})  // Reactive store of current input values
  let assignedNodeId = null  // nodeId assigned by the canvas runtime

  function handleMessage(event) {
    const data = event.data
    if (!data || data.source !== 'canvas-runtime') return

    // Remember the nodeId so we can echo it back in all responses
    if (data.nodeId) assignedNodeId = data.nodeId

    switch (data.type) {
      case 'ping':
        // Canvas is checking if we support the bridge protocol
        // Reply with our manifest
        sendToCanvas({
          type: 'pong',
          manifest: manifest,
        })
        connected.value = true
        break

      case 'set-data-input':
        inputs.value[data.portId] = data.value
        if (onDataInput) {
          onDataInput(data.portId, data.value)
        }
        break

      case 'trigger-control':
        if (onControl) {
          onControl(data.portId, data.payload)
        }
        break
    }
  }

  function sendToCanvas(msg) {
    if (!isInCanvas()) return
    window.parent.postMessage({
      source: 'canvas-app',
      nodeId: assignedNodeId,
      ...msg,
    }, '*')
  }

  /**
   * Push a data value to an output port
   */
  function setDataOutput(portId, value) {
    sendToCanvas({
      type: 'data-output',
      portId,
      value,
    })
  }

  /**
   * Emit a control signal from an output port
   */
  function emitControl(portId) {
    sendToCanvas({
      type: 'control-output',
      portId,
    })
  }

  onMounted(() => {
    window.addEventListener('message', handleMessage)
    // Announce ourselves to the canvas
    sendToCanvas({
      type: 'ready',
      manifest: manifest,
    })
  })

  onUnmounted(() => {
    window.removeEventListener('message', handleMessage)
  })

  return {
    connected,
    inputs,
    setDataOutput,
    emitControl,
    isInCanvas: isInCanvas(),
  }
}
