<template>
  <section class="flex-1 flex flex-col h-full relative bg-paper shadow-[-10px_0_30px_rgba(0,0,0,0.02)] sm:rounded-tl-[2.5rem] overflow-hidden border-l border-stone-100">
    <!-- Header -->
    <header class="h-16 flex items-center px-6 justify-between shrink-0 bg-paper/90 backdrop-blur-sm z-10">
      <div class="flex items-center gap-3">
        <button @click="$emit('toggle-sidebar')" class="sm:hidden p-2 -ml-2 text-ink-500 hover:bg-stone-100 rounded-full transition-colors">
          <i class="ph ph-list text-xl"></i>
        </button>
        <h3 class="font-serif font-medium text-ink-900 text-lg">{{ chatTitle }}</h3>
      </div>
    </header>

    <!-- Messages -->
    <div ref="msgsRef" class="flex-1 overflow-y-auto px-4 sm:px-10 py-6 space-y-8 pb-40">
      <!-- Empty: no conversation selected -->
      <div v-if="!conversationId" class="h-full flex flex-col items-center justify-center text-ink-500">
        <div class="w-12 h-12 mb-4 text-brand-500 opacity-80">
          <i class="ph-duotone ph-sparkle text-5xl"></i>
        </div>
        <p class="font-serif text-lg text-ink-800">开始与 Claude Code 协作</p>
        <p class="text-sm mt-2 text-ink-400">描述你想构建的界面或功能</p>
      </div>

      <!-- Empty: conversation selected but no messages -->
      <div v-else-if="!messages.length" class="h-full flex flex-col items-center justify-center text-ink-500">
        <div class="w-12 h-12 mb-4 text-brand-500 opacity-80">
          <i class="ph-duotone ph-sparkle text-5xl"></i>
        </div>
        <p class="font-serif text-lg text-ink-800">描述你想创建的交互页面</p>
        <p class="text-sm mt-2 text-ink-400">例如：创建一个待办事项管理页面</p>
      </div>

      <!-- Messages list -->
      <template v-for="m in messages" :key="m.id">
        <!-- System message -->
        <div v-if="m.role === 'system'" class="flex justify-center my-6 animate-fade-in-up">
          <div class="bg-surface border border-stone-200 text-ink-500 text-xs px-4 py-2 rounded-full flex items-center gap-2 shadow-sm font-mono">
            <i class="ph-duotone ph-file-code"></i>
            {{ m.content }}
          </div>
        </div>

        <!-- User message -->
        <div v-else-if="m.role === 'user'" class="flex justify-end animate-fade-in-up">
          <div class="max-w-[85%] sm:max-w-[70%] bg-surface border border-stone-200 text-ink-900 px-6 py-4 rounded-3xl rounded-tr-md shadow-sm text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {{ m.content }}
          </div>
        </div>

        <!-- Assistant message -->
        <div v-else class="flex gap-4 animate-fade-in-up max-w-[90%] sm:max-w-[80%]">
          <div class="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 shrink-0 border border-brand-100 mt-1">
            <i class="ph-fill ph-sparkle"></i>
          </div>
          <div class="flex flex-col">
            <span class="text-sm font-serif font-semibold text-ink-900 mb-1">Claude</span>
            <div class="text-ink-800 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
              {{ m.content }}
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Floating Input Area -->
    <div class="absolute bottom-24 left-0 right-0 px-4 sm:px-10 flex justify-center pointer-events-none">
      <div v-if="conversationId" class="w-full max-w-3xl relative bg-paper rounded-3xl border border-stone-200 shadow-float focus-within:border-stone-300 focus-within:shadow-xl transition-all duration-300 pointer-events-auto">
        <textarea
          ref="inputRef"
          v-model="text"
          @keydown.enter.exact.prevent="send"
          :disabled="isProcessing"
          rows="1"
          class="w-full bg-transparent border-0 outline-none resize-none py-4 pl-6 pr-14 text-ink-900 placeholder-ink-400 max-h-[160px] disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
          placeholder="输入需求..."
        ></textarea>

        <button @click="send" :disabled="!text.trim() || isProcessing"
          class="absolute right-2 bottom-2 w-10 h-10 flex items-center justify-center bg-brand-500 text-white rounded-full hover:bg-brand-600 disabled:bg-stone-100 disabled:text-stone-400 transition-colors">
          <i class="ph-bold ph-arrow-up text-lg"></i>
        </button>

        <!-- Processing Indicator -->
        <div v-if="isProcessing" class="absolute -top-12 left-1/2 transform -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-paper border border-stone-200 shadow-subtle rounded-full text-xs text-ink-600 font-medium">
          <i class="ph-duotone ph-circle-notch animate-spin text-brand-500"></i>
          <span class="font-serif italic">Claude 正在思考</span>
          <div class="flex gap-1 ml-1">
            <div class="w-1.5 h-1.5 rounded-full bg-brand-300 typing-dot"></div>
            <div class="w-1.5 h-1.5 rounded-full bg-brand-300 typing-dot"></div>
            <div class="w-1.5 h-1.5 rounded-full bg-brand-300 typing-dot"></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  conversationId: String,
  messages: Array,
  isProcessing: Boolean,
  chatTitle: { type: String, default: '选择一个对话' }
})
const emit = defineEmits(['send', 'toggle-sidebar'])

const text = ref('')
const msgsRef = ref(null)
const inputRef = ref(null)

function send() {
  if (!text.value.trim() || props.isProcessing) return
  emit('send', text.value)
  text.value = ''
  if (inputRef.value) inputRef.value.style.height = 'auto'
}

watch(() => props.messages?.length, () => {
  nextTick(() => { if (msgsRef.value) msgsRef.value.scrollTop = msgsRef.value.scrollHeight })
})

watch(text, () => {
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.style.height = 'auto'
      inputRef.value.style.height = Math.min(inputRef.value.scrollHeight, 160) + 'px'
    }
  })
})
</script>
