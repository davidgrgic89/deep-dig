import { defineConfig } from 'vite';

// Local dev serves from '/', production build is served from the GitHub Pages
// project subpath '/deep-dig/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/deep-dig/' : '/',
  server: {
    port: 5184,
    strictPort: true,
    host: true, // listen on the LAN so a phone/tablet on the same Wi-Fi can connect
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
}));
