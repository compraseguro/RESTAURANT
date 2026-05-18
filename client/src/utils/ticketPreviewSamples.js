import {
  buildPrecuentaPlainText,
  buildPedidoMesaTicketPlainText,
  buildNotaVentaPlainText,
  buildBoletaFacturaPlainText,
} from './ticketPlainText';

/** Tipos de ticket configurables en Mi Restaurante (misma salida que impresión). */
export const TICKET_PREVIEW_TYPES = [
  { id: 'precuenta', label: 'Precuenta', hint: 'Caja · mesa / delivery antes de cobrar' },
  { id: 'pedido', label: 'Pedido', hint: 'Comanda cocina / bar (mesa)' },
  { id: 'delivery', label: 'Delivery', hint: 'Comanda cocina / bar (domicilio)' },
  { id: 'nota_venta', label: 'Nota de venta', hint: 'Caja · sin SUNAT' },
  { id: 'boleta', label: 'Boleta', hint: 'Comprobante electrónico' },
  { id: 'factura', label: 'Factura', hint: 'Comprobante electrónico' },
];

/** Misma forma que {@link groupItemsByProductNameForBill}. */
export const SAMPLE_GROUPED_BILL_ROWS = [
  { name: 'Lomo saltado', qty: 2, subtotal: 56, unitPrice: 28 },
  { name: 'Chicha', qty: 1, subtotal: 8, unitPrice: 8 },
];

const SAMPLE_KITCHEN_ITEMS = [
  { product_name: 'Lomo saltado', variant_name: '', quantity: 2, notes: 'Sin cebolla' },
  { product_name: 'Chicha', variant_name: '1/2 L', quantity: 1, notes: '' },
];

const SAMPLE_SUBTOTAL = 64;

function ticketWidthMm(profile) {
  return Number(profile?.ticket?.paper_width_mm) === 58 ? 58 : 80;
}

/**
 * Texto de vista previa = mismos builders que POS / cocina.
 * @param {'precuenta'|'pedido'|'delivery'|'nota_venta'|'boleta'|'factura'} type
 */
export function buildTicketPreviewPlainText(type, { restaurant = {}, profile = {}, formatCurrencyFn }) {
  const mergedRestaurant = { ...restaurant, profile };
  const widthMm = ticketWidthMm(profile);
  const printedAt = new Date();
  const rows = SAMPLE_GROUPED_BILL_ROWS;

  switch (type) {
    case 'pedido':
      return buildPedidoMesaTicketPlainText({
        tableLabel: '12',
        orderNumber: '1042',
        takeout: false,
        items: SAMPLE_KITCHEN_ITEMS,
        widthMm,
        printedAt,
        orderType: 'dine_in',
      });
    case 'delivery':
      return buildPedidoMesaTicketPlainText({
        tableLabel: '',
        orderNumber: 'D-88',
        takeout: false,
        items: SAMPLE_KITCHEN_ITEMS,
        widthMm,
        printedAt,
        orderType: 'delivery',
      });
    case 'nota_venta':
      return buildNotaVentaPlainText({
        restaurant: mergedRestaurant,
        docLine: 'NV-00042',
        tableName: '12',
        customerLines: [
          'Nombre: Juan Pérez',
          'DNI / RUC: 12345678',
          'Tel: 999 888 777',
        ],
        groupedRows: rows,
        formatCurrencyFn,
        subtotal: SAMPLE_SUBTOTAL,
        total: SAMPLE_SUBTOTAL,
        discount: 0,
        widthMm,
        printedAt,
        paymentMethod: 'yape',
      });
    case 'boleta':
      return buildBoletaFacturaPlainText({
        restaurant: mergedRestaurant,
        doc: {
          doc_type: 'boleta',
          full_number: 'B001-00001234',
          hash_code: 'a1b2c3d4e5f6',
          sunat_description: 'La Boleta de Venta ha sido aceptada',
        },
        groupedRows: rows,
        formatCurrencyFn,
        subtotal: 54.24,
        tax: 9.76,
        total: SAMPLE_SUBTOTAL,
        discount: 0,
        customer: { name: 'Juan Pérez', doc_number: '12345678' },
        widthMm,
        printedAt,
        paymentMethod: 'efectivo',
      });
    case 'factura':
      return buildBoletaFacturaPlainText({
        restaurant: mergedRestaurant,
        doc: {
          doc_type: 'factura',
          full_number: 'F001-00000089',
          hash_code: 'f9e8d7c6b5a4',
          sunat_description: 'La Factura ha sido aceptada',
        },
        groupedRows: rows,
        formatCurrencyFn,
        subtotal: 54.24,
        tax: 9.76,
        total: SAMPLE_SUBTOTAL,
        discount: 0,
        customer: { name: 'Empresa Demo SAC', doc_number: '20123456789' },
        widthMm,
        printedAt,
        paymentMethod: 'tarjeta',
      });
    case 'precuenta':
    default:
      return buildPrecuentaPlainText({
        restaurant: mergedRestaurant,
        tableName: '12',
        mozoName: 'Demo',
        customerLines: [],
        groupedRows: rows,
        formatCurrencyFn,
        subtotal: SAMPLE_SUBTOTAL,
        discount: 0,
        payableTotal: SAMPLE_SUBTOTAL,
        widthMm,
        printedAt,
      });
  }
}
