# Deploy rapido (GitHub + Vercel + Render)

## 1) Que se sube a GitHub
- Codigo fuente de `client/`, `server/`, `scripts/`, `package.json`.
- No subir secretos ni archivos locales (`.env`, `uploads/`, `*.db`, `node_modules/`).

## 2) Variables de entorno
- Backend (Render): configurar `.env` segun `/.env.example`.
- Frontend (Vercel): crear `VITE_API_URL` con el dominio del backend, sin `/api` final.
  - Ejemplo: `https://resto-fadey-api.onrender.com`

## 3) Configuracion de Vercel
- Root Directory: `client`
- Build Command: `npm run build`
- Output Directory: `dist`

## 4) Flujo recomendado de push
```bash
git add .
git commit -m "chore: deploy update"
git push origin main
```

## 5) Verificacion final
- En Network del navegador, login debe llamar a:
`https://<tu-backend-render>/api/auth/login`
- Si llama a `...vercel.app/api/...`, falta revisar `VITE_API_URL` o el commit desplegado.

## 6) Cartas del menu (imagenes) — no van en Git
- Las PNG/JPG/PDF de `client/public/cartas/` estan en `.gitignore`: el **push solo lleva codigo**.
- **Pruebas en produccion (recomendado):** entra como **admin** → **Cartas y QR (config.)** → **Subir** por cada carta o pega URL. Los archivos quedan en el backend (`/uploads/...` en Render).
- **Archivos estaticos en el front:** si quieres servirlas desde el mismo dominio del front, copia las imagenes en `client/public/cartas/` **en la maquina que construye** (o en tu CI) antes de `npm run build`, sin commitearlas; en Vercel eso implica subirlas por otro canal o usar almacenamiento externo/CDN.
- Tras desplegar codigo nuevo: `git push origin main` (Vercel y Render suelen auto-desplegar).
