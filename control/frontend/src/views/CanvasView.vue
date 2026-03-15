<template>
  <div class="fixed inset-0 bottom-[60px] flex flex-col bg-stone-100">
    <CanvasToolbar
      :projects="projects"
      :activeProject="activeProject"
      :zoom="zoom"
      @select-project="selectProject"
      @create-project="createProject"
      @rename-project="renameProject"
      @delete-project="deleteProject"
      @add-text="addTextNode"
      @add-iframe="addIframeNode"
      @zoom-in="zoomIn"
      @zoom-out="zoomOut"
      @zoom-reset="zoomReset"
    />
    <div class="flex-1 relative overflow-hidden">
      <InfiniteCanvas
        ref="canvasRef"
        :nodes="nodes"
        :zoom="zoom"
        :offset="offset"
        @update:zoom="zoom = $event"
        @update:offset="offset = $event"
        @update-node="handleUpdateNode"
        @update-nodes-batch="handleUpdateNodesBatch"
        @delete-nodes="handleDeleteNodes"
        @create-node="handleCreateNode"
        @select-nodes="onSelectNodes"
        @request-ai="showRequestPanel = true"
        @upload-files="handleUploadFiles"
      />
    </div>
    <RequestPanel
      v-if="showRequestPanel"
      :selectedNodes="selectedNodes"
      :loading="requestLoading"
      @submit="handleAiRequest"
      @close="showRequestPanel = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import CanvasToolbar from '../components/canvas/CanvasToolbar.vue'
import InfiniteCanvas from '../components/canvas/InfiniteCanvas.vue'
import RequestPanel from '../components/canvas/RequestPanel.vue'

const API = ''

// ---- Projects ----
const projects = ref([])
const activeProject = ref(null)
const nodes = ref([])
const zoom = ref(1)
const offset = ref({ x: 0, y: 0 })
const canvasRef = ref(null)
const showRequestPanel = ref(false)
const requestLoading = ref(false)
const selectedNodeIds = ref([])

const selectedNodes = computed(() => {
  return nodes.value.filter(n => selectedNodeIds.value.includes(n.id))
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

function selectProject(id) {
  activeProject.value = id
  localStorage.setItem('activeCanvasProject', id)
  fetchNodes(id)
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

function addIframeNode() {
  const route = prompt('输入应用路由路径（如 /）：')
  if (!route) return
  const center = getViewportCenter()
  handleCreateNode({
    type: 'iframe',
    x: center.x - 240,
    y: center.y - 180,
    width: 480,
    height: 360,
    content: { route, title: route }
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
  connectWs()
})

onUnmounted(() => {
  if (ws) ws.close()
})
</script>
