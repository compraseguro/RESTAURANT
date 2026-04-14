const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne } = require('./database');
const { normalizePaymentMethod } = require('./businessRules');

function getOrderWithItems(orderId) {
  const order = queryOne('SELECT * FROM orders WHERE id = ?', [orderId]);
  if (!order) return null;
  order.items = queryAll(
    `SELECT oi.*, p.production_area
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ?`,
    [orderId]
  );
  return order;
}

/**
 * @param {*} tx - objeto de transacción (queryOne, queryAll, run)
 * @param {string} orderId
 * @param {object} body - mismo cuerpo que POST /orders
 * @param {{ kind: 'customer' | 'staff' | 'public_qr' | 'public_customer', user?: object, customerId?: string }} actor
 */
function createOrderInTransaction(tx, orderId, body, actor) {
  const {
    items,
    type,
    table_number,
    delivery_address,
    notes,
    payment_method,
    customer_name,
    discount,
    customer_id,
  } = body;

  const orderType = ['dine_in', 'delivery', 'pickup'].includes(type) ? type : 'dine_in';

  const staffInHouseOrder =
    actor.kind === 'staff' &&
    (orderType === 'dine_in' || orderType === 'pickup') &&
    actor.user &&
    actor.user.type !== 'customer' &&
    ['admin', 'cajero', 'mozo', 'cocina', 'bar'].includes(String(actor.user.role || ''));

  const restaurant = tx.queryOne('SELECT * FROM restaurants LIMIT 1');
  const seq = tx.queryOne('SELECT current_number FROM order_sequence WHERE id = 1') || { current_number: 0 };
  const orderNumber = Number(seq.current_number || 0) + 1;
  tx.run('UPDATE order_sequence SET current_number = ? WHERE id = 1', [orderNumber]);

  let subtotal = 0;
  const orderItems = items.map((item) => {
    const product = tx.queryOne('SELECT * FROM products WHERE id = ?', [item.product_id]);
    if (!product) throw new Error(`Producto no encontrado: ${item.product_id}`);
    const qty = Number(item.quantity || 0);
    if (qty <= 0) throw new Error(`Cantidad inválida para ${product.name}`);
    const requiresStock = product.process_type === 'non_transformed';
    if (requiresStock) {
      const whSum = tx.queryOne(
        'SELECT COALESCE(SUM(quantity), 0) as total FROM inventory_warehouse_stocks WHERE product_id = ?',
        [product.id]
      );
      const available = Math.max(Number(product.stock || 0), Number(whSum?.total || 0));
      if (available < qty && !staffInHouseOrder) {
        throw new Error(`Stock insuficiente para ${product.name}`);
      }
    }
    const productModifierId = String(product.modifier_id || '').trim();
    let modifierName = '';
    let modifierOption = '';
    if (productModifierId) {
      const modifier = tx.queryOne('SELECT * FROM modifiers WHERE id = ?', [productModifierId]);
      if (modifier) {
        const requestedModifierId = String(item.modifier_id || '').trim();
        const requestedOption = String(item.modifier_option || '').trim();
        const availableOptions = tx
          .queryAll('SELECT option_name FROM modifier_options WHERE modifier_id = ?', [productModifierId])
          .map((row) => String(row.option_name || '').trim())
          .filter(Boolean);
        const isRequired = Number(modifier.required || 0) === 1;

        if (requestedModifierId && requestedModifierId !== productModifierId) {
          throw new Error(`El producto ${product.name} tiene un modificador inválido`);
        }
        if (isRequired && !requestedOption) {
          throw new Error(`El producto ${product.name} requiere seleccionar ${modifier.name}`);
        }
        if (requestedOption) {
          if (availableOptions.length > 0 && !availableOptions.includes(requestedOption)) {
            throw new Error(`La opción "${requestedOption}" no es válida para ${modifier.name}`);
          }
          modifierName = String(modifier.name || '').trim();
          modifierOption = requestedOption;
        }
      }
    }
    const unitPrice = Number(product.price || 0) + Number(item.price_modifier || 0);
    const itemNote = String(item.notes || '').trim();
    if (Number(product.note_required || 0) === 1 && !itemNote) {
      throw new Error(`El producto ${product.name} requiere una nota obligatoria`);
    }
    const itemSubtotal = unitPrice * qty;
    subtotal += itemSubtotal;
    const composedNotes = [itemNote, modifierName && modifierOption ? `${modifierName}: ${modifierOption}` : ''].filter(Boolean).join(' | ');
    return {
      id: uuidv4(),
      order_id: orderId,
      product_id: product.id,
      product_name: product.name,
      variant_name: item.variant_name || '',
      quantity: qty,
      unit_price: unitPrice,
      subtotal: itemSubtotal,
      notes: composedNotes,
      process_type: product.process_type,
    };
  });

  const tax = 0;
  const discountAmount = Math.max(0, Number(discount || 0));
  const deliveryFee = orderType === 'delivery' ? Number(restaurant?.delivery_fee || 0) : 0;
  const total = Math.max(0, subtotal - discountAmount + deliveryFee);

  let customerId = null;
  if (actor.kind === 'customer' && actor.user) {
    customerId = actor.user.id;
  } else if (actor.kind === 'staff') {
    customerId = String(customer_id || '').trim() || null;
  } else if (actor.kind === 'public_customer' && actor.customerId) {
    customerId = String(actor.customerId).trim() || null;
  }
  if (customerId) {
    const customer = tx.queryOne('SELECT id, name FROM customers WHERE id = ?', [customerId]);
    if (!customer) throw new Error('Cliente no encontrado para el pedido');
  }
  const customerFromDb = customerId ? tx.queryOne('SELECT id, name FROM customers WHERE id = ?', [customerId]) : null;

  let custName = '';
  if (actor.kind === 'customer' && actor.user) {
    custName = actor.user.name || '';
  } else if (actor.kind === 'staff') {
    custName = customerFromDb?.name || customer_name || '';
  } else if (actor.kind === 'public_qr') {
    custName = String(customer_name || '').trim() || `Mesa ${String(table_number || '').trim()}`;
  } else if (actor.kind === 'public_customer') {
    custName = customerFromDb?.name || String(customer_name || '').trim() || 'Cliente';
  }

  const saleDocumentNumber = `001-${String(orderNumber).padStart(8, '0')}`;
  const requestedPaymentMethod = String(payment_method || '').trim().toLowerCase();
  const paymentMethod = normalizePaymentMethod(requestedPaymentMethod || 'efectivo', { allowOnline: true, fallback: 'efectivo' });

  let createdByUserId = '';
  let createdByUserName = '';
  if (actor.kind === 'customer' && actor.user) {
    createdByUserId = actor.user.id || '';
    createdByUserName = actor.user.full_name || actor.user.username || actor.user.name || '';
  } else if (actor.kind === 'staff' && actor.user) {
    createdByUserId = actor.user.id || '';
    createdByUserName = actor.user.full_name || actor.user.username || '';
  } else if (actor.kind === 'public_qr') {
    createdByUserId = '';
    createdByUserName = 'Auto-pedido (QR)';
  } else if (actor.kind === 'public_customer') {
    createdByUserId = '';
    createdByUserName = 'Auto-pedido (cliente)';
  }

  tx.run(
    `INSERT INTO orders (
      id, order_number, customer_id, customer_name, restaurant_id, type, subtotal, tax, discount, delivery_fee, total,
      payment_method, table_number, delivery_address, notes, sale_document_type, sale_document_number, created_by_user_id, created_by_user_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      orderNumber,
      customerId,
      custName,
      restaurant?.id,
      orderType,
      subtotal,
      tax,
      discountAmount,
      deliveryFee,
      total,
      paymentMethod,
      table_number || '',
      delivery_address || '',
      notes || '',
      'nota_venta',
      saleDocumentNumber,
      createdByUserId,
      createdByUserName,
    ]
  );

  orderItems.forEach((item) => {
    if (item.process_type === 'non_transformed') {
      const stockRows = tx.queryAll(
        'SELECT id, quantity FROM inventory_warehouse_stocks WHERE product_id = ? ORDER BY quantity DESC',
        [item.product_id]
      );
      let pending = Number(item.quantity || 0);
      for (const row of stockRows) {
        if (pending <= 0) break;
        const available = Number(row.quantity || 0);
        if (available <= 0) continue;
        const consume = Math.min(available, pending);
        tx.run(
          'UPDATE inventory_warehouse_stocks SET quantity = ?, updated_at = datetime(\'now\') WHERE id = ?',
          [available - consume, row.id]
        );
        pending -= consume;
      }
      if (pending > 0 && !staffInHouseOrder) {
        throw new Error(`No hay stock suficiente en almacenes para ${item.product_name}`);
      }
      const newSum = tx.queryOne(
        'SELECT COALESCE(SUM(quantity), 0) as total FROM inventory_warehouse_stocks WHERE product_id = ?',
        [item.product_id]
      );
      tx.run('UPDATE products SET stock = ?, updated_at = datetime(\'now\') WHERE id = ?', [Number(newSum?.total || 0), item.product_id]);
    }
    tx.run(
      'INSERT INTO order_items (id, order_id, product_id, product_name, variant_name, quantity, unit_price, subtotal, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [item.id, item.order_id, item.product_id, item.product_name, item.variant_name, item.quantity, item.unit_price, item.subtotal, item.notes]
    );
  });

  return { orderId };
}

function actorFromRequest(req) {
  if (req.user?.type === 'customer') return { kind: 'customer', user: req.user };
  return { kind: 'staff', user: req.user };
}

module.exports = {
  getOrderWithItems,
  createOrderInTransaction,
  actorFromRequest,
};
