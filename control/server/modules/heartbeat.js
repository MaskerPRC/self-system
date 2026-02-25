import { getSupabase } from './supabase.js';

const INACTIVE_THRESHOLD_MS = 30000; // 30秒无心跳视为不活跃
let checkInterval = null;

/**
 * 注册心跳
 */
export async function registerHeartbeat(routePath) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('interactive_pages')
    .update({ last_heartbeat: new Date().toISOString(), status: 'active' })
    .eq('route_path', routePath);

  if (error) {
    console.error('[Heartbeat] 更新失败:', error.message);
  }
}

/**
 * 标记不活跃页面
 */
async function checkInactivePages() {
  try {
    const supabase = getSupabase();
    const threshold = new Date(Date.now() - INACTIVE_THRESHOLD_MS).toISOString();

    await supabase
      .from('interactive_pages')
      .update({ status: 'inactive' })
      .eq('status', 'active')
      .lt('last_heartbeat', threshold);
  } catch (e) {
    // Supabase 可能未配置，静默处理
  }
}

/**
 * 获取所有页面（含关联对话标题）
 */
export async function getAllPages() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('interactive_pages')
    .select('*, conversations(title)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 获取活跃页面
 */
export async function getActivePages() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('interactive_pages')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 启动心跳检测
 */
export function startHeartbeatChecker() {
  if (checkInterval) return;
  checkInterval = setInterval(checkInactivePages, 15000);
  console.log('[Heartbeat] 检测已启动');
}

export function stopHeartbeatChecker() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}
