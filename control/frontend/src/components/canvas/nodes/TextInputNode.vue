<template>
  <div class="w-full h-full flex flex-col bg-white rounded-lg shadow-sm border border-blue-200 overflow-hidden">
    <div class="h-7 bg-blue-50 text-xs flex items-center px-2 gap-1.5 shrink-0 border-b border-blue-100">
      <i class="ph ph-text-aa text-sm text-blue-500"></i>
      <span class="text-blue-700 font-medium">文本输入</span>
    </div>
    <textarea
      :value="content?.text || ''"
      @input="onInput"
      placeholder="输入文本..."
      class="flex-1 w-full p-2 text-sm text-ink-800 resize-none outline-none bg-transparent"
    ></textarea>
  </div>
</template>

<script setup>
const props = defineProps({
  content: { type: Object, default: () => ({}) },
  nodeId: { type: String, default: '' },
  runtime: { type: Object, default: null },
})

const emit = defineEmits(['update'])

function onInput(e) {
  const text = e.target.value
  emit('update', { text })
  // Push to runtime data output
  if (props.runtime) {
    props.runtime.setDataOutput(props.nodeId, 'text', text)
  }
}

// Initialize runtime output with current value
if (props.runtime && props.content?.text) {
  props.runtime.setDataOutput(props.nodeId, 'text', props.content.text)
}
</script>
