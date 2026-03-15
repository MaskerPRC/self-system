<template>
  <div
    class="w-full h-full bg-white rounded-lg shadow-sm border p-3 flex flex-col gap-2 overflow-hidden"
    :class="borderClass"
  >
    <!-- Status indicator -->
    <div class="flex items-center gap-2">
      <div v-if="content?.status === 'processing'" class="flex items-center gap-1.5">
        <i class="ph ph-circle-notch text-brand-500 text-base animate-spin"></i>
        <span class="text-xs font-medium text-brand-600">处理中</span>
      </div>
      <div v-else-if="content?.status === 'completed'" class="flex items-center gap-1.5">
        <i class="ph-fill ph-check-circle text-green-500 text-base"></i>
        <span class="text-xs font-medium text-green-600">已完成</span>
      </div>
      <div v-else-if="content?.status === 'error'" class="flex items-center gap-1.5">
        <i class="ph-fill ph-x-circle text-red-500 text-base"></i>
        <span class="text-xs font-medium text-red-600">出错</span>
      </div>
      <div v-else class="flex items-center gap-1.5">
        <i class="ph ph-clock text-ink-400 text-base"></i>
        <span class="text-xs font-medium text-ink-500">等待中</span>
      </div>
    </div>

    <!-- Prompt text -->
    <div class="flex-1 min-h-0">
      <p class="text-sm text-ink-700 line-clamp-3 leading-relaxed">{{ content?.prompt || '无内容' }}</p>
    </div>

    <!-- Error message -->
    <div v-if="content?.status === 'error' && content?.error" class="text-xs text-red-500 truncate">
      {{ content.error }}
    </div>

    <!-- Conversation link -->
    <div v-if="content?.status === 'completed' && content?.conversationId" class="pt-1 border-t border-stone-100">
      <a
        :href="`/chat`"
        @click.stop.prevent="goToConversation"
        class="text-xs text-brand-500 hover:text-brand-600 no-underline flex items-center gap-1"
      >
        <i class="ph ph-chat-teardrop text-sm"></i>
        查看对话
      </a>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  content: { type: Object, default: () => ({ prompt: '', status: 'processing', conversationId: null, error: null }) }
})

const router = useRouter()

const borderClass = computed(() => {
  switch (props.content?.status) {
    case 'processing': return 'border-brand-300'
    case 'completed': return 'border-green-300'
    case 'error': return 'border-red-300'
    default: return 'border-stone-200'
  }
})

function goToConversation() {
  if (props.content?.conversationId) {
    localStorage.setItem('activeConvId', props.content.conversationId)
    router.push('/chat')
    window.dispatchEvent(new CustomEvent('switch-conversation', { detail: { id: props.content.conversationId } }))
  }
}
</script>
