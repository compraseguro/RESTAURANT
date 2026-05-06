function charsPerLine(paperWidth) {
  return Number(paperWidth) === 58 ? 32 : 48;
}

function center(text, width) {
  const value = String(text || '').trim();
  if (!value) return '\n';
  if (value.length >= width) return `${value}\n`;
  const left = Math.floor((width - value.length) / 2);
  return `${' '.repeat(left)}${value}\n`;
}

function sep(width) {
  return `${'-'.repeat(width)}\n`;
}

function wrapLine(text, width) {
  const raw = String(text || '').trim();
  if (!raw) return [''];
  const words = raw.split(/\s+/).filter(Boolean);
  const out = [];
  let line = '';
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= width) {
      line = next;
      return;
    }
    if (line) out.push(line);
    if (word.length <= width) {
      line = word;
      return;
    }
    for (let i = 0; i < word.length; i += width) {
      out.push(word.slice(i, i + width));
    }
    line = '';
  });
  if (line) out.push(line);
  return out.length ? out : [''];
}

function buildTicket(moduleName, data = {}, options = {}) {
  const width = charsPerLine(options.paperWidth || 80);
  const lines = [];
  lines.push('\x1B\x40');
  lines.push(center('RESTO FADEY', width));
  if (data.title) lines.push(center(String(data.title).toUpperCase(), width));
  if (data.mesa) lines.push(...wrapLine(`Mesa: ${data.mesa}`, width).map((v) => `${v}\n`));
  if (data.orderNumber != null) lines.push(...wrapLine(`Pedido: #${data.orderNumber}`, width).map((v) => `${v}\n`));
  lines.push(sep(width));

  const items = Array.isArray(data.items) ? data.items : [];
  items.forEach((item) => {
    const qty = Number(item.quantity || item.qty || 0);
    const name = String(item.product_name || item.name || '').trim() || 'Producto';
    wrapLine(`${qty || 1} ${name}`, width).forEach((line) => lines.push(`${line}\n`));
  });

  if (items.length === 0 && data.text) {
    String(data.text)
      .split('\n')
      .forEach((part) => wrapLine(part, width).forEach((line) => lines.push(`${line}\n`)));
  }

  lines.push('\n');
  lines.push(sep(width));
  lines.push(...wrapLine(`Modulo: ${moduleName}`, width).map((v) => `${v}\n`));
  lines.push(...wrapLine(`${new Date().toLocaleString('es-PE')}`, width).map((v) => `${v}\n`));
  lines.push('\n\n');
  lines.push('\x1D\x56\x41');
  return Buffer.from(lines.join(''), 'utf8');
}

module.exports = { buildTicket };
