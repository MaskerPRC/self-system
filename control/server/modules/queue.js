import PQueue from 'p-queue';

export const requestQueue = new PQueue({ concurrency: 3 });

// 已被用户中断的对话 ID 集合（用于跳过队列中等待的任务）
export const abortedConversations = new Set();
