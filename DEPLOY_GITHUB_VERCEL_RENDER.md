# Desplegar con GitHub + Render (API) + Vercel (web)

Flujo: tu código vive en **GitHub**; cada `git push` a la rama conectada vuelve a construir y publicar **Render** (backend) y **Vercel** (frontend React).

---

## 0) Requisitos previos

- Repositorio en GitHub con el código ya subido (`git push`).
- Cuentas en [render.com](https://render.com) y [vercel.com](https://vercel.com) (pueden iniciar sesión con GitHub).

---

## 1) Backend en Render (Node / Express)

1. En Render: **New** → **Web Service**.
2. **Connect** tu repositorio de GitHub y elige el repo (ej. `RESTAURANT`).
3. Configuración típica:
   - **Name:** el que quieras (ej. `resto-api`).
   - **Region:** la más cercana a tus usuarios.
   - **Branch:** `main` (o la que uses).
   - **Root directory:** déjalo **vacío** (raíz del repo; ahí está `package.json` y `server/`).
   - **Runtime:** Node.
   - **Build command:** `npm install && npm run build`  
     (el script `build` del repo instala dependencias en `client` **incluyendo devDependencies** para que exista `vite` en Render, donde `NODE_ENV=production` suele omitirlas.)
   - **Start command:** `npm start`  
     (equivale a `node server/index.js` según el `package.json` del proyecto).
4. Elige plan (Free tiene “sleep” tras inactividad; el primer request puede tardar).
5. **Environment** (Variables) — mínimo obligatorio:

   | Variable        | Valor (ejemplo) |
   |----------------|------------------|
   | `JWT_SECRET`   | Una cadena larga y aleatoria (obligatoria; no uses la de ejemplo en producción). |
   | `CORS_ORIGIN`  | URL de tu front en Vercel, **sin barra final**. Varias URLs separadas por coma:  
     `https://tu-app.vercel.app,http://localhost:5173` |
   | *(opcional)* `PORT` | Render suele inyectar `PORT` solo; no hace falta definirla salvo que tu plantilla lo exija. |

   | `MASTER_USERNAME` | Usuario del **administrador maestro** (primer acceso a `/master`). |
   | `MASTER_PASSWORD` | Contraseña del maestro (**cámbiala** en producción). |
   | `DB_PATH` | **Imprescindible** para no perder datos: ruta en un **disco persistente**. Ver sección **1b** abajo. |

   Opcionales (ver `/.env.example`):

   - `NODE_ENV` = `production`

### 1b) Que los datos no se borren en cada deploy (Render)

**Importante:** El código del proyecto **no borra** tu base al hacer `git push`. Lo que ocurre es que, en Render, el disco del contenedor es **efímero**: si `restaurant.db` no está en un **Disk** persistente, cada nuevo deploy arranca **sin** ese archivo y el servidor **crea otra base vacía** (parece un “reset”).

1. En el servicio web → **Disks** (Discos) → **Add disk**.
2. Montaje sugerido: **Mount path** = `/data`, tamaño según plan (p. ej. 1 GB).
3. **Environment** → variable **`DB_PATH`** = **`/data/restaurant.db`** (ruta absoluta, coincidente con el mount).
4. **Save** y luego **Manual Deploy** (o un push) para que arranque ya con el disco montado.

**Comprobar que quedó bien:** abre **Logs** del servicio al iniciar. Si falta el Disk o `DB_PATH`, verás un bloque **`[CRÍTICO] Riesgo de PERDER DATOS`**. Si está bien, verás **`DB_PATH parece volumen persistente`**.

El **reinicio completo** de datos del programa sigue siendo solo el que configures en **Configuración** del panel (no el deploy normal).

**Si ya perdiste datos:** no están en el deploy anterior del contenedor; la recuperación solo es posible si tenías **copia** del archivo `.db` o backup exportado desde el panel.

6. **Create Web Service**. Espera a que el deploy termine y copia la URL pública del servicio, por ejemplo:  
   `https://resto-api-xxxx.onrender.com`

7. **Probar API:** en el navegador abre  
   `https://TU-SERVICIO.onrender.com/api/healthz`  
   Debería responder JSON con `{ "ok": true }` (o similar).

---

## 2) Frontend en Vercel (React / Vite)

1. En Vercel: **Add New** → **Project** → **Import** el mismo repo de GitHub.
2. **Framework Preset:** Vite (o “Other” si no detecta bien).
3. **Root Directory:** `client`  
   (importante: el `package.json` del front está dentro de `client/`.)
4. **Build Command:** `npm run build`  
5. **Output Directory:** `dist`
6. **Environment Variables:**

   | Name            | Value |
   |-----------------|--------|
   | `VITE_API_URL`  | La URL base del backend **sin** `/api` al final.  
     Ejemplo: `https://resto-api-xxxx.onrender.com` |

7. **Deploy**. Al terminar, Vercel te da una URL tipo `https://tu-app.vercel.app`.

8. Vuelve a **Render** y en `CORS_ORIGIN` asegúrate de incluir exactamente esa URL de Vercel (con `https://`). Guarda y redeploy si hace falta.

---

## 3) Cada vez que cambies código

```bash
git add .
git commit -m "tu mensaje"
git push origin main
```

Render y Vercel (si están enlazados a `main`) desplegarán solos el nuevo commit.

---

## 4) Comprobar que todo apunta bien

- Abre el sitio de Vercel, inicia sesión en la app.
- En las herramientas de desarrollador → **Network**, las peticiones a la API deben ir a  
  `https://TU-SERVICIO.onrender.com/api/...`
- Si ves llamadas a `https://....vercel.app/api/...` y fallan, falta o está mal `VITE_API_URL` en Vercel, o el despliegue no incluye el último commit.

---

## 5) Qué no subir a GitHub

- `.env` con secretos reales (solo `.env.example` como plantilla).
- `uploads/`, `*.db`, `node_modules/`.
- Imágenes de cartas en `client/public/cartas/` (están en `.gitignore`); súbelas desde **Admin → Cartas y QR → Subir** o colócalas en el servidor según la sección 6 antigua del historial del doc.

---

## 6) Cartas del menú (imágenes) — no van en Git

- Las PNG/JPG/PDF de `client/public/cartas/` están en `.gitignore`: el **push solo lleva código**.
- **En producción (recomendado):** admin → **Cartas y QR (config.)** → **Subir** o URL. Los archivos quedan en el backend (`/uploads/...` en Render).
- **Estáticos solo en el front:** copiar imágenes en `client/public/cartas/` en el entorno que ejecuta el build (sin commitearlas) o usar CDN.

---

## Notas útiles

- **Dominio propio:** en Vercel y en Render puedes añadir dominios personalizados; actualiza `CORS_ORIGIN` con las URLs definitivas.
- **Base de datos en Render:** sin disco persistente, el archivo SQLite puede perderse al redeploy; para producción serio, valorar disco en Render o base gestionada.
