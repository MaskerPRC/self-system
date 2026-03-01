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
          <div class="max-w-[85%] sm:max-w-[70%] bg-surface border border-stone-200 text-ink-900 px-6 py-4 rounded-3xl rounded-tr-md shadow-sm">
            <!-- Attachments -->
            <div v-if="m.attachments && m.attachments.length" class="flex flex-wrap gap-2 mb-2">
              <a v-for="(att, i) in m.attachments" :key="i"
                :href="downloadUrl(att)" :download="att.name"
                class="flex items-center gap-1.5 bg-stone-100 hover:bg-stone-200 rounded-lg px-2.5 py-1.5 text-xs text-ink-600 transition-colors cursor-pointer">
                <i :class="attIcon(att)" class="text-sm"></i>
                <span class="max-w-[150px] truncate">{{ att.name }}</span>
                <i class="ph ph-download-simple text-xs text-ink-300"></i>
              </a>
            </div>
            <!-- Text content -->
            <div v-if="m.content" class="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
              {{ m.content }}
            </div>
          </div>
        </div>

        <!-- Assistant message -->
        <div v-else class="flex gap-4 animate-fade-in-up max-w-[90%] sm:max-w-[80%]">
          <div class="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 shrink-0 border border-brand-100 mt-1">
            <i class="ph-fill ph-sparkle"></i>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-sm font-serif font-semibold text-ink-900 mb-1">Claude</span>
            <div v-if="m.content" class="text-ink-800 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
              {{ m.content }}
            </div>
            <!-- File attachments -->
            <div v-if="m.attachments && m.attachments.length" class="mt-3 flex flex-wrap gap-3">
              <template v-for="(att, i) in m.attachments" :key="i">
                <!-- Image preview (skip if too large) -->
                <div v-if="isImage(att) && canPreview(att)" class="group relative">
                  <img
                    :src="previewUrl(att)"
                    :alt="att.name"
                    class="max-w-[200px] max-h-[200px] object-cover rounded-xl border border-stone-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                    @click="openFullImage(att)"
                    loading="lazy"
                  />
                  <div class="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a :href="downloadUrl(att)" :download="att.name"
                       class="w-8 h-8 flex items-center justify-center bg-paper/90 rounded-full shadow-sm hover:bg-paper text-ink-600">
                      <i class="ph ph-download-simple text-sm"></i>
                    </a>
                  </div>
                  <div class="text-xs text-ink-400 mt-1 max-w-[200px] truncate">{{ att.name }}</div>
                </div>

                <!-- Video player (skip if too large) - full width -->
                <div v-else-if="isVideo(att) && canPreview(att)" class="w-full max-w-xs sm:max-w-md">
                  <video :src="previewUrl(att)" controls preload="metadata"
                    class="w-full rounded-xl border border-stone-200 shadow-sm"></video>
                  <div class="flex items-center justify-between mt-1">
                    <span class="text-xs text-ink-400">{{ att.name }} ({{ formatSize(att.size) }})</span>
                    <a :href="downloadUrl(att)" :download="att.name"
                       class="text-xs text-brand-500 hover:text-brand-600 flex items-center gap-1">
                      <i class="ph ph-download-simple"></i> 下载
                    </a>
                  </div>
                </div>

                <!-- Audio player (skip if too large) - full width -->
                <div v-else-if="isAudio(att) && canPreview(att)" class="w-full max-w-xs sm:max-w-md">
                  <div class="flex items-center gap-3 bg-stone-50 rounded-xl px-4 py-3 border border-stone-200">
                    <i class="ph-duotone ph-music-note text-2xl text-brand-500 shrink-0"></i>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm text-ink-800 truncate">{{ att.name }}</div>
                      <div class="text-xs text-ink-400">{{ formatSize(att.size) }}</div>
                      <audio :src="previewUrl(att)" controls preload="metadata" class="w-full mt-2 h-8"></audio>
                    </div>
                    <a :href="downloadUrl(att)" :download="att.name"
                       class="w-8 h-8 flex items-center justify-center text-ink-400 hover:text-brand-500 rounded-full hover:bg-stone-100 shrink-0">
                      <i class="ph ph-download-simple"></i>
                    </a>
                  </div>
                </div>

                <!-- Generic file card (fallback for all other files + oversized media) -->
                <div v-else class="flex items-center gap-3 bg-stone-50 rounded-xl px-3 py-2.5 border border-stone-200">
                  <i :class="attIcon(att)" class="text-xl shrink-0"></i>
                  <div class="min-w-0">
                    <div class="text-sm text-ink-800 truncate max-w-[140px]">{{ att.name }}</div>
                    <div class="text-xs text-ink-400">{{ formatSize(att.size) }}</div>
                  </div>
                  <a :href="downloadUrl(att)" :download="att.name"
                     class="w-7 h-7 flex items-center justify-center text-ink-400 hover:text-brand-500 rounded-full hover:bg-stone-100 shrink-0">
                    <i class="ph ph-download-simple text-sm"></i>
                  </a>
                </div>
              </template>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Floating Input Area -->
    <div class="absolute bottom-24 left-0 right-0 px-4 sm:px-10 flex justify-center pointer-events-none">
      <div v-if="conversationId"
        class="w-full max-w-3xl relative bg-paper rounded-3xl border border-stone-200 shadow-float focus-within:border-stone-300 focus-within:shadow-xl transition-all duration-300 pointer-events-auto"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop">

        <!-- Drag overlay -->
        <div v-if="isDragging" class="absolute inset-0 rounded-3xl bg-brand-50/80 border-2 border-dashed border-brand-300 z-10 flex items-center justify-center">
          <span class="text-brand-600 text-sm font-medium">释放以添加文件</span>
        </div>

        <!-- Pending files preview -->
        <div v-if="pendingFiles.length" class="flex flex-wrap gap-2 px-5 pt-3 pb-1">
          <div v-for="(f, i) in pendingFiles" :key="i"
            class="flex items-center gap-1.5 bg-stone-100 rounded-xl px-3 py-1.5 text-xs text-ink-700">
            <i :class="fileIcon(f)" class="text-sm text-ink-400"></i>
            <span class="max-w-[120px] truncate">{{ f.name }}</span>
            <span class="text-ink-400">({{ formatSize(f.size) }})</span>
            <button @click="removeFile(i)" class="text-ink-300 hover:text-red-500 transition-colors ml-0.5">
              <i class="ph ph-x text-xs"></i>
            </button>
          </div>
        </div>

        <!-- Hidden file input -->
        <input ref="fileInputRef" type="file" multiple class="hidden" @change="onFilesSelected" />

        <textarea
          ref="inputRef"
          v-model="text"
          @keydown.enter.exact.prevent="send"
          @paste="onPaste"
          :disabled="isProcessing"
          rows="1"
          class="w-full bg-transparent border-0 outline-none resize-none py-4 pl-14 pr-14 text-ink-900 placeholder-ink-400 max-h-[160px] disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
          placeholder="输入需求..."
        ></textarea>

        <!-- Attach button -->
        <button @click="fileInputRef?.click()" :disabled="isProcessing"
          class="absolute left-2 bottom-2 w-10 h-10 flex items-center justify-center text-ink-400 hover:text-brand-500 rounded-full hover:bg-stone-100 disabled:opacity-50 transition-colors">
          <i class="ph ph-paperclip text-lg"></i>
        </button>

        <!-- Send button -->
        <button @click="send" :disabled="(!text.trim() && !pendingFiles.length) || isProcessing"
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
          <button @click="emit('cancel')" class="ml-2 w-6 h-6 flex items-center justify-center text-ink-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors" title="中断任务">
            <i class="ph-bold ph-stop text-xs"></i>
          </button>
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
const emit = defineEmits(['send', 'toggle-sidebar', 'cancel'])

const text = ref('')
const msgsRef = ref(null)
const inputRef = ref(null)
const fileInputRef = ref(null)
const pendingFiles = ref([])
const isDragging = ref(false)

function send() {
  if (props.isProcessing) return
  if (!text.value.trim() && !pendingFiles.value.length) return
  emit('send', { content: text.value, files: [...pendingFiles.value] })
  text.value = ''
  pendingFiles.value = []
  if (inputRef.value) inputRef.value.style.height = 'auto'
}

function onFilesSelected(e) {
  const files = Array.from(e.target.files || [])
  const remaining = 10 - pendingFiles.value.length
  pendingFiles.value.push(...files.slice(0, remaining))
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function onDrop(e) {
  isDragging.value = false
  const files = Array.from(e.dataTransfer?.files || [])
  const remaining = 10 - pendingFiles.value.length
  pendingFiles.value.push(...files.slice(0, remaining))
}

function onPaste(e) {
  const items = e.clipboardData?.items
  if (!items) return
  const files = []
  for (const item of items) {
    if (item.kind === 'file') {
      const blob = item.getAsFile()
      if (!blob) continue
      // 如果有原始文件名就保留，否则生成 UUID 名称
      let name = blob.name
      if (!name || name === 'image.png' || name === 'blob') {
        const ext = (item.type.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '')
        name = `${crypto.randomUUID()}.${ext}`
      }
      files.push(new File([blob], name, { type: item.type }))
    }
  }
  if (files.length) {
    e.preventDefault()
    const remaining = 10 - pendingFiles.value.length
    pendingFiles.value.push(...files.slice(0, remaining))
  }
}

function removeFile(index) {
  pendingFiles.value.splice(index, 1)
}

function fileIcon(file) {
  if (file.type?.startsWith('image/')) return 'ph ph-image'
  if (file.type?.includes('pdf')) return 'ph ph-file-pdf'
  if (file.type?.includes('text') || file.type?.includes('json') || file.type?.includes('javascript')) return 'ph ph-file-text'
  return 'ph ph-file'
}

function attIcon(att) {
  if (att.type?.startsWith('image/')) return 'ph-duotone ph-image text-blue-500'
  if (att.type?.startsWith('video/')) return 'ph-duotone ph-video-camera text-purple-500'
  if (att.type?.startsWith('audio/')) return 'ph-duotone ph-music-note text-green-500'
  if (att.type?.includes('pdf')) return 'ph-duotone ph-file-pdf text-red-500'
  if (att.type?.includes('zip') || att.type?.includes('rar') || att.type?.includes('tar')) return 'ph-duotone ph-file-zip text-yellow-600'
  if (att.type?.includes('text') || att.type?.includes('json') || att.type?.includes('javascript')) return 'ph-duotone ph-file-text text-ink-500'
  return 'ph-duotone ph-file text-ink-400'
}

function isImage(att) {
  return att.type?.startsWith('image/')
}

function isVideo(att) {
  return att.type?.startsWith('video/')
}

function isAudio(att) {
  return att.type?.startsWith('audio/')
}

// 只有媒体文件（图片/视频/音频）支持 inline 预览
function canPreview(att) {
  return isImage(att) || isVideo(att) || isAudio(att)
}

function previewUrl(att) {
  const parts = att.path?.split('/')
  if (parts?.length >= 4 && parts[0] === 'app' && parts[1] === 'temp') {
    const convId = parts[2]
    const fileName = parts.slice(3).join('/')
    return `/api/conversations/${convId}/files/preview?name=${encodeURIComponent(fileName)}`
  }
  return ''
}

function downloadUrl(att) {
  const parts = att.path?.split('/')
  if (parts?.length >= 4 && parts[0] === 'app' && parts[1] === 'temp') {
    const convId = parts[2]
    const fileName = parts.slice(3).join('/')
    return `/api/conversations/${convId}/files/download?name=${encodeURIComponent(fileName)}`
  }
  return ''
}

function openFullImage(att) {
  window.open(previewUrl(att), '_blank')
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + 'B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
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
