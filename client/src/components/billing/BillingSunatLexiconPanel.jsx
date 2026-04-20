/**
 * Lista completa de referencia SUNAT / comprobante / bot (47 ítems según definición del negocio).
 * Los que no tienen campo en el panel se generan en caja o en el servidor/bot al emitir.
 */
const GROUPS = [
  {
    title: 'Emisor y establecimiento',
    items: [
      ['RUC', 'identifica al contribuyente ante la SUNAT'],
      ['Razón social', 'nombre legal para el comprobante'],
      ['Nombre comercial', 'nombre visible opcional'],
      ['Dirección fiscal', 'ubicación legal del negocio'],
      ['Ubigeo', 'código geográfico exigido por SUNAT'],
      ['Departamento/provincia/distrito', 'detalle de ubicación'],
      ['Código de establecimiento', 'identifica el local emisor'],
    ],
  },
  {
    title: 'Credenciales y certificado (típicamente en el .env del bot)',
    items: [
      ['Usuario SOL', 'permite autenticarse en SUNAT'],
      ['Clave SOL', 'permite enviar comprobantes y validar acceso'],
      ['Certificado digital .pfx o .p12', 'contiene la firma digital para validar legalmente los comprobantes'],
      ['Contraseña del certificado', 'permite usar el certificado para firmar'],
    ],
  },
  {
    title: 'Comprobante, numeración e impuestos generales',
    items: [
      ['Tipo de comprobante', 'define si es factura o boleta'],
      ['Serie del comprobante', 'identifica el tipo de documento emitido como F001 o B001'],
      ['Correlativo', 'número secuencial del comprobante'],
      ['Moneda', 'define la divisa usada como PEN'],
      ['IGV porcentaje', 'define el impuesto aplicado normalmente 18%'],
      ['Tipo de operación', 'define si la venta es gravada, exonerada u otra'],
      ['Fecha de emisión', 'indica cuándo se genera el comprobante'],
      ['Hora de emisión', 'precisa el momento exacto de emisión'],
      ['Forma de pago', 'indica si es contado o crédito'],
    ],
  },
  {
    title: 'Cliente',
    items: [
      ['Tipo de documento del cliente', 'define si es DNI o RUC'],
      ['Número de documento del cliente', 'identifica al comprador'],
      ['Nombre o razón social del cliente', 'identifica al receptor del comprobante'],
      ['Dirección del cliente', 'ubicación del receptor en facturas'],
    ],
  },
  {
    title: 'Detalle por ítem y totales',
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
    title: 'Envío electrónico',
    items: [
      ['Tipo de envío', 'define si se envía directo o mediante OSE hacia la SUNAT'],
      ['URL del servicio', 'dirección del endpoint para envío electrónico'],
      ['Modo de operación', 'define si es pruebas o producción'],
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
    ],
  },
  {
    title: 'Operación del sistema',
    items: [
      ['Reintentos automáticos', 'permite reenviar si falla el envío'],
      ['Validación de datos', 'evita errores antes de enviar'],
      ['Control de duplicados', 'evita emitir comprobantes repetidos'],
      ['Almacenamiento de archivos', 'guarda XML, CDR y PDF'],
    ],
  },
  {
    title: 'Seguridad e identificación en el software',
    items: [
      ['Encriptación de certificado', 'protege la firma digital'],
      ['Encriptación de credenciales', 'protege accesos del cliente'],
      ['Identificación de cliente interno', 'permite manejar múltiples empresas dentro del sistema'],
    ],
  },
];

const ITEM_COUNT = GROUPS.reduce((n, g) => n + g.items.length, 0);

export default function BillingSunatLexiconPanel({ className = '' }) {
  return (
    <details className={`rounded-lg border border-slate-200 bg-white/80 ${className}`}>
      <summary className="cursor-pointer select-none px-5 py-4 text-sm font-semibold text-slate-800 leading-snug">
        Glosario: datos del comprobante y del bot (SUNAT) — {ITEM_COUNT} datos
      </summary>
      <div className="px-5 pb-6 pt-1 max-h-[min(70vh,560px)] overflow-y-auto border-t border-slate-100">
        <p className="text-xs text-slate-500 py-4 leading-relaxed max-w-prose">
          Lista de referencia con la función de cada dato entre paréntesis. En el formulario superior se configuran emisor,
          series, contingencia y conexión al bot; el resto se completa al emitir desde caja o en el motor del bot.
        </p>
        <div className="space-y-10 text-sm text-slate-700">
          {GROUPS.map((g) => (
            <div key={g.title} className="scroll-mt-2">
              <h4 className="font-semibold text-slate-800 text-xs uppercase tracking-wide mb-4 pb-2 border-b border-slate-200">
                {g.title}
              </h4>
              <ul className="list-none pl-0 space-y-0">
                {g.items.map(([name, desc]) => (
                  <li
                    key={name}
                    className="border-l-2 border-slate-300 pl-4 pr-2 py-3.5 mb-3 last:mb-0 rounded-r-md bg-slate-50/60"
                  >
                    <div className="font-medium text-slate-900 leading-snug">{name}</div>
                    <div className="text-slate-600 text-[13px] mt-2.5 ml-0.5 leading-relaxed">
                      ({desc})
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-6 pt-4 border-t border-slate-100 leading-relaxed">
          Nota técnica de esta aplicación (no forma parte de la lista SUNAT anterior): el secreto HTTP{' '}
          <code className="text-[10px] bg-slate-100 px-1 rounded">X-EFACT-SECRET</code> autentica las peticiones del servidor
          Node al bot Python.
        </p>
      </div>
    </details>
  );
}
