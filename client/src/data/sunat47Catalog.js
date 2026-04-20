/**
 * Valores por defecto de `billing_panel_json` y flags que devuelve el API sin secretos.
 * El formulario de facturación manual solo expone los campos que el usuario debe llenar.
 */

export function defaultBillingPanelPresence() {
  return { sol_usuario: false, sol_clave: false, cert_pfx_password: false };
}

/** Estado en cliente: SOL/claves no vienen del GET hasta que el usuario escribe. */
export function defaultBillingPanel() {
  return {
    cod_establecimiento: '0000',
    cert_pfx_path: '',
    tipo_envio: 'directo',
    ose_url: '',
    sunat_modo: 'beta',
    forma_pago_default: 'contado',
    operacion_default: 'gravada',
    validacion_estricta: 1,
    control_duplicados: 1,
    log_operaciones: 1,
    almacenamiento_activo: 1,
    nota_encriptacion_cert: '',
    nota_encriptacion_cred: '',
    cliente_interno_id: '',
    default_invoice_lines: 'detallado',
    correlativo_inicial_factura: 1,
    correlativo_inicial_boleta: 1,
  };
}
