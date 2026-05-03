# Agente de impresión local (Resto-FADEY)

Permite **impresión térmica automática sin `window.print()`** cuando la API está en internet (Render, etc.) y las impresoras están en la **LAN del restaurante**.

## Requisitos

- Node.js 18+ en el PC o mini-servidor del local
- Impresora térmica en **modo RAW / Puerto 9100** (Epson, XPrinter, Rongta, Star, etc.)

## Instalación

```bash
cd local-print-agent
npm install
npm start
```

Por defecto escucha en `http://127.0.0.1:49710`. En **Configuración → Impresoras** active «Usar agente local» y use la misma URL (o defina `PORT` en `.env`).

## Variables de entorno

| Variable | Ejemplo | Descripción |
|----------|---------|-------------|
| `PORT` | `49710` | Puerto HTTP del agente |
| | | |

## API

- `GET /health` — comprobación
- `POST /print` — cuerpo JSON: `{ "ip_address": "192.168.1.50", "port": 9100, "text": "...", "copies": 1 }`

## USB / Bluetooth

Las impresoras solo por USB en Windows requieren compartir la impresora en red, usar un adaptador Ethernet, o ampliar este agente con controlador nativo (no incluido en esta versión).

## Android / tablet

Si la tablet está en la **misma WiFi** que la térmica, puede usar IP directa: el agente puede instalarse en un mini PC en el local; el navegador de la tablet envía trabajos a ese host (configurar firewall y URL del agente a la IP LAN del mini PC, no solo 127.0.0.1).
