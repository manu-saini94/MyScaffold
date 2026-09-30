import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev: proxy API + OAuth to Spring Boot. Build: dist/ is later copied into Spring static resources.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: false },
      '/oauth2': { target: 'http://localhost:8080', changeOrigin: false },
    },
  },
  build: { outDir: 'dist', sourcemap: false, target: 'es2022' },
})
