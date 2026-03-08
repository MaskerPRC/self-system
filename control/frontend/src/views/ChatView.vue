<template>
  <div class="absolute inset-0 flex w-full h-full bg-surface">
    <!-- Mobile Sidebar Overlay -->
    <div v-if="showSidebar" @click="showSidebar = false"
      class="fixed inset-0 bg-ink-900/10 backdrop-blur-[2px] z-40 sm:hidden transition-opacity duration-300"></div>

    <ConversationList
      :conversations="filteredConversations"
      :activeId="activeId"
      :open="showSidebar"
      :processingIds="processingList"
      :queuedIds="queuedList"
      :unreadIds="[...unreadSet]"
      :watchIds="[...watchSet]"
      :hasWatchItems="hasWatchItems"
      :showWatchOnly="showWatchOnly"
      @select="onSelect"
      @create="createConv"
      @delete="deleteConv"
      @rename="renameConv"
      @toggle-watch="toggleWatchConv"
      @toggle-watch-filter="showWatchOnly = !showWatchOnly"
    />
    <ChatPanel
      :conversationId="activeId"
      :messages="messages"
      :isProcessing="isProcessing"
      :chatTitle="currentTitle"
      :todoContent="todoContent"
      :watchMsgIds="watchMsgIds"
      :pages="pages"
      :skills="skills"
      @send="handleSend"
      @cancel="cancelTask"
      @toggle-sidebar="showSidebar = !showSidebar"
      @toggle-watch-msg="toggleWatchMsg"
    />

    <!-- 并行任务确认弹窗 -->
    <div v-if="parallelConfirm" class="fixed inset-0 bg-ink-900/20 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" @click.self="cancelParallel">
      <div class="bg-paper rounded-3xl shadow-xl border border-stone-200 w-full max-w-sm overflow-hidden animate-fade-in-up">
        <div class="px-6 pt-5 pb-3">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-500">
              <i class="ph-duotone ph-warning text-lg"></i>
            </div>
            <h4 class="font-serif font-medium text-ink-900">并行执行确认</h4>
          </div>
          <p class="text-sm text-ink-600 mb-3">当前有任务正在运行，确定要并行执行吗？</p>
          <div class="space-y-1.5 mb-1">
            <div v-for="t in runningTasks" :key="t.id"
              class="flex items-center gap-2 text-xs bg-surface rounded-xl px-3 py-2 border border-stone-100">
              <i class="ph-duotone ph-circle-notch animate-spin text-brand-500 shrink-0"></i>
              <span class="text-ink-700 truncate">{{ t.title }}</span>
            </div>
          </div>
        </div>
        <div class="flex border-t border-stone-100">
          <button @click="cancelParallel" class="flex-1 py-3.5 text-sm text-ink-500 hover:bg-stone-50 transition-colors font-medium">取消</button>
          <button @click="confirmParallel" class="flex-1 py-3.5 text-sm text-brand-600 hover:bg-brand-50 transition-colors font-medium border-l border-stone-100">确认并行</button>
        </div>
      </div>
    </div>
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
const todoContent = ref(null)
let todoTimer = null

// App pages 列表（用于 @mention）
const pages = ref([])
// Skills 列表（用于 @mention）
const skills = ref([])

async function fetchPages() {
  try {
    const r = await fetch(`${API}/api/pages`)
    const d = await r.json()
    if (d.success) pages.value = d.data || []
  } catch {}
}

async function fetchSkills() {
  try {
    const r = await fetch(`${API}/api/skills`)
    const d = await r.json()
    if (d.success) skills.value = d.data || []
  } catch {}
}

// 待查看功能
const watchSet = ref(new Set(JSON.parse(localStorage.getItem('watchConvIds') || '[]')))
// watchMessageMap: { msgId: convId } — 记录每条待查看消息所属对话
const watchMessageMap = ref(JSON.parse(localStorage.getItem('watchMsgMap') || '{}'))
const showWatchOnly = ref(false)

function saveWatch() {
  localStorage.setItem('watchConvIds', JSON.stringify([...watchSet.value]))
  localStorage.setItem('watchMsgMap', JSON.stringify(watchMessageMap.value))
}

function toggleWatchConv(id) {
  const s = new Set(watchSet.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  watchSet.value = s
  saveWatch()
}

function toggleWatchMsg(msgId) {
  const map = { ...watchMessageMap.value }
  if (map[msgId]) {
    delete map[msgId]
  } else {
    map[msgId] = activeId.value
  }
  watchMessageMap.value = map
  saveWatch()
}

const watchMsgIds = computed(() => Object.keys(watchMessageMap.value))
const hasWatchItems = computed(() => watchSet.value.size > 0 || watchMsgIds.value.length > 0)

// 包含待查看消息的对话 ID 集合
const watchMsgConvIds = computed(() => new Set(Object.values(watchMessageMap.value)))

const filteredConversations = computed(() => {
  if (!showWatchOnly.value) return conversations.value
  return conversations.value.filter(c =>
    watchSet.value.has(c.id) || watchMsgConvIds.value.has(c.id)
  )
})

// 并行确认弹窗
const parallelConfirm = ref(false)
let pendingPayload = null

const runningTasks = computed(() => {
  return processingList.value
    .filter(id => id !== activeId.value)
    .map(id => {
      const conv = conversations.value.find(c => c.id === id)
      return { id, title: conv ? conv.title : '未知对话' }
    })
})

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
  const { content, files, targetApps, targetSkills } = payload
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
      attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
      targetApps: targetApps || undefined,
      targetSkills: targetSkills || undefined
    })
  })
}

// 发送前检查是否需要并行确认
function handleSend(payload) {
  const otherRunning = processingList.value.filter(id => id !== activeId.value)
  if (otherRunning.length > 0) {
    pendingPayload = payload
    parallelConfirm.value = true
    return
  }
  sendMessage(payload)
}

function confirmParallel() {
  parallelConfirm.value = false
  if (pendingPayload) {
    sendMessage(pendingPayload)
    pendingPayload = null
  }
}

function cancelParallel() {
  parallelConfirm.value = false
  pendingPayload = null
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

// 监听来自 App.vue 的对话切换事件（一键修Bug触发）
function onSwitchConversation(e) {
  const id = e.detail?.id
  if (id) {
    activeId.value = id
    localStorage.setItem('activeConvId', id)
    fetchConvs()
  }
}

watch(activeId, (id) => {
  fetchMessages(id)
  isProcessing.value = id ? processingList.value.includes(id) : false
})

// TODO 进度轮询
async function fetchTodo() {
  if (!activeId.value) return
  try {
    const r = await fetch(`${API}/api/conversations/${activeId.value}/todo`)
    const d = await r.json()
    todoContent.value = d.content || null
  } catch {
    todoContent.value = null
  }
}

function startTodoPoll() {
  stopTodoPoll()
  fetchTodo()
  todoTimer = setInterval(fetchTodo, 3000)
}

function stopTodoPoll() {
  if (todoTimer) { clearInterval(todoTimer); todoTimer = null }
  todoContent.value = null
}

watch(isProcessing, (val) => {
  if (val) startTodoPoll()
  else stopTodoPoll()
})
onMounted(() => {
  fetchConvs()
  fetchPages()
  fetchSkills()
  connectWs()
  window.addEventListener('switch-conversation', onSwitchConversation)
})
onUnmounted(() => {
  if (ws) ws.close()
  stopTodoPoll()
  window.removeEventListener('switch-conversation', onSwitchConversation)
})
</script>
