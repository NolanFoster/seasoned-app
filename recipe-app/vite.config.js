import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const flagglyTarget = env.FLAGGLY_EVAL_URL?.replace(/\/$/, '')
  const flagglyJwt = env.FLAGGLY_USER_JWT
  const flagglyAppId = env.FLAGGLY_APP_ID || 'default'
  const flagglyEnvId = env.FLAGGLY_ENV_ID || 'production'

  const devFlagglyProxy =
    mode === 'development' && flagglyTarget && flagglyJwt
      ? {
          '/api/eval': {
            target: flagglyTarget,
            changeOrigin: true,
            secure: true,
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.setHeader('Authorization', `Bearer ${flagglyJwt}`)
                proxyReq.setHeader('x-app-id', flagglyAppId)
                proxyReq.setHeader('x-env-id', flagglyEnvId)
              })
            },
          },
        }
      : undefined

  return {
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Seasoned',
        short_name: 'Seasoned',
        description: 'Clip, Organize, Season Every Recipe to Your Taste',
        theme_color: '#0d1a0f',
        background_color: '#0d1a0f',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        globIgnores: ['mediapipe/**'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/(api\.example\.com|.*\.workers\.dev|.*\.cloudflare\.com)\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 3600
              },
              networkTimeoutSeconds: 5
            }
          },
          {
            urlPattern: /\.(jpg|jpeg|png|gif|webp|svg|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 2592000
              }
            }
          },
          {
            urlPattern: /\.(js|css|woff|woff2|ttf|eot)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-assets-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 604800
              }
            }
          }
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ],
  base: './',
  build: {
    outDir: 'dist'
  },
  server: devFlagglyProxy ? { proxy: devFlagglyProxy } : undefined,
  }
})
