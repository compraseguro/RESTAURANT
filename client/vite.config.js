import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientPkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));

export default defineConfig(() => {
  return {
    define: {
      __APP_VERSION__: JSON.stringify(clientPkg.version),
    },
    plugins: [
      react(),
      {
        name: 'inject-sw-version',
        closeBundle() {
          const swPath = resolve(__dirname, 'dist/sw.js');
          try {
            const buildId = `${clientPkg.version}-${Date.now()}`;
            let s = readFileSync(swPath, 'utf8');
            s = s.replace(/__SW_VERSION__/g, buildId);
            writeFileSync(swPath, s);
          } catch (e) {
            console.warn('[inject-sw-version]', e.message);
          }
        },
      },
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': 'http://localhost:3001',
        '/uploads': 'http://localhost:3001',
        '/socket.io': {
          target: 'http://localhost:3001',
          ws: true,
        },
      },
    },
  };
});
