<template>
  <div @click="$emit('preview', page)" class="bg-paper border border-stone-200 p-6 rounded-3xl hover:border-stone-300 hover:shadow-float transition-all duration-400 group flex flex-col h-full relative cursor-pointer">
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-serif font-bold text-ink-900 text-xl truncate pr-2 group-hover:text-brand-700 transition-colors">{{ page.title }}</h3>
      <div class="w-2.5 h-2.5 rounded-full shrink-0" :class="statusDotClass" :title="page.status"></div>
    </div>

    <p v-if="page.description" class="text-ink-500 text-sm leading-relaxed mb-8 flex-1">{{ page.description }}</p>

    <div class="flex items-center justify-between mt-auto">
      <span class="text-xs font-mono text-ink-400 bg-surface px-2.5 py-1 rounded-md border border-stone-100">{{ page.route_path }}</span>
      <div class="flex gap-1">
        <button @click.stop="$emit('feature', page)" class="w-8 h-8 rounded-full flex items-center justify-center transition-colors" :class="page.is_featured ? 'text-amber-500 hover:text-amber-600 bg-amber-50' : 'text-ink-400 hover:text-amber-500 hover:bg-amber-50 opacity-0 group-hover:opacity-100'" :title="page.is_featured ? '取消精选' : '设为精选'">
          <i :class="page.is_featured ? 'ph-fill ph-star' : 'ph ph-star'"></i>
        </button>
        <button @click.stop="$emit('delete', page.id)" class="w-8 h-8 rounded-full flex items-center justify-center text-ink-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100" title="删除">
          <i class="ph ph-trash"></i>
        </button>
        <button @click.stop="$emit('preview', page)" class="w-8 h-8 rounded-full flex items-center justify-center text-ink-700 bg-surface border border-stone-200 hover:bg-paper hover:shadow-sm hover:border-stone-300 transition-all" title="预览">
          <i class="ph ph-eye"></i>
        </button>
        <button @click.stop="$emit('open', page)" class="w-8 h-8 rounded-full flex items-center justify-center text-ink-700 bg-surface border border-stone-200 hover:bg-paper hover:shadow-sm hover:border-stone-300 transition-all" title="新窗口打开">
          <i class="ph ph-arrow-up-right"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ page: Object })
defineEmits(['open', 'delete', 'preview', 'feature'])

const statusDotClass = computed(() => {
  if (props.page.status === 'active') return 'bg-emerald-500'
  if (props.page.status === 'building') return 'bg-brand-500 animate-organic'
  return 'bg-stone-300'
})
</script>
