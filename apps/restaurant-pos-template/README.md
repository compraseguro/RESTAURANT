# Plantilla POS Restaurante (web service independiente)

Cada restaurante despliega su propia copia del código en la raíz del monorepo (`server/` + `client/`).

## Aislamiento

- Base de datos SQLite local (`DB_PATH`)
- Usuarios y operaciones propias
- Sin acceso a datos de otros restaurantes

## Sincronización central

Configure en `.env` del despliegue:

```
CENTRAL_PLATFORM_URL=https://restofadey.pe
API_SECRET_KEY=<mismo secreto que la plataforma central>
CLIENT_ID=<uuid cliente>
RESTAURANT_ID=<uuid restaurante>
WEBSERVICE_ID=<id despliegue>
LICENSE_KEY=<clave licencia>
NEXT_PUBLIC_API_URL=https://su-api.onrender.com
```

Eventos que se envían automáticamente: login, comprobante de pago, cambio de plan.

Ver `ARCHITECTURE_SAAS.md` en la raíz del repositorio.
