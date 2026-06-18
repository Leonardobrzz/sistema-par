const WebSocket = require('ws');

let wss = null;
// Mapa: userId → ws connection
const clients = new Map();

/**
 * Inicializa o servidor WebSocket no mesmo HTTP server do Express.
 */
function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId');
    const perfil = url.searchParams.get('perfil');

    if (userId) {
      ws.userId = userId;
      ws.perfil = perfil || 'PO';
      clients.set(userId, ws);
      console.log(`[WS] Usuário ${userId} (${perfil}) conectado.`);
    }

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        if (data.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch {
        // ignora mensagens inválidas
      }
    });

    ws.on('close', () => {
      if (userId) {
        clients.delete(userId);
        console.log(`[WS] Usuário ${userId} desconectado.`);
      }
    });

    ws.on('error', (err) => {
      console.error('[WS] Erro:', err.message);
    });

    // Envia confirmação de conexão
    ws.send(JSON.stringify({ type: 'connected', message: 'Conectado ao Sistema PAR' }));
  });

  console.log('[WS] Servidor WebSocket inicializado.');
}

/**
 * Envia uma mensagem para todos os usuários de determinados perfis.
 * @param {string} type - tipo da mensagem
 * @param {object} payload - dados
 * @param {string[]} targetProfiles - perfis destinatários (null = todos)
 */
function broadcast(type, payload, targetProfiles = null) {
  if (!wss) return;

  const message = JSON.stringify({ type, data: payload, timestamp: new Date().toISOString() });

  clients.forEach((ws, userId) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (targetProfiles && !targetProfiles.includes(ws.perfil)) return;
    ws.send(message);
  });
}

/**
 * Envia mensagem para um usuário específico.
 */
function sendToUser(userId, type, payload) {
  const ws = clients.get(String(userId));
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data: payload, timestamp: new Date().toISOString() }));
  }
}

/**
 * Retorna quantos clientes estão conectados.
 */
function getConnectedCount() {
  return clients.size;
}

module.exports = { initWebSocket, broadcast, sendToUser, getConnectedCount };
