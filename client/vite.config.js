import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const printAgentTarget = String(env.VITE_PRINT_AGENT_TARGET || 'http://127.0.0.1:3001').replace(/\/$/, '');

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': 'http://localhost:3001',
        '/uploads': 'http://localhost:3001',
        /** Misma origen que Vite: evita «Failed to fetch» al llamar al print-agent en HTTP desde el front. */
        '/print-agent': {
          target: printAgentTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/print-agent/, '') || '/',
        },
        '/socket.io': {
          target: 'http://localhost:3001',
          ws: true,
        },
      },
    },
  };
});
