<template>
  <div class="absolute inset-0 flex w-full h-full bg-surface">
    <!-- Mobile Sidebar Overlay -->
    <div v-if="showSidebar" @click="showSidebar = false"
      class="fixed inset-0 bg-ink-900/10 backdrop-blur-[2px] z-40 sm:hidden transition-opacity duration-300"></div>

    <ConversationList
      :conversations="conversations"
      :activeId="activeId"
      :open="showSidebar"
      :processingIds="processingList"
      :queuedIds="queuedList"
      :unreadIds="[...unreadSet]"
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
      @cancel="cancelTask"
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
const processingList = ref([])
const queuedList = ref([])
const unreadSet = ref(new Set())

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
  // 清除未读标记
  const s = new Set(unreadSet.value)
  s.delete(id)
  unreadSet.value = s
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

async function sendMessage(payload) {
  const { content, files } = payload
  if (!activeId.value) return
  if (!content?.trim() && (!files || !files.length)) return

  let uploadedAttachments = []

  // 先上传文件
  if (files && files.length > 0) {
    const formData = new FormData()
    for (const f of files) formData.append('files', f)
    try {
      const uploadRes = await fetch(`${API}/api/conversations/${activeId.value}/upload`, {
        method: 'POST', body: formData
      })
      const uploadData = await uploadRes.json()
      if (uploadData.success) uploadedAttachments = uploadData.data
    } catch (e) {
      console.error('File upload failed:', e)
    }
  }

  // 本地乐观消息
  messages.value.push({
    id: 'tmp-' + Date.now(), conversation_id: activeId.value,
    role: 'user', content: content?.trim() || '',
    attachments: uploadedAttachments.length > 0 ? uploadedAttachments : null,
    created_at: new Date().toISOString()
  })

  // 发送消息
  await fetch(`${API}/api/conversations/${activeId.value}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: content?.trim() || '',
      attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined
    })
  })
}

async function cancelTask() {
  if (!activeId.value) return
  try {
    await fetch(`${API}/api/conversations/${activeId.value}/cancel`, { method: 'POST' })
  } catch (e) {
    console.error('Cancel failed:', e)
  }
}

function connectWs() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = import.meta.env.DEV ? 'ws://localhost:3000' : `${protocol}//${location.host}`
  ws = new WebSocket(url)
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data)

    if (data.type === 'connected') {
      processingList.value = data.processing || []
      queuedList.value = data.queued || []
      if (activeId.value) {
        isProcessing.value = processingList.value.includes(activeId.value)
      }
      return
    }

    if (data.type === 'queued') {
      if (data.conversationId) queuedList.value = [...new Set([...queuedList.value, data.conversationId])]
      return
    }

    if (data.type === 'processing') {
      if (data.conversationId) {
        processingList.value = [...new Set([...processingList.value, data.conversationId])]
        queuedList.value = queuedList.value.filter(id => id !== data.conversationId)
      }
      if (data.conversationId && data.conversationId !== activeId.value) return
      isProcessing.value = true
      messages.value.push({
        id: 'sys-' + Date.now(), role: 'system',
        content: data.message || '处理中...', created_at: new Date().toISOString()
      })
    } else if (data.type === 'completed') {
      if (data.conversationId) {
        processingList.value = processingList.value.filter(id => id !== data.conversationId)
        // 非当前查看的对话完成时标记为未读
        if (data.conversationId !== activeId.value) {
          unreadSet.value = new Set([...unreadSet.value, data.conversationId])
        }
      }
      if (data.conversationId && data.conversationId !== activeId.value) {
        fetchConvs()
        return
      }
      isProcessing.value = false
      fetchMessages(activeId.value)
      fetchConvs()
    } else if (data.type === 'error') {
      if (data.conversationId) {
        processingList.value = processingList.value.filter(id => id !== data.conversationId)
        // 出错也标记为未读，让用户知道有更新
        if (data.conversationId !== activeId.value) {
          unreadSet.value = new Set([...unreadSet.value, data.conversationId])
        }
      }
      if (data.conversationId && data.conversationId !== activeId.value) return
      isProcessing.value = false
      messages.value.push({
        id: 'err-' + Date.now(), role: 'system',
        content: data.message || '出错', created_at: new Date().toISOString()
      })
    } else if (data.type === 'cancelled') {
      if (data.conversationId) {
        processingList.value = processingList.value.filter(id => id !== data.conversationId)
        queuedList.value = queuedList.value.filter(id => id !== data.conversationId)
      }
      if (data.conversationId === activeId.value) {
        isProcessing.value = false
        fetchMessages(activeId.value)
      }
    } else if (data.type === 'title_updated') {
      const conv = conversations.value.find(c => c.id === data.conversationId)
      if (conv) conv.title = data.title
    }
  }
  ws.onclose = () => setTimeout(connectWs, 5000)
}

watch(activeId, (id) => {
  fetchMessages(id)
  isProcessing.value = id ? processingList.value.includes(id) : false
})
onMounted(() => { fetchConvs(); connectWs() })
onUnmounted(() => { if (ws) ws.close() })
</script>
