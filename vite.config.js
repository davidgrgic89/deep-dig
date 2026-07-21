import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5184,
    strictPort: true,
    host: true, // listen on the LAN so a phone/tablet on the same Wi-Fi can connect
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
