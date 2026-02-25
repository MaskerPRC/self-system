<template>
  <div class="chat-page">
    <ConversationList
      :conversations="conversations"
      :activeId="activeId"
      @select="selectConv"
      @create="createConv"
      @delete="deleteConv"
    />
    <ChatPanel
      :conversationId="activeId"
      :messages="messages"
      :isProcessing="isProcessing"
      @send="sendMessage"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import ConversationList from '../components/ConversationList.vue'
import ChatPanel from '../components/ChatPanel.vue'

const API = import.meta.env.DEV ? '' : `http://${location.hostname}:3000`

const conversations = ref([])
const activeId = ref(null)
const messages = ref([])
const isProcessing = ref(false)
let ws = null

async function fetchConvs() {
  try {
    const r = await fetch(`${API}/api/conversations`)
    const d = await r.json()
    if (d.success) conversations.value = d.data
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

function selectConv(id) { activeId.value = id }

async function createConv() {
  const r = await fetch(`${API}/api/conversations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '新对话' })
  })
  const d = await r.json()
  if (d.success) { await fetchConvs(); activeId.value = d.data.id }
}

async function deleteConv(id) {
  if (!confirm('删除此对话？')) return
  await fetch(`${API}/api/conversations/${id}`, { method: 'DELETE' })
  if (activeId.value === id) { activeId.value = null; messages.value = [] }
  fetchConvs()
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
  const url = import.meta.env.DEV ? 'ws://localhost:3000' : `ws://${location.hostname}:3000`
  ws = new WebSocket(url)
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data)
    if (data.conversationId && data.conversationId !== activeId.value) return
    if (data.type === 'processing') {
      isProcessing.value = true
      messages.value.push({
        id: 'sys-' + Date.now(), role: 'system',
        content: data.message || '处理中...', created_at: new Date().toISOString()
      })
    } else if (data.type === 'completed') {
      isProcessing.value = false
      fetchMessages(activeId.value)
      fetchConvs()
    } else if (data.type === 'error') {
      isProcessing.value = false
      messages.value.push({
        id: 'err-' + Date.now(), role: 'system',
        content: data.message || '出错', created_at: new Date().toISOString()
      })
    }
  }
  ws.onclose = () => setTimeout(connectWs, 5000)
}

watch(activeId, (id) => fetchMessages(id))
onMounted(() => { fetchConvs(); connectWs() })
onUnmounted(() => { if (ws) ws.close() })
</script>

<style scoped>
.chat-page { flex: 1; display: flex; overflow: hidden; }
</style>
