<template>
  <div class="absolute inset-0 w-full h-full overflow-y-auto pb-32">
    <!-- Elegant Header -->
    <div class="max-w-7xl mx-auto px-6 pt-5 sm:pt-12 pb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
      <div>
        <h1 class="text-3xl font-serif font-semibold tracking-tight text-ink-900">交互集合</h1>
        <p class="text-ink-500 mt-2 font-medium">所有的分身与页面，皆陈列于此。</p>
      </div>

      <!-- Status Pill -->
      <div class="flex items-center gap-1.5 bg-paper px-2 py-1.5 rounded-full border border-stone-200 shadow-subtle">
        <div class="flex items-center gap-2 px-3 py-1 bg-surface rounded-full">
          <div class="w-2 h-2 rounded-full" :class="statusDotClass"></div>
          <span class="text-xs font-medium text-ink-800">{{ statusLabel }}</span>
        </div>
        <div class="flex gap-0.5 px-1">
          <button @click="doAction('start')" class="w-7 h-7 flex items-center justify-center text-ink-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-colors" title="启动">
            <i class="ph-fill ph-play text-sm"></i>
          </button>
          <button @click="doAction('stop')" class="w-7 h-7 flex items-center justify-center text-ink-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" title="停止">
            <i class="ph-fill ph-stop text-sm"></i>
          </button>
          <button @click="doAction('restart')" class="w-7 h-7 flex items-center justify-center text-ink-400 hover:text-brand-600 hover:bg-brand-50 rounded-full transition-colors" title="重启">
            <i class="ph-bold ph-arrows-clockwise text-sm"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Page Cards -->
    <div class="max-w-7xl mx-auto px-6">
      <div v-if="pages.length" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <PageCard v-for="p in pages" :key="p.id" :page="p" @open="openPage" @delete="deletePage" @preview="previewPage" @feature="toggleFeature" />
      </div>

      <!-- Empty State -->
      <div v-else class="flex flex-col items-center justify-center py-32 text-ink-400 text-center">
        <div class="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mb-6">
          <i class="ph ph-wind text-4xl text-ink-300"></i>
        </div>
        <h3 class="font-serif text-xl font-medium text-ink-800 mb-2">此处空空如也</h3>
        <p class="text-ink-500">前往对话面板，召唤 AI 替你生成新的页面吧。</p>
      </div>
    </div>

    <!-- File Explorer -->
    <div class="max-w-7xl mx-auto px-6 mt-12 mb-8">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <i class="ph ph-folder-open text-xl text-ink-500"></i>
          <h2 class="font-serif text-xl font-semibold text-ink-900">文件系统</h2>
        </div>
        <label class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-stone-200 text-xs font-medium text-ink-600 hover:bg-paper hover:border-stone-300 cursor-pointer transition-colors">
          <i class="ph ph-upload-simple"></i>
          <span>上传</span>
          <input type="file" class="hidden" @change="uploadFile" />
        </label>
      </div>

      <!-- Breadcrumb -->
      <div class="flex items-center gap-1 text-sm mb-3 flex-wrap">
        <button
          v-for="(seg, i) in breadcrumbs" :key="i"
          @click="navigateTo(seg.path)"
          class="text-ink-500 hover:text-brand-600 transition-colors px-1"
          :class="i === breadcrumbs.length - 1 ? 'font-medium text-ink-800' : ''"
        >{{ seg.name }}</button>
        <span v-if="breadcrumbs.length > 1" class="hidden"><!-- spacer --></span>
      </div>

      <!-- File List -->
      <div class="bg-paper border border-stone-200 rounded-2xl overflow-hidden">
        <div v-if="filesLoading" class="flex items-center justify-center py-12 text-ink-400">
          <i class="ph ph-circle-notch text-2xl animate-spin mr-2"></i>
          <span class="text-sm">加载中...</span>
        </div>
        <div v-else-if="!files.length" class="text-center py-12 text-ink-400 text-sm">目录为空</div>
        <table v-else class="w-full text-sm">
          <tbody>
            <tr
              v-for="f in files" :key="f.name"
              class="border-b border-stone-100 last:border-0 hover:bg-surface/60 transition-colors group cursor-pointer"
              @click="f.type === 'directory' ? navigateTo(currentPath + '/' + f.name) : viewFile(currentPath + '/' + f.name, f)"
            >
              <td class="px-4 py-2.5 w-8">
                <i class="text-base" :class="f.type === 'directory' ? 'ph-fill ph-folder text-amber-500' : fileIcon(f.name)"></i>
              </td>
              <td class="py-2.5 font-medium text-ink-800">
                <span>{{ f.name }}</span>
                <span v-if="f.type === 'link'" class="text-ink-400 ml-1 text-xs">(link)</span>
              </td>
              <td class="px-4 py-2.5 text-ink-400 text-xs text-right hidden sm:table-cell">{{ f.type !== 'directory' ? formatSize(f.size) : '' }}</td>
              <td class="px-4 py-2.5 text-ink-400 text-xs text-right hidden sm:table-cell">{{ f.modified }}</td>
              <td class="px-2 py-2.5 w-8">
                <button
                  @click.stop="deleteFile(currentPath + '/' + f.name)"
                  class="w-7 h-7 rounded-full flex items-center justify-center text-ink-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                  title="删除"
                >
                  <i class="ph ph-trash text-sm"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- File Viewer Modal -->
    <Teleport to="body">
      <Transition name="drawer-backdrop">
        <div v-if="fileViewerVisible" class="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]" @click="fileViewerVisible = false"></div>
      </Transition>
      <Transition name="drawer">
        <div v-if="fileViewerVisible" class="fixed inset-x-0 bottom-0 z-[101] flex flex-col bg-paper rounded-t-2xl shadow-2xl" style="height: 80vh; max-height: 80vh;">
          <div class="flex items-center justify-center pt-3 pb-1 cursor-grab" @click="fileViewerVisible = false">
            <div class="w-10 h-1 bg-stone-300 rounded-full"></div>
          </div>
          <div class="flex items-center justify-between px-5 pb-3 border-b border-stone-200">
            <span class="text-sm font-mono text-ink-600 truncate">{{ fileViewerPath }}</span>
            <button @click="fileViewerVisible = false" class="w-8 h-8 rounded-full flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-stone-100 transition-colors">
              <i class="ph ph-x text-lg"></i>
            </button>
          </div>
          <div class="flex-1 min-h-0 overflow-auto p-5">
            <pre class="text-xs font-mono text-ink-800 whitespace-pre-wrap break-all leading-relaxed">{{ fileViewerContent }}</pre>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Preview Drawer Backdrop -->
    <Teleport to="body">
      <Transition name="drawer-backdrop">
        <div
          v-if="previewVisible"
          class="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
          @click="closePreview"
        ></div>
      </Transition>

      <!-- Preview Drawer -->
      <Transition name="drawer">
        <div
          v-if="previewVisible"
          class="fixed inset-x-0 bottom-0 z-[101] flex flex-col bg-paper rounded-t-2xl shadow-2xl"
          style="height: 85vh; max-height: 85vh;"
        >
          <!-- Drawer Handle -->
          <div class="flex items-center justify-center pt-3 pb-1 cursor-grab" @click="closePreview">
            <div class="w-10 h-1 bg-stone-300 rounded-full"></div>
          </div>

          <!-- Drawer Header -->
          <div class="flex items-center justify-between px-5 pb-3 border-b border-stone-200">
            <div class="flex items-center gap-3 min-w-0">
              <h3 class="font-serif font-semibold text-ink-900 text-lg truncate">{{ previewTitle }}</h3>
              <span class="text-xs font-mono text-ink-400 bg-surface px-2 py-0.5 rounded border border-stone-100 shrink-0">{{ previewRoute }}</span>
            </div>
            <div class="flex items-center gap-1 shrink-0 ml-3">
              <button
                @click="openPreviewInNewWindow"
                class="w-8 h-8 rounded-full flex items-center justify-center text-ink-500 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                title="新窗口打开"
              >
                <i class="ph ph-arrow-up-right text-lg"></i>
              </button>
              <button
                @click="refreshPreview"
                class="w-8 h-8 rounded-full flex items-center justify-center text-ink-500 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                title="刷新"
              >
                <i class="ph ph-arrows-clockwise text-lg"></i>
              </button>
              <button
                @click="closePreview"
                class="w-8 h-8 rounded-full flex items-center justify-center text-ink-500 hover:text-ink-900 hover:bg-stone-100 transition-colors"
                title="关闭"
              >
                <i class="ph ph-x text-lg"></i>
              </button>
            </div>
          </div>

          <!-- Iframe -->
          <div class="flex-1 min-h-0 relative">
            <div v-if="iframeLoading" class="absolute inset-0 flex items-center justify-center bg-surface">
              <div class="flex flex-col items-center gap-3 text-ink-400">
                <i class="ph ph-circle-notch text-3xl animate-spin"></i>
                <span class="text-sm">加载中...</span>
              </div>
            </div>
            <iframe
              v-if="previewUrl"
              ref="iframeRef"
              :src="previewUrl"
              class="w-full h-full border-0"
              @load="iframeLoading = false"
            ></iframe>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import PageCard from '../components/PageCard.vue'

const API = ''
const pages = ref([])
const appStatus = ref('stopped')
const appBaseUrl = ref('')
let timer = null

const statusDotClass = computed(() => {
  if (appStatus.value === 'running') return 'bg-emerald-500'
  if (appStatus.value === 'restarting') return 'bg-brand-500 animate-pulse'
  return 'bg-ink-300'
})

const statusLabel = computed(() => {
  if (appStatus.value === 'running') return '运行中'
  if (appStatus.value === 'restarting') return '重启中...'
  return '已停止'
})

async function fetchConfig() {
  try {
    const r = await fetch(`${API}/api/config`)
    const d = await r.json()
    appBaseUrl.value = d.appExternalUrl || `http://${location.hostname}:5174`
  } catch {
    appBaseUrl.value = `http://${location.hostname}:5174`
  }
}

async function fetchPages() {
  try {
    const r = await fetch(`${API}/api/pages`)
    const d = await r.json()
    if (d.success) pages.value = d.data
  } catch {}
}

async function fetchStatus() {
  try {
    const r = await fetch(`${API}/api/app/status`)
    const d = await r.json()
    if (d.success) appStatus.value = d.data.frontend.running ? 'running' : 'stopped'
  } catch {}
}

async function doAction(action) {
  if (action === 'restart') appStatus.value = 'restarting'
  await fetch(`${API}/api/app/${action}`, { method: 'POST' })
  setTimeout(fetchStatus, 2000)
}

function openPage(p) {
  window.open(`${appBaseUrl.value}${p.route_path}`, '_blank')
}

async function deletePage(id) {
  if (!confirm('确定删除？')) return
  await fetch(`${API}/api/pages/${id}`, { method: 'DELETE' })
  fetchPages()
}

async function toggleFeature(page) {
  if (page.is_featured) {
    await fetch(`${API}/api/pages/${page.id}/feature`, { method: 'DELETE' })
  } else {
    await fetch(`${API}/api/pages/${page.id}/feature`, { method: 'POST' })
  }
  fetchPages()
}

// ---- Preview Drawer ----
const previewVisible = ref(false)
const previewUrl = ref('')
const previewTitle = ref('')
const previewRoute = ref('')
const iframeLoading = ref(false)
const iframeRef = ref(null)

function previewPage(p) {
  previewTitle.value = p.title
  previewRoute.value = p.route_path
  previewUrl.value = `${appBaseUrl.value}${p.route_path}`
  iframeLoading.value = true
  previewVisible.value = true
}

function closePreview() {
  previewVisible.value = false
  previewUrl.value = ''
}

function openPreviewInNewWindow() {
  if (previewUrl.value) {
    window.open(previewUrl.value, '_blank')
  }
}

function refreshPreview() {
  if (iframeRef.value) {
    iframeLoading.value = true
    iframeRef.value.src = previewUrl.value
  }
}

// ---- File Explorer ----
const currentPath = ref('/app')
const files = ref([])
const filesLoading = ref(false)
const fileViewerVisible = ref(false)
const fileViewerContent = ref('')
const fileViewerPath = ref('')

const breadcrumbs = computed(() => {
  const parts = currentPath.value.split('/').filter(Boolean)
  const crumbs = [{ name: '/', path: '/app' }]
  let accum = ''
  for (const p of parts) {
    accum += '/' + p
    crumbs.push({ name: p + '/', path: accum })
  }
  return crumbs
})

async function fetchFiles(path) {
  filesLoading.value = true
  try {
    const r = await fetch(`${API}/api/app/files?path=${encodeURIComponent(path || '/app')}`)
    const d = await r.json()
    if (d.success) {
      files.value = d.data
      currentPath.value = d.path
    }
  } catch {} finally {
    filesLoading.value = false
  }
}

function navigateTo(path) {
  fetchFiles(path)
}

async function viewFile(path, f) {
  if (f.size > 512 * 1024) return alert('文件过大，不支持预览')
  try {
    const r = await fetch(`${API}/api/app/files/content?path=${encodeURIComponent(path)}`)
    const d = await r.json()
    if (d.success) {
      fileViewerContent.value = d.data.content
      fileViewerPath.value = path
      fileViewerVisible.value = true
    } else {
      alert(d.error || '读取失败')
    }
  } catch { alert('读取失败') }
}

async function uploadFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const form = new FormData()
  form.append('file', file)
  form.append('path', currentPath.value)
  try {
    const r = await fetch(`${API}/api/app/files/upload`, { method: 'POST', body: form })
    const d = await r.json()
    if (d.success) fetchFiles(currentPath.value)
    else alert(d.error || '上传失败')
  } catch { alert('上传失败') }
  e.target.value = ''
}

async function deleteFile(path) {
  if (!confirm(`确定删除 ${path} ?`)) return
  try {
    await fetch(`${API}/api/app/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
    fetchFiles(currentPath.value)
  } catch {}
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function fileIcon(name) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (['js', 'mjs', 'cjs'].includes(ext)) return 'ph ph-file-js text-yellow-600'
  if (['vue'].includes(ext)) return 'ph ph-file-vue text-emerald-600'
  if (['json'].includes(ext)) return 'ph ph-file-code text-blue-500'
  if (['css', 'scss'].includes(ext)) return 'ph ph-file-css text-purple-500'
  if (['html'].includes(ext)) return 'ph ph-file-html text-orange-500'
  if (['md'].includes(ext)) return 'ph ph-file-text text-ink-500'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'ph ph-file-image text-pink-500'
  return 'ph ph-file text-ink-400'
}

onMounted(async () => {
  await fetchConfig()
  fetchPages(); fetchStatus(); fetchFiles('/app')
  timer = setInterval(() => { fetchPages(); fetchStatus() }, 10000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style scoped>
/* Drawer slide-up animation */
.drawer-enter-active {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-leave-active {
  transition: transform 0.25s cubic-bezier(0.4, 0, 1, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateY(100%);
}

/* Backdrop fade */
.drawer-backdrop-enter-active {
  transition: opacity 0.3s ease;
}
.drawer-backdrop-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-backdrop-enter-from,
.drawer-backdrop-leave-to {
  opacity: 0;
}
</style>
