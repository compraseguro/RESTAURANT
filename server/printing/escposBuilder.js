function center(text) {
  return `${String(text || '').trim()}\n`;
}

function sep() {
  return '--------------------------------\n';
}

function buildTicket(moduleName, data = {}) {
  const lines = [];
  lines.push('\x1B\x40');
  lines.push(center('RESTO FADEY'));
  if (data.title) lines.push(center(String(data.title).toUpperCase()));
  if (data.mesa) lines.push(`Mesa: ${data.mesa}\n`);
  if (data.orderNumber != null) lines.push(`Pedido: #${data.orderNumber}\n`);
  lines.push(sep());

  const items = Array.isArray(data.items) ? data.items : [];
  items.forEach((item) => {
    const qty = Number(item.quantity || item.qty || 0);
    const name = String(item.product_name || item.name || '').trim() || 'Producto';
    lines.push(`${qty || 1} ${name}\n`);
  });

  if (items.length === 0 && data.text) {
    lines.push(`${String(data.text)}\n`);
  }

  lines.push('\n');
  lines.push(sep());
  lines.push(`Modulo: ${moduleName}\n`);
  lines.push(`${new Date().toLocaleString('es-PE')}\n`);
  lines.push('\n\n');
  lines.push('\x1D\x56\x41');
  return Buffer.from(lines.join(''), 'utf8');
}

module.exports = { buildTicket };
