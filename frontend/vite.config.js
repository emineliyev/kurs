import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Registered by hand (src/utils/pwa.js): no page reload when a new worker takes over —
      // a student in the middle of an exam is never interrupted
      injectRegister: false,
      registerType: 'autoUpdate',
      manifest: {
        id: '/app',
        name: 'Kursum — İmtahan Platforması',
        short_name: 'Kursum',
        description: 'Testlər, onlayn və kağız imtahanlar, nəticələr və analitika — müəllimlər və şagirdlər üçün.',
        lang: 'az',
        dir: 'ltr',
        start_url: '/app',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#1E3A8A',
        categories: ['education'],
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the icons are downloaded up front; pages and code are cached as they are used,
        // so a student's phone never downloads the teacher's editor
        globPatterns: ['*.{png,svg,ico}'],
        navigateFallback: null,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // The page itself always comes from the server (a deploy is picked up at once);
            // the saved copy is used only offline. Never: the API (exams, answers, scores are
            // always live), the Django admin and its static files. (Written inline: the function
            // is copied into sw.js as text, outside variables don't exist there.)
            urlPattern: ({ request, url }) => request.mode === 'navigate' && !/^\/(api|admin|static)(\/|$)/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'kursum-pages',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 20 },
            },
          },
          {
            // Built code, styles and fonts have a content hash in their name: safe to keep
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'kursum-assets',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'].includes(url.hostname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'kursum-cdn',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Question pictures and avatars
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/media/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'kursum-media',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      stream: path.resolve(__dirname, './src/mocks/stream.js'),
    },
  },
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
