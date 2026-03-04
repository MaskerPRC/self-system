<template>
  <Teleport to="body">
    <div v-if="visible" class="fixed inset-0 z-[100] flex items-center justify-center">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-ink-900/20 backdrop-blur-[3px]" @click="$emit('close')"></div>

      <!-- Modal -->
      <div class="relative bg-paper rounded-2xl shadow-float border border-stone-200 w-[90vw] max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-fade-in-up">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <h2 class="font-serif text-lg font-semibold text-ink-900">设置</h2>
          <button @click="$emit('close')" class="w-8 h-8 flex items-center justify-center text-ink-400 hover:text-ink-900 hover:bg-stone-100 rounded-full transition-colors">
            <i class="ph ph-x text-lg"></i>
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto px-6 py-5">
          <!-- Claude Code Config Section -->
          <div>
            <div class="mb-4">
              <h3 class="font-medium text-ink-900">Claude Code 配置</h3>
              <p class="text-xs text-ink-500 mt-0.5">AI 模型提供商设置，保存后立即生效，覆盖环境变量配置</p>
            </div>

            <div class="space-y-3">
              <div>
                <label class="text-xs font-medium text-ink-700 mb-1 block">提供商</label>
                <select v-model="claudeConfig.provider"
                  class="w-full px-3 py-2 text-sm bg-paper border border-stone-200 rounded-lg outline-none focus:border-brand-300 transition-colors">
                  <option value="">未配置（使用环境变量）</option>
                  <option value="qwen">通义千问</option>
                  <option value="minimax">MiniMax</option>
                  <option value="zhipu">智谱 GLM</option>
                  <option value="proxy">代理模式</option>
                </select>
              </div>

              <!-- Qwen / MiniMax / Zhipu: API Key -->
              <div v-if="claudeConfig.provider && claudeConfig.provider !== 'proxy'">
                <label class="text-xs font-medium text-ink-700 mb-1 block">API Key</label>
                <div class="relative">
                  <input
                    :type="showClaudeKey ? 'text' : 'password'"
                    v-model="claudeConfig.apiKey"
                    placeholder="输入 API Key"
                    class="w-full px-3 py-2 pr-9 text-sm bg-paper border border-stone-200 rounded-lg outline-none focus:border-brand-300 transition-colors font-mono" />
                  <button @click="showClaudeKey = !showClaudeKey"
                    class="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-ink-400 hover:text-ink-700 transition-colors">
                    <i :class="showClaudeKey ? 'ph ph-eye-slash' : 'ph ph-eye'" class="text-sm"></i>
                  </button>
                </div>
                <p v-if="claudeConfigHasKey && !claudeConfigKeyChanged" class="text-[11px] text-emerald-600 mt-1">
                  <i class="ph-fill ph-check-circle mr-0.5"></i>已配置（留空保持不变，输入新值可覆盖）
                </p>
              </div>

              <!-- Qwen: Model -->
              <div v-if="claudeConfig.provider === 'qwen'">
                <label class="text-xs font-medium text-ink-700 mb-1 block">模型名称</label>
                <input v-model="claudeConfig.model"
                  placeholder="qwen3.5-plus"
                  class="w-full px-3 py-2 text-sm bg-paper border border-stone-200 rounded-lg outline-none focus:border-brand-300 transition-colors font-mono" />
              </div>

              <!-- Proxy: URL + Key -->
              <template v-if="claudeConfig.provider === 'proxy'">
                <div>
                  <label class="text-xs font-medium text-ink-700 mb-1 block">代理 URL</label>
                  <input v-model="claudeConfig.proxyUrl"
                    placeholder="https://example.com"
                    class="w-full px-3 py-2 text-sm bg-paper border border-stone-200 rounded-lg outline-none focus:border-brand-300 transition-colors font-mono" />
                </div>
                <div>
                  <label class="text-xs font-medium text-ink-700 mb-1 block">代理 Key</label>
                  <div class="relative">
                    <input
                      :type="showClaudeKey ? 'text' : 'password'"
                      v-model="claudeConfig.proxyKey"
                      placeholder="输入代理 Key"
                      class="w-full px-3 py-2 pr-9 text-sm bg-paper border border-stone-200 rounded-lg outline-none focus:border-brand-300 transition-colors font-mono" />
                    <button @click="showClaudeKey = !showClaudeKey"
                      class="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-ink-400 hover:text-ink-700 transition-colors">
                      <i :class="showClaudeKey ? 'ph ph-eye-slash' : 'ph ph-eye'" class="text-sm"></i>
                    </button>
                  </div>
                  <p v-if="claudeConfigHasProxyKey && !claudeConfigProxyKeyChanged" class="text-[11px] text-emerald-600 mt-1">
                    <i class="ph-fill ph-check-circle mr-0.5"></i>已配置（留空保持不变，输入新值可覆盖）
                  </p>
                </div>
              </template>

              <div class="flex items-center gap-2">
                <button @click="saveClaudeConfig"
                  :disabled="claudeConfigSaving || !claudeConfig.provider"
                  class="text-xs font-medium px-4 py-1.5 bg-brand-500 text-white rounded-full hover:bg-brand-600 disabled:opacity-40 transition-colors">
                  {{ claudeConfigSaving ? '保存中...' : '保存' }}
                </button>
                <button v-if="claudeConfigHasConfig" @click="clearClaudeConfig"
                  class="text-xs font-medium px-3 py-1.5 rounded-full border border-stone-200 text-ink-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                  清除配置
                </button>
              </div>
              <div v-if="claudeConfigMessage" class="p-3 rounded-lg text-xs font-medium"
                :class="claudeConfigError ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'">
                {{ claudeConfigMessage }}
              </div>
            </div>
          </div>

          <!-- Divider -->
          <div class="border-t border-stone-200 my-6"></div>

          <!-- UI Style Section -->
          <div>
            <div class="mb-4">
              <h3 class="font-medium text-ink-900">UI 风格</h3>
              <p class="text-xs text-ink-500 mt-0.5">生成页面时的默认设计风格，用户在对话中指定风格时会覆盖此设置</p>
            </div>
            <textarea v-model="uiStyle" rows="4"
              class="w-full px-3 py-2 text-sm bg-paper border border-stone-200 rounded-lg outline-none focus:border-brand-300 resize-none transition-colors leading-relaxed"
              placeholder="描述你期望的 UI 风格..."></textarea>
            <div class="flex items-center gap-2 mt-2">
              <button @click="saveUiStyle" :disabled="uiStyleSaving"
                class="text-xs font-medium px-4 py-1.5 bg-brand-500 text-white rounded-full hover:bg-brand-600 disabled:opacity-40 transition-colors">
                {{ uiStyleSaving ? '保存中...' : '保存' }}
              </button>
              <button @click="resetUiStyle"
                class="text-xs font-medium px-3 py-1.5 rounded-full border border-stone-200 text-ink-500 hover:bg-stone-50 transition-colors">
                恢复默认
              </button>
              <span v-if="uiStyleMessage" class="text-xs font-medium text-emerald-600 ml-1">{{ uiStyleMessage }}</span>
            </div>
          </div>

          <!-- Divider -->
          <div class="border-t border-stone-200 my-6"></div>

          <!-- Skills Section -->
          <div>
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="font-medium text-ink-900">Skills</h3>
                <p class="text-xs text-ink-500 mt-0.5">Claude Code 的扩展能力，可在对话中自动使用</p>
              </div>
              <button @click="showCreateForm = !showCreateForm"
                class="text-xs font-medium px-3 py-1.5 rounded-full border border-stone-200 text-ink-600 hover:bg-stone-50 transition-colors">
                <i class="ph ph-plus mr-1"></i>手动添加
              </button>
            </div>

            <!-- Create Form -->
            <div v-if="showCreateForm" class="mb-4 p-4 bg-surface rounded-xl border border-stone-200">
              <div class="space-y-3">
                <div>
                  <label class="text-xs font-medium text-ink-700 mb-1 block">名称</label>
                  <input v-model="newSkill.name" placeholder="例如: weather-api" class="w-full px-3 py-2 text-sm bg-paper border border-stone-200 rounded-lg outline-none focus:border-brand-300 transition-colors" />
                </div>
                <div>
                  <label class="text-xs font-medium text-ink-700 mb-1 block">描述</label>
                  <input v-model="newSkill.description" placeholder="这个 skill 的用途" class="w-full px-3 py-2 text-sm bg-paper border border-stone-200 rounded-lg outline-none focus:border-brand-300 transition-colors" />
                </div>
                <div>
                  <label class="text-xs font-medium text-ink-700 mb-1 block">内容</label>
                  <textarea v-model="newSkill.content" rows="5" placeholder="Skill 的详细说明、API 端点、使用方式等..." class="w-full px-3 py-2 text-sm bg-paper border border-stone-200 rounded-lg outline-none focus:border-brand-300 resize-none transition-colors font-mono"></textarea>
                </div>
                <div class="flex gap-2 justify-end">
                  <button @click="showCreateForm = false" class="text-xs px-3 py-1.5 text-ink-500 hover:text-ink-900 transition-colors">取消</button>
                  <button @click="handleCreate" :disabled="!newSkill.name || !newSkill.description" class="text-xs font-medium px-4 py-1.5 bg-brand-500 text-white rounded-full hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">创建</button>
                </div>
              </div>
            </div>

            <!-- Skills List -->
            <div v-if="skills.length" class="space-y-2">
              <div v-for="skill in skills" :key="skill.folder" class="group p-4 bg-surface rounded-xl border border-stone-200 hover:border-stone-300 transition-colors">
                <div class="flex items-start justify-between">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-sm text-ink-900">{{ skill.name }}</span>
                      <span class="text-[10px] px-2 py-0.5 bg-brand-50 text-brand-600 rounded-full font-medium">skill</span>
                    </div>
                    <p class="text-xs text-ink-500 mt-1 line-clamp-2">{{ skill.description }}</p>
                  </div>
                  <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-3">
                    <button @click="viewSkill(skill)" class="w-7 h-7 flex items-center justify-center text-ink-400 hover:text-brand-600 hover:bg-brand-50 rounded-full transition-colors" title="查看">
                      <i class="ph ph-eye text-sm"></i>
                    </button>
                    <button @click="handleDelete(skill.folder)" class="w-7 h-7 flex items-center justify-center text-ink-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" title="删除">
                      <i class="ph ph-trash text-sm"></i>
                    </button>
                  </div>
                </div>

                <!-- Expanded Content -->
                <div v-if="expandedSkill === skill.folder" class="mt-3 pt-3 border-t border-stone-200">
                  <pre class="text-xs text-ink-700 whitespace-pre-wrap font-mono bg-paper p-3 rounded-lg border border-stone-100 max-h-60 overflow-y-auto">{{ skill.content }}</pre>
                </div>
              </div>
            </div>

            <!-- Empty State -->
            <div v-else class="text-center py-10 text-ink-400">
              <div class="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <i class="ph ph-puzzle-piece text-2xl text-ink-300"></i>
              </div>
              <p class="text-sm font-medium text-ink-700">暂无 Skills</p>
              <p class="text-xs mt-1">在对话中描述 API 文档即可自动创建，或手动添加</p>
            </div>
          </div>

          <!-- Divider -->
          <div class="border-t border-stone-200 my-6"></div>

          <!-- Git Remote Config Section -->
          <div>
            <div class="mb-4">
              <h3 class="font-medium text-ink-900">Git 远程仓库</h3>
              <p class="text-xs text-ink-500 mt-0.5">配置远程仓库地址和访问令牌，支持自动推送代码</p>
            </div>

            <div class="space-y-3">
              <div>
                <label class="text-xs font-medium text-ink-700 mb-1 block">仓库地址</label>
                <input v-model="remoteConfig.repoUrl"
                  placeholder="https://github.com/user/repo.git"
                  class="w-full px-3 py-2 text-sm bg-paper border border-stone-200 rounded-lg outline-none focus:border-brand-300 transition-colors font-mono" />
              </div>
              <div>
                <label class="text-xs font-medium text-ink-700 mb-1 block">PAT Token</label>
                <div class="relative">
                  <input
                    :type="showToken ? 'text' : 'password'"
                    v-model="remoteConfig.token"
                    placeholder="ghp_xxxxxxxxxxxx"
                    class="w-full px-3 py-2 pr-9 text-sm bg-paper border border-stone-200 rounded-lg outline-none focus:border-brand-300 transition-colors font-mono" />
                  <button @click="showToken = !showToken"
                    class="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-ink-400 hover:text-ink-700 transition-colors">
                    <i :class="showToken ? 'ph ph-eye-slash' : 'ph ph-eye'" class="text-sm"></i>
                  </button>
                </div>
                <p v-if="remoteConfig.hasToken && !remoteConfig.token" class="text-[11px] text-emerald-600 mt-1">
                  <i class="ph-fill ph-check-circle mr-0.5"></i>已配置（留空保持不变，输入新值可覆盖）
                </p>
              </div>
              <div class="flex items-center gap-2">
                <button @click="saveRemoteConfig"
                  :disabled="remoteSaving"
                  class="text-xs font-medium px-4 py-1.5 bg-brand-500 text-white rounded-full hover:bg-brand-600 disabled:opacity-40 transition-colors">
                  {{ remoteSaving ? '保存中...' : '保存配置' }}
                </button>
                <button @click="testPush"
                  :disabled="remotePushing || !remoteConfig.repoUrl"
                  class="text-xs font-medium px-4 py-1.5 rounded-full border border-stone-200 text-ink-600 hover:bg-stone-50 disabled:opacity-40 transition-colors">
                  {{ remotePushing ? '推送中...' : '测试推送' }}
                </button>
              </div>
              <div v-if="remoteMessage" class="p-3 rounded-lg text-xs font-medium"
                :class="remoteMessageError ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'">
                {{ remoteMessage }}
              </div>
            </div>
          </div>

          <!-- Divider -->
          <div class="border-t border-stone-200 my-6"></div>

          <!-- Git Version Section -->
          <div>
            <div class="flex items-center justify-between mb-4">
              <div>
                <h3 class="font-medium text-ink-900">Git 版本管理</h3>
                <p class="text-xs text-ink-500 mt-0.5">代码变更自动保存，支持回滚到任意历史版本</p>
              </div>
              <button @click="fetchCommits" class="w-8 h-8 flex items-center justify-center text-ink-400 hover:text-ink-900 hover:bg-stone-100 rounded-full transition-colors" title="刷新">
                <i class="ph ph-arrows-clockwise text-sm" :class="{ 'animate-spin': gitLoading }"></i>
              </button>
            </div>

            <!-- Rollback Status -->
            <div v-if="gitMessage" class="mb-3 p-3 rounded-lg text-xs font-medium" :class="gitMessageError ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'">
              {{ gitMessage }}
            </div>

            <!-- Commit History -->
            <div v-if="commits.length" class="space-y-1.5">
              <div v-for="(c, i) in commits" :key="c.hash"
                class="group flex items-center gap-3 p-3 rounded-xl border transition-colors"
                :class="c.current ? 'bg-brand-50/50 border-brand-200' : 'bg-surface border-stone-200 hover:border-stone-300'">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <code class="text-xs font-mono text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">{{ c.hash }}</code>
                    <span v-if="c.current" class="text-[10px] px-2 py-0.5 bg-brand-500 text-white rounded-full font-medium">当前</span>
                  </div>
                  <p class="text-sm text-ink-700 mt-1 truncate">{{ c.message }}</p>
                  <p class="text-[11px] text-ink-400 mt-0.5">{{ formatDate(c.date) }}</p>
                </div>
                <button v-if="!c.current"
                  @click="handleCheckout(c.hash, c.message)"
                  :disabled="gitLoading"
                  class="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border border-stone-200 text-ink-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-40">
                  回滚
                </button>
              </div>
            </div>

            <!-- Empty State -->
            <div v-else-if="!gitLoading" class="text-center py-10 text-ink-400">
              <div class="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <i class="ph ph-git-branch text-2xl text-ink-300"></i>
              </div>
              <p class="text-sm font-medium text-ink-700">暂无提交记录</p>
              <p class="text-xs mt-1">通过对话创建页面后会自动记录代码版本</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, computed } from 'vue'

const props = defineProps({
  visible: Boolean
})
const emit = defineEmits(['close'])

const API = ''

// Claude Code 配置
const claudeConfig = ref({ provider: '', apiKey: '', model: '', proxyUrl: '', proxyKey: '' })
const claudeConfigSaving = ref(false)
const claudeConfigMessage = ref('')
const claudeConfigError = ref(false)
const claudeConfigHasConfig = ref(false)
const claudeConfigHasKey = ref(false)
const claudeConfigHasProxyKey = ref(false)
const showClaudeKey = ref(false)
const claudeConfigOriginalApiKey = ref('')
const claudeConfigOriginalProxyKey = ref('')
const claudeConfigKeyChanged = computed(() => claudeConfig.value.apiKey && claudeConfig.value.apiKey !== claudeConfigOriginalApiKey.value)
const claudeConfigProxyKeyChanged = computed(() => claudeConfig.value.proxyKey && claudeConfig.value.proxyKey !== claudeConfigOriginalProxyKey.value)

const skills = ref([])
const showCreateForm = ref(false)
const expandedSkill = ref(null)
const newSkill = ref({ name: '', description: '', content: '' })

const commits = ref([])
const gitLoading = ref(false)
const gitMessage = ref('')
const gitMessageError = ref(false)

const remoteConfig = ref({ repoUrl: '', token: '', hasToken: false })
const showToken = ref(false)
const remoteSaving = ref(false)
const remotePushing = ref(false)
const remoteMessage = ref('')
const remoteMessageError = ref(false)

const DEFAULT_UI_STYLE = '现代简约风格，使用 Tailwind CSS 4。配色以白色/浅灰为主背景，搭配一个品牌强调色。圆角卡片布局，适当留白，字体清晰易读。响应式设计，移动端友好。'
const uiStyle = ref(DEFAULT_UI_STYLE)
const uiStyleSaving = ref(false)
const uiStyleMessage = ref('')

async function fetchSkills() {
  try {
    const r = await fetch(`${API}/api/skills`)
    const d = await r.json()
    if (d.success) skills.value = d.data
  } catch {}
}

function viewSkill(skill) {
  expandedSkill.value = expandedSkill.value === skill.folder ? null : skill.folder
}

async function handleCreate() {
  if (!newSkill.value.name || !newSkill.value.description) return
  try {
    await fetch(`${API}/api/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSkill.value)
    })
    newSkill.value = { name: '', description: '', content: '' }
    showCreateForm.value = false
    fetchSkills()
  } catch {}
}

async function handleDelete(name) {
  if (!confirm(`确定删除 Skill「${name}」？`)) return
  try {
    await fetch(`${API}/api/skills/${name}`, { method: 'DELETE' })
    fetchSkills()
  } catch {}
}

watch(() => props.visible, (v) => {
  if (v) { fetchClaudeConfig(); fetchSkills(); fetchCommits(); fetchRemoteConfig(); fetchSettings() }
})

// Claude Code 配置
async function fetchClaudeConfig() {
  try {
    const r = await fetch(`${API}/api/settings/claude-config`)
    const d = await r.json()
    if (d.success && d.data) {
      claudeConfig.value.provider = d.data.provider || ''
      claudeConfig.value.apiKey = d.data.apiKey || ''
      claudeConfig.value.model = d.data.model || ''
      claudeConfig.value.proxyUrl = d.data.proxyUrl || ''
      claudeConfig.value.proxyKey = d.data.proxyKey || ''
      claudeConfigHasConfig.value = true
      claudeConfigHasKey.value = d.data.hasApiKey || false
      claudeConfigHasProxyKey.value = d.data.hasProxyKey || false
      claudeConfigOriginalApiKey.value = d.data.apiKey || ''
      claudeConfigOriginalProxyKey.value = d.data.proxyKey || ''
    } else {
      claudeConfig.value = { provider: '', apiKey: '', model: '', proxyUrl: '', proxyKey: '' }
      claudeConfigHasConfig.value = false
      claudeConfigHasKey.value = false
      claudeConfigHasProxyKey.value = false
    }
  } catch {}
}

async function saveClaudeConfig() {
  claudeConfigSaving.value = true
  claudeConfigMessage.value = ''
  claudeConfigError.value = false
  try {
    const body = { provider: claudeConfig.value.provider, model: claudeConfig.value.model, proxyUrl: claudeConfig.value.proxyUrl }
    // 只在用户修改了 key 时才发送
    if (claudeConfigKeyChanged.value) body.apiKey = claudeConfig.value.apiKey
    if (claudeConfigProxyKeyChanged.value) body.proxyKey = claudeConfig.value.proxyKey
    const r = await fetch(`${API}/api/settings/claude-config`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const d = await r.json()
    if (d.success) {
      claudeConfigMessage.value = '配置已保存并生效'
      claudeConfigHasConfig.value = true
      fetchClaudeConfig()
    } else {
      claudeConfigMessage.value = `保存失败: ${d.error}`
      claudeConfigError.value = true
    }
  } catch (e) {
    claudeConfigMessage.value = `保存失败: ${e.message}`
    claudeConfigError.value = true
  } finally {
    claudeConfigSaving.value = false
    setTimeout(() => { claudeConfigMessage.value = '' }, 3000)
  }
}

async function clearClaudeConfig() {
  if (!confirm('确定清除 Claude Code 配置？清除后将恢复使用环境变量设置（需重启容器生效）。')) return
  try {
    const r = await fetch(`${API}/api/settings/claude-config`, { method: 'DELETE' })
    const d = await r.json()
    if (d.success) {
      claudeConfig.value = { provider: '', apiKey: '', model: '', proxyUrl: '', proxyKey: '' }
      claudeConfigHasConfig.value = false
      claudeConfigHasKey.value = false
      claudeConfigHasProxyKey.value = false
      claudeConfigMessage.value = '配置已清除'
      claudeConfigError.value = false
      setTimeout(() => { claudeConfigMessage.value = '' }, 2000)
    }
  } catch {}
}

async function fetchSettings() {
  try {
    const r = await fetch(`${API}/api/settings`)
    const d = await r.json()
    if (d.success && d.data.uiStyle) uiStyle.value = d.data.uiStyle
  } catch {}
}

async function saveUiStyle() {
  uiStyleSaving.value = true
  uiStyleMessage.value = ''
  try {
    const r = await fetch(`${API}/api/settings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uiStyle: uiStyle.value })
    })
    const d = await r.json()
    if (d.success) uiStyleMessage.value = '已保存'
  } catch {}
  uiStyleSaving.value = false
  setTimeout(() => { uiStyleMessage.value = '' }, 2000)
}

function resetUiStyle() {
  uiStyle.value = DEFAULT_UI_STYLE
}

async function fetchRemoteConfig() {
  try {
    const r = await fetch(`${API}/api/git/remote-config`)
    const d = await r.json()
    if (d.success) {
      remoteConfig.value.repoUrl = d.data.repoUrl || ''
      remoteConfig.value.hasToken = d.data.hasToken || false
      remoteConfig.value.token = ''  // 不回显 token
    }
  } catch {}
}

async function saveRemoteConfig() {
  remoteSaving.value = true
  remoteMessage.value = ''
  try {
    const body = { repoUrl: remoteConfig.value.repoUrl }
    // 只有用户输入了新 token 才发送
    if (remoteConfig.value.token) body.token = remoteConfig.value.token
    const r = await fetch(`${API}/api/git/remote-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const d = await r.json()
    if (d.success) {
      remoteMessage.value = '远程仓库配置已保存'
      remoteMessageError.value = false
      remoteConfig.value.hasToken = d.data.hasToken
      remoteConfig.value.token = ''
    } else {
      remoteMessage.value = `保存失败: ${d.error}`
      remoteMessageError.value = true
    }
  } catch (e) {
    remoteMessage.value = `保存失败: ${e.message}`
    remoteMessageError.value = true
  } finally {
    remoteSaving.value = false
  }
}

async function testPush() {
  remotePushing.value = true
  remoteMessage.value = ''
  try {
    const r = await fetch(`${API}/api/git/push`, { method: 'POST' })
    const d = await r.json()
    if (d.success) {
      remoteMessage.value = '推送成功!'
      remoteMessageError.value = false
    } else {
      remoteMessage.value = `推送失败: ${d.error}`
      remoteMessageError.value = true
    }
  } catch (e) {
    remoteMessage.value = `推送失败: ${e.message}`
    remoteMessageError.value = true
  } finally {
    remotePushing.value = false
  }
}

async function fetchCommits() {
  gitLoading.value = true
  try {
    const r = await fetch(`${API}/api/git/commits`)
    const d = await r.json()
    if (d.success) commits.value = d.data
  } catch {} finally {
    gitLoading.value = false
  }
}

async function handleCheckout(hash, message) {
  if (!confirm(`确定回滚到版本 ${hash}？\n「${message}」\n\n回滚后应用将自动重启。`)) return
  gitLoading.value = true
  gitMessage.value = ''
  try {
    const r = await fetch(`${API}/api/git/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash })
    })
    const d = await r.json()
    if (d.success) {
      gitMessage.value = `已回滚到 ${hash}，应用正在重启...`
      gitMessageError.value = false
      fetchCommits()
    } else {
      gitMessage.value = `回滚失败: ${d.error}`
      gitMessageError.value = true
    }
  } catch (e) {
    gitMessage.value = `回滚失败: ${e.message}`
    gitMessageError.value = true
  } finally {
    gitLoading.value = false
  }
}

function formatDate(s) {
  if (!s) return ''
  const d = new Date(s)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}
</script>
