# Resto Print Agent

Agente local **Node.js** que recibe trabajos por **Socket.IO** (`/print-agent`) e imprime en térmicas por **TCP 9100** o **ruta UNC** (Windows), sin usar el diálogo de impresión del navegador.

## Requisitos

- Node.js 18+
- La PC debe alcanzar la API del restaurante (HTTPS/WSS en producción).

## Instalación rápida

```bash
cd print-agent
npm install
npm start
```

Por defecto escucha en `http://127.0.0.1:37421` (salud y emparejamiento).

## Emparejamiento

1. En el panel web: **Configuración → Print Agent → Generar token**.
2. En la misma PC donde corre el agente: **Enviar a este equipo (localhost)**.

Alternativa manual: edite `data/config.json`:

```json
{
  "deviceId": "uuid-local-opcional",
  "apiBase": "https://su-api.com",
  "token": "JWT emitido por el panel",
  "bindings": {
    "cocina": { "transport": "tcp", "host": "192.168.1.50", "port": 9100 },
    "bar": { "transport": "tcp", "host": "192.168.1.51", "port": 9100 }
  }
}
```

## Inicio automático con Windows

1. Crear una tarea programada que ejecute `node ruta\a\print-agent\src\index.js` al iniciar sesión o al arranque.
2. O usar un wrapper `.cmd` que fije `cd` y ejecute `npm start`.

*Instalación totalmente silenciosa sin ningún clic no la impone Microsoft;* lo habitual en POS es un único despliegue aprobado por el restaurante y luego arranque automático.

## Cola y registros

- Cola persistente: **SQLite** `data/agent.sqlite` (tablas `queue_jobs`, `print_log`). Si existía `queue.json` de versiones anteriores, se migra una vez y se renombra.
- Registro texto: `data/agent.log`

## Seguridad

- El token es un JWT firmado por el mismo `JWT_SECRET` del servidor (`type: print_agent`).
- Renueve el token desde el panel si se filtra.

## API del servidor (caja / texto libre)

Desde el POS o integraciones (usuario cajero/admin autenticado):

`POST /api/print-agent/push-job` con cuerpo JSON, por ejemplo:

```json
{
  "area": "caja",
  "text": "Su ticket en texto plano…",
  "copies": 1,
  "cut": true,
  "openCashDrawer": false
}
```

Áreas válidas: `cocina`, `bar`, `caja`, `delivery`, `parrilla`.
