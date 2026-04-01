import PQueue from 'p-queue';

export const requestQueue = new PQueue({ concurrency: 3 });

// 已被用户中断的对话 ID 集合（用于跳过队列中等待的任务）
export const abortedConversations = new Set();

// ========== 对话级消息队列 ==========
// 每个对话的等待处理消息队列: Map<conversationId, Array<{messageId, requestId, payload}>>
const conversationQueues = new Map();
// 当前正在处理消息的对话: Set<conversationId>
const processingConversationMessages = new Set();

/**
 * 添加消息到对话队列
 */
export function addToConversationQueue(conversationId, item) {
  if (!conversationQueues.has(conversationId)) {
    conversationQueues.set(conversationId, []);
  }
  conversationQueues.get(conversationId).push(item);
  return conversationQueues.get(conversationId).length;
}

/**
 * 从对话队列中移除指定消息
 * @returns {boolean} 是否成功移除
 */
export function removeFromConversationQueue(conversationId, messageId) {
  const queue = conversationQueues.get(conversationId);
  if (!queue) return false;
  const idx = queue.findIndex(item => item.messageId === messageId);
  if (idx === -1) return false;
  queue.splice(idx, 1);
  if (queue.length === 0) conversationQueues.delete(conversationId);
  return true;
}

/**
 * 获取对话队列
 */
export function getConversationQueue(conversationId) {
  return conversationQueues.get(conversationId) || [];
}

/**
 * 取出对话队列首项
 */
export function shiftConversationQueue(conversationId) {
  const queue = conversationQueues.get(conversationId);
  if (!queue || queue.length === 0) return null;
  const item = queue.shift();
  if (queue.length === 0) conversationQueues.delete(conversationId);
  return item;
}

/**
 * 获取所有对话的队列信息（用于 WebSocket connected 事件）
 */
export function getAllConversationQueues() {
  const result = {};
  for (const [convId, queue] of conversationQueues) {
    result[convId] = queue.map(item => item.messageId);
  }
  return result;
}

/**
 * 标记对话正在处理消息
 */
export function markConversationProcessing(conversationId) {
  processingConversationMessages.add(conversationId);
}

/**
 * 清除对话处理状态
 */
export function clearConversationProcessing(conversationId) {
  processingConversationMessages.delete(conversationId);
}

/**
 * 检查对话是否正在处理或有排队消息
 */
export function isConversationBusy(conversationId) {
  return processingConversationMessages.has(conversationId) || conversationQueues.has(conversationId);
}
