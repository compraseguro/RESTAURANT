/**
 * Referencia de campos del comprobante electrónico y del bot SUNAT (texto orientativo).
 * Los que no tienen campo en el panel se generan en caja o en el servidor/bot al emitir.
 */
const GROUPS = [
  {
    title: 'Emisor (contribuyente)',
    items: [
      ['RUC', 'identifica al contribuyente ante la SUNAT'],
      ['Razón social', 'nombre legal para el comprobante'],
      ['Nombre comercial', 'nombre visible opcional'],
      ['Dirección fiscal', 'ubicación legal del negocio'],
      ['Ubigeo', 'código geográfico exigido por SUNAT'],
      ['Departamento / provincia / distrito', 'detalle de ubicación'],
      ['Código de establecimiento', 'identifica el local emisor (suele configurarse en el entorno del bot o en resoluciones SUNAT)'],
    ],
  },
  {
    title: 'Credenciales y certificado (típicamente en el .env del bot Python)',
    items: [
      ['Usuario SOL', 'permite autenticarse en SUNAT'],
      ['Clave SOL', 'permite enviar comprobantes y validar acceso'],
      ['Certificado digital .pfx o .p12', 'contiene la firma digital para validar legalmente los comprobantes'],
      ['Contraseña del certificado', 'permite usar el certificado para firmar'],
    ],
  },
  {
    title: 'Comprobante y numeración',
    items: [
      ['Tipo de comprobante', 'define si es factura o boleta'],
      ['Serie del comprobante', 'identifica el tipo de documento emitido como F001 o B001'],
      ['Correlativo', 'número secuencial del comprobante'],
      ['Moneda', 'define la divisa usada como PEN'],
      ['IGV porcentaje', 'define el impuesto aplicado; normalmente 18% (también en «Mi empresa» / tasa del restaurante)'],
      ['Tipo de operación', 'define si la venta es gravada, exonerada u otra'],
      ['Fecha de emisión', 'indica cuándo se genera el comprobante'],
      ['Hora de emisión', 'precisa el momento exacto de emisión'],
      ['Forma de pago', 'indica si es contado o crédito'],
    ],
  },
  {
    title: 'Cliente (en caja / facturación al cobrar)',
    items: [
      ['Tipo de documento del cliente', 'define si es DNI o RUC'],
      ['Número de documento del cliente', 'identifica al comprador'],
      ['Nombre o razón social del cliente', 'identifica al receptor del comprobante'],
      ['Dirección del cliente', 'ubicación del receptor en facturas'],
    ],
  },
  {
    title: 'Detalle por ítem y totales (por cada venta)',
    items: [
      ['Descripción del producto o servicio', 'detalle de lo vendido'],
      ['Cantidad', 'número de unidades vendidas'],
      ['Precio unitario', 'valor por unidad'],
      ['Tipo de IGV por ítem', 'indica si aplica impuesto o está exonerado'],
      ['Total por ítem', 'importe por producto'],
      ['Subtotal', 'suma de valores antes de impuestos'],
      ['Monto de IGV', 'impuesto calculado'],
      ['Total final', 'importe total a pagar'],
    ],
  },
  {
    title: 'Envío electrónico y conexión al bot',
    items: [
      ['Tipo de envío', 'define si se envía directo o mediante OSE hacia la SUNAT'],
      ['URL del servicio', 'dirección del endpoint para envío electrónico (en este sistema: API HTTP del bot)'],
      ['Modo de operación', 'define si es pruebas o producción (en el bot: ambiente SUNAT beta / producción)'],
      ['Reintentos automáticos', 'permite reenviar si falla el envío'],
      ['Validación de datos', 'evita errores antes de enviar'],
      ['Control de duplicados', 'evita emitir comprobantes repetidos'],
    ],
  },
  {
    title: 'Archivos, respuesta SUNAT y trazabilidad',
    items: [
      ['XML generado', 'archivo estructurado del comprobante'],
      ['XML firmado', 'archivo con firma digital válida'],
      ['CDR', 'respuesta de aceptación o rechazo de SUNAT'],
      ['PDF representativo', 'documento visual para el cliente'],
      ['Logs del sistema', 'registro de errores y operaciones'],
      ['Almacenamiento de archivos', 'guarda XML, CDR y PDF'],
    ],
  },
  {
    title: 'Seguridad e identificación en el software',
    items: [
      ['Encriptación de certificado', 'protege la firma digital'],
      ['Encriptación de credenciales', 'protege accesos del cliente'],
      ['Identificación de cliente interno', 'permite manejar múltiples empresas dentro del sistema'],
      ['Secreto HTTP (X-EFACT-SECRET)', 'autentica las peticiones del servidor Node al bot'],
    ],
  },
];

export default function BillingSunatLexiconPanel({ className = '' }) {
  return (
    <details className={`rounded-lg border border-slate-200 bg-white/80 ${className}`}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-800">
        Glosario: datos del comprobante y del bot (SUNAT)
      </summary>
      <div className="px-4 pb-4 pt-0 max-h-[min(70vh,520px)] overflow-y-auto border-t border-slate-100">
        <p className="text-xs text-slate-500 py-3">
          Lista de referencia. En el formulario superior se configuran emisor, series, contingencia y conexión al bot; el
          resto se completa al emitir desde caja o en el motor del bot.
        </p>
        <div className="space-y-4 text-sm text-slate-700">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h4 className="font-semibold text-slate-800 text-xs uppercase tracking-wide">{g.title}</h4>
              <ul className="mt-1.5 space-y-1 list-none pl-0">
                {g.items.map(([name, desc]) => (
                  <li key={name} className="pl-0 border-l-2 border-slate-200 pl-2">
                    <span className="font-medium text-slate-900">{name}</span>
                    <span className="text-slate-600"> ({desc})</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
