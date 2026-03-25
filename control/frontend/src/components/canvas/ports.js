/**
 * Port system for canvas nodes
 *
 * Port kinds:
 * - data-in: receives data values (reactive, updates immediately)
 * - data-out: emits data values
 * - control-in: receives trigger signals (executes action)
 * - control-out: emits trigger signals (events)
 *
 * Value types: string, number, boolean, image, json, file, any
 */

// Port definitions per node type
export const NODE_PORT_DEFS = {
  'text-input': {
    dataOut: [{ id: 'text', name: '文本', valueType: 'string' }],
  },
  'number-input': {
    dataOut: [{ id: 'number', name: '数值', valueType: 'number' }],
  },
  'button': {
    controlOut: [{ id: 'click', name: '点击' }],
  },
  'image-viewer': {
    dataIn: [{ id: 'image', name: '图片', valueType: 'image' }],
  },
  'iframe': {
    // App nodes use dynamic ports from content.ports
    // Default empty, overridden by manifest
  },
  // Existing node types don't have ports
  'text': {},
  'image': {},
  'file': {},
  'request': {},
}

/**
 * Get all ports for a node (merging type defaults with dynamic ports from content)
 */
export function getNodePorts(node) {
  const typeDef = NODE_PORT_DEFS[node.type] || {}
  const ports = {
    dataIn: [...(typeDef.dataIn || [])],
    dataOut: [...(typeDef.dataOut || [])],
    controlIn: [...(typeDef.controlIn || [])],
    controlOut: [...(typeDef.controlOut || [])],
  }

  // Merge dynamic ports from content.ports (for iframe/app nodes)
  if (node.content?.ports) {
    const dp = node.content.ports
    if (dp.dataIn) ports.dataIn.push(...dp.dataIn)
    if (dp.dataOut) ports.dataOut.push(...dp.dataOut)
    if (dp.controlIn) ports.controlIn.push(...dp.controlIn)
    if (dp.controlOut) ports.controlOut.push(...dp.controlOut)
  }

  return ports
}

/**
 * Check if two ports can be connected
 */
export function canConnect(fromPort, toPort) {
  // Data-out can only connect to data-in
  if (fromPort.kind === 'data-out' && toPort.kind === 'data-in') {
    // Type compatibility check
    if (fromPort.valueType === 'any' || toPort.valueType === 'any') return true
    if (fromPort.valueType === toPort.valueType) return true
    // string can connect to any text-compatible type
    if (fromPort.valueType === 'string' && toPort.valueType === 'json') return true
    return false
  }
  // Control-out can only connect to control-in
  if (fromPort.kind === 'control-out' && toPort.kind === 'control-in') {
    return true
  }
  return false
}

/**
 * Get the edge type for a connection
 */
export function getEdgeType(fromPortKind) {
  if (fromPortKind === 'data-out') return 'data'
  if (fromPortKind === 'control-out') return 'control'
  return 'data'
}

/**
 * Port colors
 */
export const PORT_COLORS = {
  'data-in': '#3b82f6',    // blue-500
  'data-out': '#3b82f6',   // blue-500
  'control-in': '#f97316',  // orange-500
  'control-out': '#f97316', // orange-500
}

export const EDGE_COLORS = {
  data: '#3b82f6',     // blue-500
  control: '#f97316',  // orange-500
}
