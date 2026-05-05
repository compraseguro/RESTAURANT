/** Registro en memoria de sockets Print Agent conectados (por restaurant_id). */

const bySocketId = new Map();

function registerAgent(socketId, meta) {
  bySocketId.set(socketId, { ...meta, since: Date.now() });
}

function unregisterAgent(socketId) {
  bySocketId.delete(socketId);
}

function listAgentsForRestaurant(restaurantId) {
  const rid = String(restaurantId || '').trim();
  const out = [];
  for (const [, m] of bySocketId) {
    if (String(m.restaurantId || '') === rid) {
      out.push({
        deviceId: m.deviceId,
        deviceLabel: m.deviceLabel,
        since: m.since,
      });
    }
  }
  return out;
}

function countAgentsForRestaurant(restaurantId) {
  return listAgentsForRestaurant(restaurantId).length;
}

module.exports = {
  registerAgent,
  unregisterAgent,
  listAgentsForRestaurant,
  countAgentsForRestaurant,
};
