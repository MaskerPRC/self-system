<template>
  <div class="h-12 bg-white border-b border-stone-200 flex items-center px-4 gap-3 shrink-0 z-10">
    <!-- Left: Project selector -->
    <div class="flex items-center gap-2">
      <div class="relative" ref="dropdownRef">
        <button
          @click="dropdownOpen = !dropdownOpen"
          class="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-ink-800 hover:bg-stone-100 rounded-lg transition-colors"
        >
          <i class="ph ph-folder-simple text-base text-ink-500"></i>
          <span class="max-w-[120px] truncate">{{ activeProjectName }}</span>
          <i class="ph ph-caret-down text-xs text-ink-400"></i>
        </button>
        <div
          v-if="dropdownOpen"
          class="absolute top-full left-0 mt-1 w-56 bg-white rounded-xl border border-stone-200 shadow-lg py-1 z-30"
        >
          <div
            v-for="p in projects"
            :key="p.id"
            class="group flex items-center justify-between px-3 py-2 text-sm hover:bg-stone-50 cursor-pointer"
            @click="selectProject(p.id)"
          >
            <span class="truncate" :class="p.id === activeProject ? 'text-brand-600 font-medium' : 'text-ink-700'">
              {{ p.name }}
            </span>
            <div class="hidden group-hover:flex items-center gap-0.5">
              <button
                @click.stop="startRename(p)"
                class="p-1 text-ink-400 hover:text-ink-700 rounded"
              >
                <i class="ph ph-pencil-simple text-xs"></i>
              </button>
              <button
                @click.stop="$emit('delete-project', p.id)"
                class="p-1 text-ink-400 hover:text-red-600 rounded"
              >
                <i class="ph ph-trash text-xs"></i>
              </button>
            </div>
          </div>
          <div class="border-t border-stone-100 mt-1 pt-1">
            <button
              @click="$emit('create-project'); dropdownOpen = false"
              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-brand-600 hover:bg-brand-50"
            >
              <i class="ph ph-plus text-base"></i>
              新建画布
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Center: Add node buttons -->
    <div class="flex-1 flex items-center justify-center gap-1">
      <button
        @click="$emit('add-text')"
        class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-ink-600 hover:bg-stone-100 rounded-lg transition-colors"
        title="添加文本"
      >
        <i class="ph ph-text-t text-base"></i>
        <span class="hidden sm:inline">文本</span>
      </button>

      <!-- Orchestration node types -->
      <div class="w-px h-5 bg-stone-200 mx-1"></div>

      <button
        @click="$emit('add-text-input')"
        class="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        title="文本输入节点"
      >
        <i class="ph ph-text-aa text-base"></i>
        <span class="hidden lg:inline">输入</span>
      </button>

      <button
        @click="$emit('add-number-input')"
        class="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        title="数值输入节点"
      >
        <i class="ph ph-hash text-base"></i>
        <span class="hidden lg:inline">数值</span>
      </button>

      <button
        @click="$emit('add-button')"
        class="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
        title="控制按钮节点"
      >
        <i class="ph ph-cursor-click text-base"></i>
        <span class="hidden lg:inline">按钮</span>
      </button>

      <button
        @click="$emit('add-image-viewer')"
        class="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
        title="图片预览节点"
      >
        <i class="ph ph-image text-base"></i>
        <span class="hidden lg:inline">图片</span>
      </button>

      <div class="w-px h-5 bg-stone-200 mx-1"></div>

      <!-- App page selector dropdown -->
      <div class="relative" ref="appDropdownRef">
        <button
          @click="toggleAppDropdown"
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-ink-600 hover:bg-stone-100 rounded-lg transition-colors"
          title="添加应用"
        >
          <i class="ph ph-browser text-base"></i>
          <span class="hidden sm:inline">应用</span>
          <i class="ph ph-caret-down text-xs text-ink-400"></i>
        </button>
        <div
          v-if="appDropdownOpen"
          class="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-72 bg-white rounded-xl border border-stone-200 shadow-lg z-30 overflow-hidden"
        >
          <!-- Search input -->
          <div class="p-2 border-b border-stone-100">
            <div class="relative">
              <i class="ph ph-magnifying-glass text-sm text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2"></i>
              <input
                ref="appSearchInput"
                v-model="appSearch"
                placeholder="搜索页面路由或名称..."
                class="w-full pl-8 pr-3 py-1.5 text-sm border border-stone-200 rounded-lg outline-none focus:border-brand-400 bg-stone-50 transition-colors"
                @keydown.escape="appDropdownOpen = false"
              />
            </div>
          </div>
          <!-- Page list -->
          <div class="max-h-60 overflow-y-auto py-1">
            <div
              v-for="page in filteredPages"
              :key="page.id"
              class="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-stone-50 cursor-pointer transition-colors"
              @click="selectApp(page)"
            >
              <div class="w-6 h-6 rounded bg-brand-50 flex items-center justify-center shrink-0">
                <i class="ph ph-browser text-xs text-brand-500"></i>
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-ink-800 truncate text-sm">{{ page.title }}</div>
                <div class="text-ink-400 truncate text-xs">{{ page.route_path }}</div>
              </div>
              <span
                class="w-1.5 h-1.5 rounded-full shrink-0"
                :class="page.status === 'active' ? 'bg-green-400' : 'bg-stone-300'"
              ></span>
            </div>
            <div v-if="filteredPages.length === 0" class="px-3 py-4 text-center text-xs text-ink-400">
              {{ pages.length === 0 ? '暂无页面' : '无匹配结果' }}
            </div>
          </div>
          <!-- Custom route input -->
          <div class="border-t border-stone-100 p-2">
            <button
              @click="addCustomRoute"
              class="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
            >
              <i class="ph ph-plus text-base"></i>
              手动输入路由
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: Zoom controls -->
    <div class="flex items-center gap-1">
      <button
        @click="$emit('zoom-out')"
        class="p-1.5 text-ink-500 hover:bg-stone-100 rounded-lg transition-colors"
        title="缩小"
      >
        <i class="ph ph-minus text-sm"></i>
      </button>
      <button
        @click="$emit('zoom-reset')"
        class="px-2 py-1 text-xs font-medium text-ink-600 hover:bg-stone-100 rounded-lg transition-colors min-w-[48px] text-center"
        title="重置缩放"
      >
        {{ zoomPercent }}%
      </button>
      <button
        @click="$emit('zoom-in')"
        class="p-1.5 text-ink-500 hover:bg-stone-100 rounded-lg transition-colors"
        title="放大"
      >
        <i class="ph ph-plus text-sm"></i>
      </button>
    </div>

    <!-- Rename dialog -->
    <div
      v-if="renaming"
      class="fixed inset-0 bg-ink-900/20 z-50 flex items-center justify-center"
      @click.self="renaming = false"
    >
      <div class="bg-white rounded-2xl shadow-xl border border-stone-200 p-5 w-80">
        <h3 class="text-sm font-medium text-ink-900 mb-3">重命名画布</h3>
        <input
          ref="renameInput"
          v-model="renameValue"
          @keydown.enter="confirmRename"
          @keydown.escape="renaming = false"
          class="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg outline-none focus:border-brand-400"
        />
        <div class="flex justify-end gap-2 mt-4">
          <button
            @click="renaming = false"
            class="px-3 py-1.5 text-sm text-ink-500 hover:bg-stone-100 rounded-lg"
          >
            取消
          </button>
          <button
            @click="confirmRename"
            class="px-3 py-1.5 text-sm text-white bg-brand-500 hover:bg-brand-600 rounded-lg"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  projects: { type: Array, default: () => [] },
  activeProject: { type: String, default: null },
  zoom: { type: Number, default: 1 },
  pages: { type: Array, default: () => [] }
})

const emit = defineEmits([
  'select-project', 'create-project', 'rename-project', 'delete-project',
  'add-text', 'add-iframe',
  'add-text-input', 'add-number-input', 'add-button', 'add-image-viewer',
  'zoom-in', 'zoom-out', 'zoom-reset'
])

const dropdownOpen = ref(false)
const dropdownRef = ref(null)
const renaming = ref(false)
const renameValue = ref('')
const renameTarget = ref(null)
const renameInput = ref(null)

// App page selector
const appDropdownOpen = ref(false)
const appDropdownRef = ref(null)
const appSearch = ref('')
const appSearchInput = ref(null)

const activeProjectName = computed(() => {
  const p = props.projects.find(p => p.id === props.activeProject)
  return p ? p.name : '选择画布'
})

const zoomPercent = computed(() => Math.round(props.zoom * 100))

const filteredPages = computed(() => {
  const q = appSearch.value.toLowerCase().trim()
  if (!q) return props.pages
  return props.pages.filter(p =>
    (p.title || '').toLowerCase().includes(q) ||
    (p.route_path || '').toLowerCase().includes(q)
  )
})

function selectProject(id) {
  emit('select-project', id)
  dropdownOpen.value = false
}

function toggleAppDropdown() {
  appDropdownOpen.value = !appDropdownOpen.value
  if (appDropdownOpen.value) {
    appSearch.value = ''
    nextTick(() => appSearchInput.value?.focus())
  }
}

function selectApp(page) {
  emit('add-iframe', { route: page.route_path, title: page.title })
  appDropdownOpen.value = false
}

function addCustomRoute() {
  appDropdownOpen.value = false
  const route = prompt('输入应用路由路径（如 /todo）：')
  if (route) {
    emit('add-iframe', { route, title: route })
  }
}

function startRename(project) {
  renameTarget.value = project
  renameValue.value = project.name
  renaming.value = true
  dropdownOpen.value = false
  nextTick(() => {
    renameInput.value?.focus()
    renameInput.value?.select()
  })
}

function confirmRename() {
  if (renameValue.value.trim() && renameTarget.value) {
    emit('rename-project', { id: renameTarget.value.id, name: renameValue.value.trim() })
  }
  renaming.value = false
}

function onClickOutside(e) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target)) {
    dropdownOpen.value = false
  }
  if (appDropdownRef.value && !appDropdownRef.value.contains(e.target)) {
    appDropdownOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onClickOutside))
onUnmounted(() => document.removeEventListener('click', onClickOutside))
</script>
