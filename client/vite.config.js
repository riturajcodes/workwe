import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// HTTPS is required for camera/mic/screen-share on anything other than localhost.
// The API and websockets are proxied so the browser only talks to this one origin.
const proxy = { target: process.env.PROXY_TARGET || 'http://localhost:4000', changeOrigin: true, xfwd: true };
export default defineConfig({
  plugins: [react(), ...(process.env.NO_SSL ? [] : [basicSsl()])],
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': proxy, '/socket.io': { ...proxy, ws: true } },
  },
});
