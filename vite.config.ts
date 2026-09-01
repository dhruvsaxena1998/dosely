import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * A name for this particular copy of the app. Printed in Settings, because a
 * cached service worker means "I reloaded" and "I am running what I just
 * shipped" are different claims, and only one of them can be checked.
 */
function buildId() {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? headSha()
  return sha ? `${stamp} \u00b7 ${sha.slice(0, 7)}` : stamp
}

function headSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    // A tarball with no .git is still a perfectly good build.
    return undefined
  }
}

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        // Themes fetch their typefaces on first use, so precaching every one
        // would carry nine families to render the one you picked. Cache them
        // as they are actually used instead: the first switch needs the
        // network, every launch after that does not.
        runtimeCaching: [
          {
            urlPattern: /\.woff2$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dosely-fonts',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      manifest: {
        name: 'Dosely',
        short_name: 'Dosely',
        description: 'Daily medicine checklist',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
})
