import { WebSocketServer } from 'ws';

let wss = null;
const clients = new Set();

/**
 * 设置 WebSocket 服务
 */
export function setupWebSocket(server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    console.log('[WebSocket] 新客户端连接');
    clients.add(ws);

    ws.send(JSON.stringify({ type: 'connected', message: '已连接到控制平台' }));

    ws.on('close', () => {
      console.log('[WebSocket] 客户端断开');
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('[WebSocket] 错误:', error);
      clients.delete(ws);
    });
  });

  console.log('[WebSocket] 服务已启动');
}

/**
 * 广播消息给所有客户端
 */
export function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

export function getClientCount() {
  return clients.size;
}
