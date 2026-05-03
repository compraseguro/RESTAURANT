# Print-agent (Resto-FADEY)

Impresión **térmica silenciosa** (ESC/POS): el SaaS envía JSON al programa local y este imprime **sin Ctrl+P**.

## Instalación

```bash
cd local-print-agent
npm install
npm start
```

Por defecto: `http://127.0.0.1:3001` — `POST /print`, `GET /printers`, `GET /health`.

Impresoras **USB en Windows** (RAW): opcionalmente `npm install printer` (requiere herramientas de compilación). En Linux/macOS suele bastar CUPS (`lp -o raw`).

## Variables de entorno

| Variable | Ejemplo | Descripción |
|----------|---------|-------------|
| `PORT` | `3001` | Puerto HTTP |
| `BIND_HOST` | `0.0.0.0` | `127.0.0.1` solo local; `0.0.0.0` para que tablets/Android en la misma LAN llamen al PC |

## POST `/print`

Cuerpo JSON (nuevo):

```json
{
  "area": "cocina",
  "ticket": "Texto del ticket…",
  "printer": "XP-80C",
  "ip_address": "192.168.1.120",
  "port": 9100,
  "copies": 1,
  "mode": "lan"
}
```

- **Red (RAW TCP)**: `ip_address` + `port` (típico 9100). `mode` opcional; si hay IP se usa LAN.
- **USB / cola del sistema**: `printer` con el nombre exacto que lista `GET /printers`, o `mode: "usb"`.
- Compatibilidad **legado**: `text` en lugar de `ticket`.

## Android / tablet

1. Ejecute el agente en un PC del local con `BIND_HOST=0.0.0.0`.
2. En el firewall de Windows permita el puerto (ej. 3001).
3. En la app web, en **Configuración → Agente de impresión**, use la URL `http://<IP-LAN-del-PC>:3001` (no `127.0.0.1` en la tablet).

## Áreas (cocina / bar / caja)

El campo `area` es informativo en el log; la ruta real (qué IP o qué nombre USB) la define el frontend según la estación guardada en el servidor.
