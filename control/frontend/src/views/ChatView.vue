<template>
  <div class="absolute inset-0 flex w-full h-full bg-surface">
    <!-- Mobile Sidebar Overlay -->
    <div v-if="showSidebar" @click="showSidebar = false"
      class="fixed inset-0 bg-ink-900/10 backdrop-blur-[2px] z-40 sm:hidden transition-opacity duration-300"></div>

    <ConversationList
      :conversations="conversations"
      :activeId="activeId"
      :open="showSidebar"
      @select="onSelect"
      @create="createConv"
      @delete="deleteConv"
      @rename="renameConv"
    />
    <ChatPanel
      :conversationId="activeId"
      :messages="messages"
      :isProcessing="isProcessing"
      :chatTitle="currentTitle"
      @send="sendMessage"
      @toggle-sidebar="showSidebar = !showSidebar"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import ConversationList from '../components/ConversationList.vue'
import ChatPanel from '../components/ChatPanel.vue'

const API = ''

const conversations = ref([])
const activeId = ref(null)
const messages = ref([])
const isProcessing = ref(false)
const showSidebar = ref(false)
let ws = null
let processingList = []

const currentTitle = computed(() => {
  if (!activeId.value) return '选择一个对话'
  const conv = conversations.value.find(c => c.id === activeId.value)
  return conv ? conv.title : '对话'
})

async function fetchConvs() {
  try {
    const r = await fetch(`${API}/api/conversations`)
    const d = await r.json()
    if (d.success) {
      conversations.value = d.data
      if (!activeId.value && d.data.length) {
        const saved = localStorage.getItem('activeConvId')
        const found = saved && d.data.find(c => c.id === saved)
        activeId.value = found ? saved : d.data[0].id
        localStorage.setItem('activeConvId', activeId.value)
      }
    }
  } catch {}
}

async function fetchMessages(id) {
  if (!id) { messages.value = []; return }
  try {
    const r = await fetch(`${API}/api/conversations/${id}/messages`)
    const d = await r.json()
    if (d.success) messages.value = d.data
  } catch {}
}

function onSelect(id) {
  activeId.value = id
  localStorage.setItem('activeConvId', id)
  showSidebar.value = false
}

async function createConv() {
  const r = await fetch(`${API}/api/conversations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '新对话' })
  })
  const d = await r.json()
  if (d.success) { await fetchConvs(); activeId.value = d.data.id; localStorage.setItem('activeConvId', d.data.id); showSidebar.value = false }
}

async function deleteConv(id) {
  if (!confirm('删除此对话？')) return
  await fetch(`${API}/api/conversations/${id}`, { method: 'DELETE' })
  if (activeId.value === id) { activeId.value = null; messages.value = []; localStorage.removeItem('activeConvId') }
  fetchConvs()
}

async function renameConv(id, title) {
  try {
    await fetch(`${API}/api/conversations/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    })
    const conv = conversations.value.find(c => c.id === id)
    if (conv) conv.title = title
  } catch {}
}

async function sendMessage(content) {
  if (!activeId.value || !content.trim()) return
  messages.value.push({
    id: 'tmp-' + Date.now(), conversation_id: activeId.value,
    role: 'user', content: content.trim(), created_at: new Date().toISOString()
  })
  await fetch(`${API}/api/conversations/${activeId.value}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content.trim() })
  })
}

function connectWs() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = import.meta.env.DEV ? 'ws://localhost:3000' : `${protocol}//${location.host}`
  ws = new WebSocket(url)
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data)

    if (data.type === 'connected') {
      processingList = data.processing || []
      if (activeId.value) {
        isProcessing.value = processingList.includes(activeId.value)
      }
      return
    }

    if (data.type === 'processing') {
      if (data.conversationId) processingList = [...new Set([...processingList, data.conversationId])]
      if (data.conversationId && data.conversationId !== activeId.value) return
      isProcessing.value = true
      messages.value.push({
        id: 'sys-' + Date.now(), role: 'system',
        content: data.message || '处理中...', created_at: new Date().toISOString()
      })
    } else if (data.type === 'completed') {
      if (data.conversationId) processingList = processingList.filter(id => id !== data.conversationId)
      if (data.conversationId && data.conversationId !== activeId.value) return
      isProcessing.value = false
      fetchMessages(activeId.value)
      fetchConvs()
    } else if (data.type === 'error') {
      if (data.conversationId) processingList = processingList.filter(id => id !== data.conversationId)
      if (data.conversationId && data.conversationId !== activeId.value) return
      isProcessing.value = false
      messages.value.push({
        id: 'err-' + Date.now(), role: 'system',
        content: data.message || '出错', created_at: new Date().toISOString()
      })
    } else if (data.type === 'title_updated') {
      const conv = conversations.value.find(c => c.id === data.conversationId)
      if (conv) conv.title = data.title
    }
  }
  ws.onclose = () => setTimeout(connectWs, 5000)
}

watch(activeId, (id) => {
  fetchMessages(id)
  isProcessing.value = id ? processingList.includes(id) : false
})
onMounted(() => { fetchConvs(); connectWs() })
onUnmounted(() => { if (ws) ws.close() })
</script>
