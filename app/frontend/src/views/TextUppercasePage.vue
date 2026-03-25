<template>
  <div class="min-h-screen bg-stone-50 p-4">
    <div class="max-w-md mx-auto space-y-4">
      <h1 class="text-lg font-bold text-ink-800">文本转大写</h1>

      <!-- Input -->
      <div>
        <label class="text-sm text-ink-500 mb-1 block">输入文本</label>
        <textarea
          v-model="inputText"
          placeholder="输入要转换的文本..."
          class="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg outline-none focus:border-blue-400 resize-none bg-white"
          rows="3"
        ></textarea>
      </div>

      <!-- Convert button -->
      <button
        @click="convert"
        :disabled="converting"
        class="w-full px-4 py-2.5 bg-blue-500 text-white rounded-lg font-medium text-sm hover:bg-blue-600 disabled:opacity-50 transition-colors"
      >
        {{ converting ? '转换中...' : '转换为大写' }}
      </button>

      <!-- Output -->
      <div v-if="outputText !== null">
        <label class="text-sm text-ink-500 mb-1 block">输出结果</label>
        <div class="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-lg min-h-[60px] whitespace-pre-wrap break-all">
          {{ outputText }}
        </div>
      </div>

      <!-- Canvas bridge status -->
      <div v-if="bridge.isInCanvas" class="text-xs text-stone-400 flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full" :class="bridge.connected.value ? 'bg-green-400' : 'bg-stone-300'"></span>
        {{ bridge.connected.value ? '已连接画布' : '等待画布连接...' }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useHeartbeat } from '@/heartbeat.js'
import { useCanvasBridge } from '@/canvas-bridge.js'

useHeartbeat('/text-uppercase')
document.title = '文本转大写'

const inputText = ref('')
const outputText = ref(null)
const converting = ref(false)

// ---- Canvas Bridge ----
// Declare this app's ports for the canvas orchestration system
const bridge = useCanvasBridge({
  manifest: {
    ports: {
      dataIn: [
        { id: 'text', name: '输入文本', valueType: 'string' }
      ],
      controlIn: [
        { id: 'convert', name: '执行转换' }
      ],
      dataOut: [
        { id: 'result', name: '转换结果', valueType: 'string' }
      ],
      controlOut: [
        { id: 'completed', name: '转换完成' }
      ],
    }
  },
  onDataInput(portId, value) {
    if (portId === 'text') {
      inputText.value = value
    }
  },
  onControl(portId) {
    if (portId === 'convert') {
      convert()
    }
  }
})

function convert() {
  if (!inputText.value.trim()) return
  converting.value = true

  // Simulate a small delay (real apps might call an API)
  setTimeout(() => {
    outputText.value = inputText.value.toUpperCase()
    converting.value = false

    // Push output to canvas
    bridge.setDataOutput('result', outputText.value)
    bridge.emitControl('completed')
  }, 300)
}

// When input changes from UI, also update the canvas data output
// (so other connected nodes can see what's typed)
watch(inputText, (val) => {
  // Don't push to output until conversion is done
})
</script>
