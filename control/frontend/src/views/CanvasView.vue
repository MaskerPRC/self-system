<template>
  <div class="fixed inset-0 bottom-[60px] flex flex-col bg-stone-100">
    <CanvasToolbar
      :projects="projects"
      :activeProject="activeProject"
      :zoom="zoom"
      :pages="pages"
      @select-project="selectProject"
      @create-project="createProject"
      @rename-project="renameProject"
      @delete-project="deleteProject"
      @add-text="addTextNode"
      @add-iframe="addIframeNode"
      @add-text-input="addTextInputNode"
      @add-number-input="addNumberInputNode"
      @add-button="addButtonNode"
      @add-image-viewer="addImageViewerNode"
      @zoom-in="zoomIn"
      @zoom-out="zoomOut"
      @zoom-reset="zoomReset"
    />
    <div class="flex-1 relative overflow-hidden">
      <InfiniteCanvas
        ref="canvasRef"
        :nodes="nodes"
        :edges="edges"
        :zoom="zoom"
        :offset="offset"
        :appBaseUrl="appBaseUrl"
        :runtime="runtime"
        @update:zoom="zoom = $event"
        @update:offset="offset = $event"
        @update-node="handleUpdateNode"
        @update-nodes-batch="handleUpdateNodesBatch"
        @delete-nodes="handleDeleteNodes"
        @create-node="handleCreateNode"
        @select-nodes="onSelectNodes"
        @request-ai="showRequestPanel = true"
        @upload-files="handleUploadFiles"
        @create-edge="handleCreateEdge"
        @delete-edge="handleDeleteEdge"
      />
      <RequestPanel
        v-if="showRequestPanel"
        :selectedNodes="selectedNodes"
        :loading="requestLoading"
        :anchorRect="selectionScreenRect"
        @submit="handleAiRequest"
        @close="showRequestPanel = false"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import CanvasToolbar from '../components/canvas/CanvasToolbar.vue'
import InfiniteCanvas from '../components/canvas/InfiniteCanvas.vue'
import RequestPanel from '../components/canvas/RequestPanel.vue'
import { createRuntime } from '../components/canvas/runtime.js'

const API = ''

// ---- Runtime Engine ----
const runtime = createRuntime()

// ---- Projects ----
const projects = ref([])
const activeProject = ref(null)
const nodes = ref([])
const edges = ref([])
const zoom = ref(1)
const offset = ref({ x: 0, y: 0 })
const canvasRef = ref(null)
const showRequestPanel = ref(false)
const requestLoading = ref(false)
const selectedNodeIds = ref([])
const pages = ref([])
const appBaseUrl = ref(`http://${location.hostname}:5174`)

// Keep runtime edges in sync
watch(edges, (newEdges) => {
  runtime.setEdges(newEdges)
}, { deep: true })

const selectedNodes = computed(() => {
  return nodes.value.filter(n => selectedNodeIds.value.includes(n.id))
})

const selectionScreenRect = computed(() => {
  const sel = selectedNodes.value
  if (sel.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of sel) {
    const sx = n.x * zoom.value + offset.value.x
    const sy = n.y * zoom.value + offset.value.y
    const sw = n.width * zoom.value
    const sh = (n.height || 60) * zoom.value
    if (sx < minX) minX = sx
    if (sy < minY) minY = sy
    if (sx + sw > maxX) maxX = sx + sw
    if (sy + sh > maxY) maxY = sy + sh
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
})

async function fetchProjects() {
  try {
    const r = await fetch(`${API}/api/projects`)
    const d = await r.json()
    if (d.success) {
      projects.value = d.data || []
      if (projects.value.length === 0) {
        await createProject('默认画布')
      } else {
        const savedId = localStorage.getItem('activeCanvasProject')
        const found = savedId && projects.value.find(p => p.id === savedId)
        selectProject(found ? found.id : projects.value[0].id)
      }
    }
  } catch (e) {
    console.error('Failed to fetch projects:', e)
  }
}

async function fetchPages() {
  try {
    const r = await fetch(`${API}/api/pages`)
    const d = await r.json()
    if (d.success) pages.value = d.data || []
  } catch (e) {
    console.error('Failed to fetch pages:', e)
  }
}

async function fetchAppConfig() {
  try {
    const r = await fetch(`${API}/api/config`)
    const d = await r.json()
    if (d.appExternalUrl) appBaseUrl.value = d.appExternalUrl
  } catch {}
}

async function fetchNodes(projectId) {
  if (!projectId) { nodes.value = []; return }
  try {
    const r = await fetch(`${API}/api/projects/${projectId}/nodes`)
    const d = await r.json()
    if (d.success) nodes.value = d.data || []
  } catch (e) {
    console.error('Failed to fetch nodes:', e)
  }
}

async function fetchEdges(projectId) {
  if (!projectId) { edges.value = []; return }
  try {
    const r = await fetch(`${API}/api/projects/${projectId}/edges`)
    const d = await r.json()
    if (d.success) edges.value = d.data || []
  } catch (e) {
    console.error('Failed to fetch edges:', e)
  }
}

function selectProject(id) {
  activeProject.value = id
  localStorage.setItem('activeCanvasProject', id)

  const project = projects.value.find(p => p.id === id)
  const state = project?.canvas_state
  if (state && typeof state === 'object' && state.zoom != null) {
    zoom.value = state.zoom
    offset.value = state.offset || { x: 0, y: 0 }
  } else {
    zoom.value = 1
    offset.value = { x: 0, y: 0 }
  }

  fetchNodes(id)
  fetchEdges(id)
}

async function createProject(name) {
  const title = typeof name === 'string' ? name : '新画布'
  try {
    const r = await fetch(`${API}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: title })
    })
    const d = await r.json()
    if (d.success) {
      await fetchProjects()
      if (d.data?.id) selectProject(d.data.id)
    }
  } catch (e) {
    console.error('Failed to create project:', e)
  }
}

async function renameProject({ id, name }) {
  try {
    await fetch(`${API}/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    const p = projects.value.find(p => p.id === id)
    if (p) p.name = name
  } catch (e) {
    console.error('Failed to rename project:', e)
  }
}

async function deleteProject(id) {
  if (!confirm('确定删除此画布？所有节点将被删除。')) return
  try {
    await fetch(`${API}/api/projects/${id}`, { method: 'DELETE' })
    projects.value = projects.value.filter(p => p.id !== id)
    if (activeProject.value === id) {
      if (projects.value.length > 0) {
        selectProject(projects.value[0].id)
      } else {
        activeProject.value = null
        nodes.value = []
        edges.value = []
        localStorage.removeItem('activeCanvasProject')
        await createProject('默认画布')
      }
    }
  } catch (e) {
    console.error('Failed to delete project:', e)
  }
}

// ---- Node CRUD ----

function getViewportCenter() {
  const el = canvasRef.value?.$el
  if (!el) return { x: 200, y: 200 }
  const rect = el.getBoundingClientRect()
  return {
    x: (rect.width / 2 - offset.value.x) / zoom.value,
    y: (rect.height / 2 - offset.value.y) / zoom.value
  }
}

function addTextNode() {
  const center = getViewportCenter()
  handleCreateNode({
    type: 'text',
    x: center.x - 100,
    y: center.y - 40,
    width: 200,
    height: 80,
    content: { text: '', fontSize: 14 }
  })
}

function addIframeNode(pageInfo) {
  const route = pageInfo?.route || '/'
  const title = pageInfo?.title || route
  const center = getViewportCenter()
  handleCreateNode({
    type: 'iframe',
    x: center.x - 240,
    y: center.y - 180,
    width: 480,
    height: 360,
    content: { route, title }
  })
}

function addTextInputNode() {
  const center = getViewportCenter()
  handleCreateNode({
    type: 'text-input',
    x: center.x - 100,
    y: center.y - 50,
    width: 200,
    height: 100,
    content: { text: '' }
  })
}

function addNumberInputNode() {
  const center = getViewportCenter()
  handleCreateNode({
    type: 'number-input',
    x: center.x - 80,
    y: center.y - 45,
    width: 160,
    height: 90,
    content: { number: 0 }
  })
}

function addButtonNode() {
  const center = getViewportCenter()
  handleCreateNode({
    type: 'button',
    x: center.x - 80,
    y: center.y - 40,
    width: 160,
    height: 80,
    content: { label: '执行' }
  })
}

function addImageViewerNode() {
  const center = getViewportCenter()
  handleCreateNode({
    type: 'image-viewer',
    x: center.x - 150,
    y: center.y - 120,
    width: 300,
    height: 240,
    content: {}
  })
}

async function handleCreateNode(nodeData) {
  if (!activeProject.value) return
  try {
    const r = await fetch(`${API}/api/projects/${activeProject.value}/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nodeData)
    })
    const d = await r.json()
    if (d.success && d.data) {
      nodes.value.push(d.data)
    }
  } catch (e) {
    console.error('Failed to create node:', e)
  }
}

async function handleUpdateNode(update) {
  const idx = nodes.value.findIndex(n => n.id === update.id)
  if (idx === -1) return
  nodes.value[idx] = { ...nodes.value[idx], ...update }
  try {
    await fetch(`${API}/api/projects/${activeProject.value}/nodes/${update.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    })
  } catch (e) {
    console.error('Failed to update node:', e)
  }
}

async function handleUpdateNodesBatch(updates) {
  for (const update of updates) {
    const idx = nodes.value.findIndex(n => n.id === update.id)
    if (idx !== -1) nodes.value[idx] = { ...nodes.value[idx], ...update }
  }
  try {
    await fetch(`${API}/api/projects/${activeProject.value}/nodes/batch`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    })
  } catch (e) {
    console.error('Failed to batch update nodes:', e)
  }
}

async function handleDeleteNodes(ids) {
  nodes.value = nodes.value.filter(n => !ids.includes(n.id))
  // Also remove edges connected to deleted nodes
  edges.value = edges.value.filter(e => !ids.includes(e.from_node_id) && !ids.includes(e.to_node_id))
  try {
    await fetch(`${API}/api/projects/${activeProject.value}/nodes/batch-delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    })
  } catch (e) {
    console.error('Failed to delete nodes:', e)
  }
}

function onSelectNodes(ids) {
  selectedNodeIds.value = ids
}

// ---- Edge CRUD ----

async function handleCreateEdge(edgeData) {
  if (!activeProject.value) return
  try {
    const r = await fetch(`${API}/api/projects/${activeProject.value}/edges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edgeData)
    })
    const d = await r.json()
    if (d.success && d.data) {
      // Avoid duplicates
      if (!edges.value.find(e => e.id === d.data.id)) {
        edges.value.push(d.data)
      }
    }
  } catch (e) {
    console.error('Failed to create edge:', e)
  }
}

async function handleDeleteEdge(edgeId) {
  edges.value = edges.value.filter(e => e.id !== edgeId)
  if (!activeProject.value) return
  try {
    await fetch(`${API}/api/projects/${activeProject.value}/edges/${edgeId}`, {
      method: 'DELETE'
    })
  } catch (e) {
    console.error('Failed to delete edge:', e)
  }
}

// ---- File Upload ----

async function handleUploadFiles({ files, position }) {
  if (!activeProject.value || !files.length) return
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file)
  }
  try {
    const r = await fetch(`${API}/api/projects/${activeProject.value}/upload`, {
      method: 'POST',
      body: formData
    })
    const d = await r.json()
    if (d.success && d.data) {
      for (let i = 0; i < d.data.length; i++) {
        const fileInfo = d.data[i]
        const isImage = fileInfo.type?.startsWith('image/')
        await handleCreateNode({
          type: isImage ? 'image' : 'file',
          x: Math.round(position.x + i * 30),
          y: Math.round(position.y + i * 30),
          width: isImage ? 300 : 200,
          height: isImage ? 200 : 60,
          content: isImage
            ? { src: fileInfo.url, originalName: fileInfo.name }
            : { name: fileInfo.name, size: fileInfo.size, mimeType: fileInfo.type, url: fileInfo.url }
        })
      }
    }
  } catch (e) {
    console.error('Upload failed:', e)
  }
}

// ---- AI Request ----

async function handleAiRequest(prompt) {
  if (!activeProject.value || selectedNodes.value.length === 0) return
  requestLoading.value = true

  // Position request node to the right of the selected nodes
  const maxX = Math.max(...selectedNodes.value.map(n => n.x + n.width))
  const avgY = selectedNodes.value.reduce((s, n) => s + n.y, 0) / selectedNodes.value.length

  try {
    const r = await fetch(`${API}/api/projects/${activeProject.value}/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        contextNodeIds: selectedNodes.value.map(n => n.id),
        requestNodeX: Math.round(maxX + 60),
        requestNodeY: Math.round(avgY)
      })
    })
    const d = await r.json()
    if (d.success && d.data) {
      // Fetch the newly created request node to display it
      await fetchNodes(activeProject.value)
    }
  } catch (e) {
    console.error('AI request failed:', e)
  } finally {
    requestLoading.value = false
    showRequestPanel.value = false
  }
}

// ---- Persist viewport state ----

let canvasStateSaveTimer = null

watch([zoom, offset], () => {
  if (!activeProject.value) return
  clearTimeout(canvasStateSaveTimer)
  canvasStateSaveTimer = setTimeout(async () => {
    if (!activeProject.value) return
    try {
      await fetch(`${API}/api/projects/${activeProject.value}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canvas_state: { zoom: zoom.value, offset: { x: offset.value.x, y: offset.value.y } }
        })
      })
    } catch {}
  }, 500)
}, { deep: true })

// ---- Zoom ----

function zoomIn() {
  zoom.value = Math.min(3, zoom.value * 1.2)
}

function zoomOut() {
  zoom.value = Math.max(0.1, zoom.value / 1.2)
}

function zoomReset() {
  zoom.value = 1
  offset.value = { x: 0, y: 0 }
}

// ---- WebSocket ----

let ws = null

function connectWs() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = import.meta.env.DEV ? 'ws://localhost:3000' : `${protocol}//${location.host}`
  ws = new WebSocket(url)
  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      if (data.type === 'canvas_node_created') {
        const exists = nodes.value.find(n => n.id === data.node?.id)
        if (!exists && data.node) nodes.value.push(data.node)
      } else if (data.type === 'canvas_node_updated') {
        if (data.node) {
          const idx = nodes.value.findIndex(n => n.id === data.node.id)
          if (idx !== -1) nodes.value[idx] = { ...nodes.value[idx], ...data.node }
        }
      } else if (data.type === 'processing' || data.type === 'completed' || data.type === 'error') {
        // Update request nodes that reference this conversation
        const convId = data.conversationId
        if (convId) {
          nodes.value.forEach((node, idx) => {
            if (node.type === 'request' && node.content?.conversationId === convId) {
              const updated = { ...node }
              if (data.type === 'completed') {
                updated.content = { ...updated.content, status: 'completed' }
              } else if (data.type === 'error') {
                updated.content = { ...updated.content, status: 'error', error: data.message || '出错' }
              } else if (data.type === 'processing') {
                updated.content = { ...updated.content, status: 'processing' }
              }
              nodes.value[idx] = updated
            }
          })
        }
      }
    } catch {}
  }
  ws.onclose = () => { setTimeout(connectWs, 5000) }
}

onMounted(() => {
  document.title = '无限画布'
  fetchProjects()
  fetchPages()
  fetchAppConfig()
  connectWs()
})

onUnmounted(() => {
  clearTimeout(canvasStateSaveTimer)
  if (ws) ws.close()
})
</script>
