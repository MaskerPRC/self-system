<template>
  <a
    :href="content?.url"
    target="_blank"
    rel="noopener"
    class="flex items-center gap-3 bg-white rounded-lg shadow-sm border border-stone-200 p-3 hover:bg-stone-50 transition-colors cursor-pointer no-underline"
    @click.stop
  >
    <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" :class="iconBgClass">
      <i :class="iconClass" class="text-xl"></i>
    </div>
    <div class="min-w-0 flex-1">
      <div class="text-sm font-medium text-ink-800 truncate">{{ content?.name || '文件' }}</div>
      <div class="text-xs text-ink-400 mt-0.5">{{ formattedSize }}</div>
    </div>
    <i class="ph ph-download-simple text-ink-400 text-base shrink-0"></i>
  </a>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  content: { type: Object, default: () => ({ name: '', size: 0, mimeType: '', url: '' }) }
})

const formattedSize = computed(() => {
  const bytes = props.content?.size || 0
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
})

const fileExt = computed(() => {
  const name = props.content?.name || ''
  const dot = name.lastIndexOf('.')
  return dot !== -1 ? name.slice(dot + 1).toLowerCase() : ''
})

const iconClass = computed(() => {
  const ext = fileExt.value
  const mime = props.content?.mimeType || ''
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'ph ph-file-image text-purple-500'
  if (ext === 'pdf' || mime === 'application/pdf') return 'ph ph-file-pdf text-red-500'
  if (['js', 'ts', 'vue', 'jsx', 'tsx', 'py', 'java', 'go', 'rs', 'html', 'css', 'json', 'xml'].includes(ext)) return 'ph ph-file-code text-blue-500'
  if (['txt', 'md', 'log', 'csv'].includes(ext) || mime.startsWith('text/')) return 'ph ph-file-text text-stone-500'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'ph ph-file-zip text-amber-500'
  return 'ph ph-file text-stone-400'
})

const iconBgClass = computed(() => {
  const ext = fileExt.value
  const mime = props.content?.mimeType || ''
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'bg-purple-50'
  if (ext === 'pdf' || mime === 'application/pdf') return 'bg-red-50'
  if (['js', 'ts', 'vue', 'jsx', 'tsx', 'py', 'java', 'go', 'rs', 'html', 'css', 'json', 'xml'].includes(ext)) return 'bg-blue-50'
  if (['txt', 'md', 'log', 'csv'].includes(ext) || mime.startsWith('text/')) return 'bg-stone-50'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'bg-amber-50'
  return 'bg-stone-50'
})
</script>
