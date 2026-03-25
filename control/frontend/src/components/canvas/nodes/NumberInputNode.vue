<template>
  <div class="w-full h-full flex flex-col bg-white rounded-lg shadow-sm border border-blue-200 overflow-hidden">
    <div class="h-7 bg-blue-50 text-xs flex items-center px-2 gap-1.5 shrink-0 border-b border-blue-100">
      <i class="ph ph-hash text-sm text-blue-500"></i>
      <span class="text-blue-700 font-medium">数值输入</span>
    </div>
    <div class="flex-1 flex items-center justify-center p-3">
      <input
        type="number"
        :value="content?.number ?? 0"
        @input="onInput"
        class="w-full text-center text-2xl font-mono text-ink-800 outline-none bg-stone-50 rounded-lg px-3 py-2 border border-stone-200 focus:border-blue-400"
      />
    </div>
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
  const number = parseFloat(e.target.value) || 0
  emit('update', { number })
  if (props.runtime) {
    props.runtime.setDataOutput(props.nodeId, 'number', number)
  }
}

if (props.runtime) {
  props.runtime.setDataOutput(props.nodeId, 'number', props.content?.number ?? 0)
}
</script>
