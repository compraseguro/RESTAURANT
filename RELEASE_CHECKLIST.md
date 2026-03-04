# Release Checklist (Pre/Post Deploy)

## Pre-Deploy

- [ ] Definir variables de entorno desde `.env.example` (`JWT_SECRET` obligatorio).
- [ ] Configurar `CORS_ORIGIN` con dominios reales.
- [ ] Confirmar respaldo reciente de `restaurant.db`.
- [ ] Ejecutar `npm run lint`.
- [ ] Ejecutar `npm run smoke` en ambiente de staging.
- [ ] Validar roles con `npm run verify:roles` (staging).
- [ ] Construir frontend con `npm run build`.
- [ ] Verificar espacio en disco y permisos de carpeta `uploads`.

## Deploy

- [ ] Detener servicio actual de forma limpia.
- [ ] Respaldar `restaurant.db` antes de reemplazar versión.
- [ ] Desplegar nueva versión.
- [ ] Iniciar servicio y validar logs de arranque sin errores.

## Post-Deploy (10-15 minutos)

- [ ] `GET /api/healthz` responde `200`.
- [ ] `GET /api/readyz` responde `200`.
- [ ] Login `admin` y `cajero` correcto.
- [ ] Flujo mínimo POS: abrir caja -> cobrar -> cerrar caja.
- [ ] Ventas: ver, imprimir y exportar Excel.
- [ ] Delivery: entregas del día y detalle por pedido.
- [ ] Reportes diarios consistentes con ventas pagadas.
- [ ] Revisión de errores en logs (sin picos 4xx/5xx anómalos).

## Rollback (si falla)

- [ ] Detener versión nueva.
- [ ] Restaurar binarios previos.
- [ ] Restaurar `restaurant.db` desde backup de pre-deploy.
- [ ] Levantar servicio anterior.
- [ ] Re-ejecutar smoke y healthchecks.
