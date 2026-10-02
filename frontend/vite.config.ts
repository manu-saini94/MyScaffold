import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Dev: proxy API + OAuth to Spring Boot. Build: dist/ is later copied into Spring static resources.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: false },
      '/oauth2': { target: 'http://localhost:8080', changeOrigin: false },
      // Google redirects to /login/oauth2/code/google; Spring Security's logout lives at /logout
      '/login': { target: 'http://localhost:8080', changeOrigin: false },
      '/logout': { target: 'http://localhost:8080', changeOrigin: false },
    },
  },
  build: { outDir: 'dist', sourcemap: false, target: 'es2022' },
  test: {
    environment: 'node', // pure logic runs in node; DOM-touching files opt in with `// @vitest-environment jsdom`
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // logic only: rendering shells (tsx views, scss) are covered by the Playwright screenshot pass
      include: [
        'src/features/launcher/{hexLayout,fisheye,fieldEngine,countdown,mapExperience,useWorlds,worldsMock,HoneycombField}.{ts,tsx}',
        'src/features/session/**/*.{ts,tsx}',
        'src/features/unlock/**/*.{ts,tsx}',
        'src/features/profiles/**/*.{ts,tsx}',
        'src/features/theme/useDefaultTheme.ts',
        'src/services/{api,authApi,serverClock}.ts',
        'src/features/theme/themeSlice.ts',
        'src/components/Particles/particleMath.ts',
        'src/components/ThemeToggle/ThemeToggle.tsx',
      ],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 75 },
    },
  },
})
