/**
 * Canvas Runtime Engine
 *
 * Manages data propagation and control signal triggering
 * between connected nodes on the canvas.
 *
 * Key principles:
 * - Data flow is reactive: when a data output changes, connected inputs update immediately
 * - Control flow is event-based: signals are one-shot triggers
 * - Data updates ≠ execution. Execution requires a control signal.
 */

import { reactive, watch } from 'vue'

export function createRuntime() {
  // Node states: nodeId -> { inputs: { portId: value }, outputs: { portId: value } }
  const nodeStates = reactive({})

  // Event listeners for control signals
  const controlListeners = new Map() // key: `${nodeId}:${portId}`, value: Set<callback>

  // Edge index for fast lookup
  let edges = []

  function setEdges(newEdges) {
    edges = newEdges
    // Re-propagate all existing outputs through new edges
    // This handles the case where nodes initialized before edges were loaded
    for (const edge of edges) {
      if (edge.edge_type !== 'data') continue
      const srcState = nodeStates[edge.from_node_id]
      if (!srcState?.outputs) continue
      const value = srcState.outputs[edge.from_port_id]
      if (value !== undefined) {
        const targetState = ensureNodeState(edge.to_node_id)
        targetState.inputs[edge.to_port_id] = value
      }
    }
  }

  /**
   * Initialize or get node state
   */
  function ensureNodeState(nodeId) {
    if (!nodeStates[nodeId]) {
      nodeStates[nodeId] = { inputs: {}, outputs: {} }
    }
    return nodeStates[nodeId]
  }

  /**
   * Set a data output value and propagate to connected inputs
   */
  function setDataOutput(nodeId, portId, value) {
    const state = ensureNodeState(nodeId)
    state.outputs[portId] = value

    // Propagate to all connected data-in ports
    for (const edge of edges) {
      if (edge.edge_type === 'data' && edge.from_node_id === nodeId && edge.from_port_id === portId) {
        const targetState = ensureNodeState(edge.to_node_id)
        targetState.inputs[edge.to_port_id] = value
      }
    }
  }

  /**
   * Get current data input value for a node's port
   */
  function getDataInput(nodeId, portId) {
    return nodeStates[nodeId]?.inputs?.[portId]
  }

  /**
   * Get current data output value for a node's port
   */
  function getDataOutput(nodeId, portId) {
    return nodeStates[nodeId]?.outputs?.[portId]
  }

  /**
   * Emit a control signal from a node's control-out port
   */
  function emitControl(nodeId, portId) {
    // Trigger all connected control-in ports
    for (const edge of edges) {
      if (edge.edge_type === 'control' && edge.from_node_id === nodeId && edge.from_port_id === portId) {
        const key = `${edge.to_node_id}:${edge.to_port_id}`
        const listeners = controlListeners.get(key)
        if (listeners) {
          for (const cb of listeners) {
            try { cb() } catch (e) { console.error('[Runtime] Control handler error:', e) }
          }
        }
      }
    }
  }

  /**
   * Subscribe to control signals on a node's control-in port
   * Returns unsubscribe function
   */
  function onControl(nodeId, portId, callback) {
    const key = `${nodeId}:${portId}`
    if (!controlListeners.has(key)) {
      controlListeners.set(key, new Set())
    }
    controlListeners.get(key).add(callback)
    return () => {
      const set = controlListeners.get(key)
      if (set) {
        set.delete(callback)
        if (set.size === 0) controlListeners.delete(key)
      }
    }
  }

  /**
   * Clean up state for a removed node
   */
  function removeNode(nodeId) {
    delete nodeStates[nodeId]
    // Clean up control listeners for this node
    for (const key of controlListeners.keys()) {
      if (key.startsWith(`${nodeId}:`)) {
        controlListeners.delete(key)
      }
    }
  }

  /**
   * Get reactive node state (for Vue components to watch)
   */
  function getNodeState(nodeId) {
    return ensureNodeState(nodeId)
  }

  return {
    nodeStates,
    setEdges,
    ensureNodeState,
    setDataOutput,
    getDataInput,
    getDataOutput,
    emitControl,
    onControl,
    removeNode,
    getNodeState,
  }
}
