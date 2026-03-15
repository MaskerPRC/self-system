<template>
  <div
    class="w-full h-full bg-white rounded-lg shadow-sm border border-stone-200 overflow-hidden"
    @dblclick="startEdit"
  >
    <textarea
      v-if="editing"
      ref="textareaRef"
      v-model="editText"
      class="w-full h-full p-3 text-ink-800 resize-none outline-none bg-transparent"
      :style="{ fontSize: fontSize + 'px' }"
      @blur="finishEdit"
      @keydown.escape="finishEdit"
    ></textarea>
    <div
      v-else
      class="w-full h-full p-3 text-ink-800 whitespace-pre-wrap break-words overflow-auto"
      :style="{ fontSize: fontSize + 'px' }"
    >
      <span v-if="content?.text" class="select-text">{{ content.text }}</span>
      <span v-else class="text-ink-300 italic text-sm">双击编辑文本...</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'

const props = defineProps({
  content: { type: Object, default: () => ({ text: '', fontSize: 14 }) }
})

const emit = defineEmits(['update'])

const editing = ref(false)
const editText = ref('')
const textareaRef = ref(null)

const fontSize = computed(() => props.content?.fontSize || 14)

function startEdit() {
  editing.value = true
  editText.value = props.content?.text || ''
  nextTick(() => {
    textareaRef.value?.focus()
  })
}

function finishEdit() {
  editing.value = false
  const newText = editText.value
  if (newText !== (props.content?.text || '')) {
    emit('update', { ...props.content, text: newText })
  }
}
</script>
