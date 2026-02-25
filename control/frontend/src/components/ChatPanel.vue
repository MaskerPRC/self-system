<template>
  <main class="panel">
    <div v-if="!conversationId" class="empty-state">
      <p>选择或创建一个对话</p>
      <p class="hint font-mono">描述需求，AI 会在应用项目中创建交互页面</p>
    </div>

    <template v-else>
      <div class="msgs" ref="msgsRef">
        <div v-if="!messages.length" class="no-msg font-mono">
          <p>描述你想创建的交互页面</p>
          <p class="hint">例如：创建一个待办事项管理页面</p>
        </div>
        <div v-for="m in messages" :key="m.id" class="msg" :class="m.role">
          <div class="msg-head">
            <span class="role">{{ roleMap[m.role] || m.role }}</span>
            <span class="time font-mono">{{ fmtTime(m.created_at) }}</span>
          </div>
          <div class="msg-body">{{ m.content }}</div>
        </div>
        <div v-if="isProcessing" class="processing font-mono">
          <span class="dots"><i/><i/><i/></span> AI 处理中...
        </div>
      </div>

      <div class="input-bar">
        <textarea
          v-model="text" ref="inputRef"
          @keydown.enter.exact.prevent="send"
          :disabled="isProcessing"
          placeholder="描述你想创建的交互页面..."
          class="font-mono"
          rows="1"
        />
        <button @click="send" :disabled="!text.trim() || isProcessing">
          {{ isProcessing ? '...' : '发送' }}
        </button>
      </div>
    </template>
  </main>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  conversationId: String,
  messages: Array,
  isProcessing: Boolean
})
const emit = defineEmits(['send'])

const text = ref('')
const msgsRef = ref(null)
const inputRef = ref(null)
const roleMap = { user: '你', assistant: 'AI', system: '系统' }

function send() {
  if (!text.value.trim() || props.isProcessing) return
  emit('send', text.value)
  text.value = ''
  if (inputRef.value) inputRef.value.style.height = 'auto'
}

function fmtTime(s) {
  if (!s) return ''
  return new Date(s).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

watch(() => props.messages?.length, () => {
  nextTick(() => { if (msgsRef.value) msgsRef.value.scrollTop = msgsRef.value.scrollHeight })
})

watch(text, () => {
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.style.height = 'auto'
      inputRef.value.style.height = Math.min(inputRef.value.scrollHeight, 120) + 'px'
    }
  })
})
</script>

<style scoped>
.panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: #fafafa; }
.empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #aaa; font-size: 15px; }
.hint { font-size: 12px; color: #ccc; margin-top: 6px; }
.msgs { flex: 1; overflow-y: auto; padding: 18px 20px; }
.no-msg { text-align: center; padding: 50px 20px; color: #aaa; font-size: 13px; }
.no-msg .hint { margin-top: 6px; font-size: 11px; color: #ccc; }
.msg { margin-bottom: 14px; max-width: 80%; }
.msg.user { margin-left: auto; }
.msg.assistant { margin-right: auto; }
.msg.system { margin: 6px auto; max-width: 90%; }
.msg-head { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
.msg.user .msg-head { justify-content: flex-end; }
.role { font-size: 10px; font-weight: 700; color: #888; }
.time { font-size: 9px; color: #ccc; }
.msg-body {
  padding: 9px 13px; font-size: 13px; line-height: 1.5;
  word-break: break-word; white-space: pre-wrap; border: 2px solid #000;
}
.msg.user .msg-body { background: #e0e7ff; }
.msg.assistant .msg-body { background: white; }
.msg.system .msg-body { background: #fef3c7; border-color: #d97706; border-width: 1px; font-size: 11px; text-align: center; color: #92400e; }
.processing { display: flex; align-items: center; gap: 6px; color: #aaa; font-size: 12px; padding: 4px 0; }
.dots { display: flex; gap: 3px; }
.dots i { width: 5px; height: 5px; background: #aaa; border-radius: 50%; display: block; animation: blink 1.2s infinite; }
.dots i:nth-child(2) { animation-delay: .2s; }
.dots i:nth-child(3) { animation-delay: .4s; }
@keyframes blink { 0%,80%,100%{opacity:.3} 40%{opacity:1} }
.input-bar { padding: 14px 20px; border-top: 2px solid #000; background: white; display: flex; gap: 8px; align-items: flex-end; }
.input-bar textarea {
  flex: 1; padding: 9px 12px; border: 2px solid #000; font-size: 13px; line-height: 1.4;
  resize: none; outline: none; min-height: 38px; max-height: 120px;
}
.input-bar textarea:focus { background: #fffbeb; }
.input-bar textarea:disabled { opacity: .5; }
.input-bar button {
  background: #000; color: white; border: 2px solid #000; padding: 9px 18px;
  font-size: 12px; font-weight: 700; cursor: pointer;
  box-shadow: 2px 2px 0 #666; transition: all .1s; white-space: nowrap;
}
.input-bar button:hover:not(:disabled) { transform: translate(1px,1px); box-shadow: 1px 1px 0 #666; }
.input-bar button:disabled { opacity: .4; cursor: not-allowed; }
</style>
