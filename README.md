# Restaurant Platform

Sistema integral de restaurante con módulos de administración, POS/caja, cocina, delivery, clientes e inventario.

## Requisitos

- Node.js 18+ (recomendado 20+)
- npm 9+
- Variables de entorno:
  - `JWT_SECRET` (obligatoria)
  - `PORT` (opcional, por defecto `3001`)
  - `CORS_ORIGIN` (opcional, lista CSV de orígenes permitidos)

## Desarrollo

```bash
npm install
cd client && npm install
cd ..
npm run dev
```

## Scripts principales

- `npm run dev`: backend + frontend
- `npm run server`: solo backend
- `npm run client`: solo frontend
- `npm run build`: build frontend
- `npm run smoke`: prueba rápida de salud del sistema
- `npm run verify:roles`: valida accesos clave por rol (admin/cajero/mozo y opcional cocina/delivery)
- `npm run preflight`: ejecuta `lint + smoke + verify:roles + build` antes de release
- `npm run lint`: validación de sintaxis JS backend/scripts
- `npm run reset-demo`: limpia catálogo para demo manual

## Operación profesional mínima

- Configurar `JWT_SECRET` único por entorno.
- Restringir `CORS_ORIGIN` a dominios reales de operación.
- Ejecutar `npm run smoke` en despliegues y reinicios.
- Ejecutar `npm run verify:roles` antes de liberar a producción.
- Revisar `BASELINE_QA_CHECKLIST.md` antes de liberar cambios.
- Seguir `RELEASE_CHECKLIST.md` y `OPERACION_BACKUP_RESTORE.md`.

## Endpoints operativos nuevos

- `GET /api/healthz`
- `GET /api/readyz`
- `POST /api/pos/checkout-table`
- `GET/POST/PUT/DELETE /api/admin-modules/*` (reservas, créditos, descuentos, ofertas, combos, modificadores)
# Resto-FADEY - Plataforma Completa para Restaurante

Plataforma web completa para gestión de restaurante con Panel Admin, Cocina, POS, Cliente y Delivery.

## Requisitos
- Node.js 18+
- npm

## Instalación

```bash
npm run install-all
```

## Ejecución (desarrollo)

```bash
npm run dev
```

Esto inicia el servidor backend en `http://localhost:3001` y el frontend en `http://localhost:5173`.

## Usuarios de prueba

| Rol | Usuario | Contraseña |
|-----|---------|------------|
| Admin | admin | admin123 |
| Cajero | cajero | cajero123 |
| Cocina | cocina | cocina123 |
| Delivery | delivery | delivery123 |
| Cliente | cliente@email.com | cliente123 |

## Módulos

- **Panel Admin**: Dashboard, productos, categorías, pedidos, reportes, usuarios, inventario, configuración
- **Panel Cocina**: Vista en tiempo real de pedidos, sonido de notificación, marcar como listo
- **POS / Caja**: Crear pedidos, métodos de pago (Efectivo, Yape, Plin, Tarjeta), boleta, cierre de caja
- **Plataforma Cliente**: Menú digital, carrito, seguimiento de pedido, historial
- **Delivery**: Panel de repartidor, estados de entrega, calificación

## Stack Tecnológico

- **Backend**: Node.js, Express, SQLite (better-sqlite3), Socket.IO
- **Frontend**: React 18, Vite, TailwindCSS, Recharts, React Router
- **Tiempo Real**: Socket.IO para pedidos y notificaciones
