import { createRequire } from 'node:module'
import react from '@vitejs/plugin-react'
import { defineConfig, type PluginOption } from 'vite'

// MARVEL V1 PWA shell.
// NOTE (env deviation, 2026-10-13): package.json in this workspace does not
// yet list `tailwindcss` / `@tailwindcss/vite` / `vite-plugin-pwa` and the
// sandbox has no network to install them, and editing package.json is
// forbidden. This config therefore loads both plugins OPTIONALLY: when the
// packages are present the full PWA + tailwind pipeline runs; when absent the
// build still succeeds (plain CSS in src/index.css covers all tokens) and the
// manifest link in index.html keeps the app installable. Install the two deps
// later and this file needs no changes.

const require = createRequire(import.meta.url)

function optionalLoad(name: string): any | null {
  try {
    return require(name)
  } catch {
    return null
  }
}

const tailwindPkg = optionalLoad('@tailwindcss/vite')
const pwaPkg = optionalLoad('vite-plugin-pwa')

// Resolve "@import 'tailwindcss'" in src/index.css to a local no-op stub when
// the real package is absent, so the build never breaks. When installed, the
// bare specifier resolves normally and this alias is skipped.
const resolveAlias = tailwindPkg
  ? []
  : [{ find: /^tailwindcss$/, replacement: '/src/lib/tailwind-stub.css' }]

const plugins: PluginOption[] = [react()]

if (tailwindPkg) {
  const tailwind = tailwindPkg?.default ?? tailwindPkg
  try {
    plugins.push(tailwind())
  } catch {
    // fall through to plain CSS
  }
}

if (pwaPkg) {
  const VitePWA = pwaPkg?.VitePWA ?? pwaPkg?.default ?? pwaPkg
  if (typeof VitePWA === 'function') {
    plugins.push(
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icons.svg', 'manifest.webmanifest'],
        manifest: {
          name: 'MARVEL Inventory',
          short_name: 'MARVEL',
          description: 'MARVEL makerspace inventory — scan, issue, return.',
          display: 'standalone',
          start_url: '.',
          scope: '.',
          theme_color: '#B45309',
          background_color: '#ffffff',
          icons: [
            {
              src: 'icons.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          // Same-origin GET: fast revalidate; Supabase GET: network-first so
          // dues/loans stay fresh but survive WiFi drops; photos: cache-first.
          runtimeCaching: [
            {
              urlPattern: ({ sameOrigin, request }: any) =>
                sameOrigin && request.method === 'GET',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'same-origin-get' },
            },
            {
              urlPattern: ({ url, request }: any) =>
                request.method === 'GET' &&
                /supabase\.co/.test(url.hostname),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'supabase-api',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 200, maxAgeSeconds: 86_400 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: ({ request }: any) => request.destination === 'image',
              handler: 'CacheFirst',
              options: {
                cacheName: 'photo-cache',
                expiration: { maxEntries: 200, maxAgeSeconds: 30 * 86_400 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    )
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins,
  resolve: { alias: resolveAlias },
})
