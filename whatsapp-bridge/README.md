# Puente WhatsApp (laptop)

Permite que el **servidor de la app** pida enviar el **PDF del comprobante** al **celular del cliente** usando **tu sesión de WhatsApp Web** en esta máquina.

## Cómo funciona

1. Este proceso se queda abierto en tu laptop y mantiene WhatsApp Web vinculado (QR la primera vez).
2. Cuando en caja se emite un comprobante con **PDF** y el cliente tiene **celular** guardado en el comprobante, el servidor Node hace un `POST` a esta app con la URL pública del PDF.
3. Esta app descarga el PDF y lo envía como **documento** al número en formato Perú (`51` + 9 dígitos).

## Requisitos

- Node 18+
- Misma red que pueda **descargar** el PDF: la URL debe ser **https** pública (típico: tu API en Render sirve `/uploads/...`).

## Instalación

```bash
cd whatsapp-bridge
copy .env.example .env
# Edite .env y ponga WHATSAPP_BRIDGE_SECRET (largo y aleatorio)
npm install
npm start
```

Escanee el QR con el teléfono (WhatsApp → Dispositivos vinculados).

## Conectar el servidor (Render) con tu laptop

Render **no** puede llamar a `http://127.0.0.1:9876` de tu PC. Opciones:

1. **[ngrok](https://ngrok.com/)** (o Cloudflare Tunnel): `ngrok http 9876` y en Render ponga `WHATSAPP_BRIDGE_URL=https://….ngrok-free.app` (sin barra final).
2. En `whatsapp-bridge/.env` use `WHATSAPP_BRIDGE_BIND=0.0.0.0` si el túnel lo requiere.
3. **Mismo secreto** en Render: `WHATSAPP_BRIDGE_SECRET` idéntico al del `.env` del puente.

En Render también defina **`PUBLIC_API_BASE_URL`** = la URL de su API **sin** `/api`, ej. `https://su-api.onrender.com`, para que los PDF bajo `/uploads/...` se conviertan en URL absoluta descargable.

## Seguridad

- No comparta `WHATSAPP_BRIDGE_SECRET` ni el URL del túnel.
- Quien tenga ambos puede pedir envíos a números arbitrarios; use secreto fuerte y cierre el túnel cuando no trabaje.
