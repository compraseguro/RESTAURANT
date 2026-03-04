# Baseline QA y Matriz de Riesgo

## Matriz de riesgo técnico

- **Crítico**
  - Integridad de datos en pedidos, stock y caja con flujos multi-paso.
  - Seguridad de autenticación y configuración de despliegue.
  - Consistencia de reportes financieros.
- **Alto**
  - Permisos por rol y ownership en endpoints operativos.
  - Módulos que no persisten en backend (reservas, créditos, descuentos, ofertas, combos/modificadores).
  - Acciones avanzadas de mesas sin implementación real.
- **Medio**
  - Inconsistencias de fecha/hora entre pantallas administrativas.
  - Observabilidad limitada (logs, health/readiness, trazabilidad).
- **Bajo**
  - UX textual y estados de controles secundarios.

## Criterios de aceptación por módulo

- **Ventas**
  - Edición de pago/comprobante persiste y se refleja en reportes.
  - Anulación no rompe consistencia financiera.
- **POS/Caja**
  - Apertura/cierre de caja confiable por rol.
  - Cobro de mesa no deja estados parciales.
- **Delivery**
  - Asignaciones y transiciones válidas por rol.
  - Entregas del día y detalle de pedido correctos.
- **Cocina**
  - Solo roles permitidos ven cola de cocina.
  - Estados de pedido respetan flujo.
- **Reportes**
  - Misma semántica financiera en todas las pantallas.
  - Filtros de fecha consistentes.
- **Inventario**
  - Recepciones y ajustes con validación e idempotencia.
  - Movimientos quedan auditables.

## Checklist de regresión rápida

- [ ] Login staff/customer y expiración de token.
- [ ] Crear pedido mesa, cambiar estado, cobrar y emitir comprobante.
- [ ] Abrir/cerrar caja, registrar ingreso/egreso/nota.
- [ ] Asignar delivery y completar ruta de estados.
- [ ] Descargar Excel de ventas (individual y total filtrado).
- [ ] Ajustes de inventario y recepción de compras.
- [ ] Anulación de venta y actualización de indicadores/reportes.
