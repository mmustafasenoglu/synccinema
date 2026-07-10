import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    globals: true,
  },
  define: {
    global: 'globalThis'
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
});
