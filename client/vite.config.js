import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const printServiceTarget = String(env.VITE_PRINT_SERVICE_DEV_PROXY || 'http://127.0.0.1:3049').replace(/\/$/, '');

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': 'http://localhost:3001',
        '/uploads': 'http://localhost:3001',
        /** Opcional: mismo origen que Vite para POST al microservicio local (CORS/PNA en algunos navegadores). */
        '/local-print-service': {
          target: printServiceTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/local-print-service/, '') || '/',
        },
        '/socket.io': {
          target: 'http://localhost:3001',
          ws: true,
        },
      },
    },
  };
});
