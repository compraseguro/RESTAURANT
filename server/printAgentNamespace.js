const { verifyPrintAgentToken } = require('./middleware/auth');
const { registerAgent, unregisterAgent } = require('./printAgentRegistry');

/**
 * Namespace Socket.IO `/print-agent` — agentes locales (Node) con JWT dedicado.
 */
function attachPrintAgentNamespace(io) {
  const nsp = io.of('/print-agent');

  nsp.use((socket, next) => {
    try {
      const raw = socket.handshake.auth?.token || socket.handshake.query?.token;
      const token = typeof raw === 'string' ? raw : '';
      if (!token) {
        return next(new Error('auth_required'));
      }
      const agent = verifyPrintAgentToken(token);
      socket.agentMeta = {
        restaurantId: String(agent.restaurant_id || ''),
        deviceId: String(agent.device_id || ''),
        deviceLabel: String(agent.device_label || ''),
      };
      next();
    } catch (e) {
      next(new Error('auth_invalid'));
    }
  });

  nsp.on('connection', (socket) => {
    const { restaurantId, deviceId, deviceLabel } = socket.agentMeta;
    registerAgent(socket.id, { restaurantId, deviceId, deviceLabel });
    socket.join(`ra-${restaurantId}`);

    socket.emit('agent-ready', {
      ok: true,
      restaurantId,
      deviceId,
      serverTime: new Date().toISOString(),
    });

    socket.on('disconnect', () => {
      unregisterAgent(socket.id);
    });

    socket.on('agent-ping', (cb) => {
      if (typeof cb === 'function') cb({ pong: true, t: Date.now() });
    });

    socket.on('print-ack', (payload) => {
      /** Reservado: confirmación de cola local del agente */
      if (payload?.jobId) {
        console.log(
          JSON.stringify({
            level: 'info',
            msg: 'print_agent_ack',
            job_id: payload.jobId,
            device_id: deviceId,
          })
        );
      }
    });
  });

  return nsp;
}

module.exports = { attachPrintAgentNamespace };
