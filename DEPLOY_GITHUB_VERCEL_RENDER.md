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
