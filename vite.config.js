import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      manifestFilename: 'manifest.webmanifest',
      workbox: {
        clientsClaim: true, // Takes control of the client immediately
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Serve the SPA shell for in-app navigations...
        navigateFallback: 'index.html',
        // ...but NEVER for server routes. Without this denylist the SW
        // hijacks the OAuth redirect to /api/auth/callback (and every other
        // serverless endpoint), returns index.html, and React Router 404s
        // with "No routes matched location /api/...". That silently breaks
        // the Update Schema flow (token exchange never runs). Let /api/* and
        // the SW asset itself fall through to the network.
        navigateFallbackDenylist: [/^\/api\//, /^\/sw\.js$/],
      },
      manifest: {
        short_name: "tinypos",
        name: "tinypos - Professional Coffee System",
        description: "Un punto de venta rápido y confiable para negocios modernos",
        start_url: "/",
        display: "fullscreen",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512-maskable.png', // <-- Point this to the specific maskable version
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        screenshots: [
          {
            src: "screenshot-desktop.png",
            sizes: "1024x1024",
            type: "image/png",
            form_factor: "wide",
            label: "tinypos Desktop"
          },
          {
            src: "screenshot-mobile.png",
            sizes: "1024x1024",
            type: "image/png",
            form_factor: "narrow",
            label: "tinypos Mobile"
          }
        ]
      }
    })
  ],
  server: {
    host: true // Allows network access
  }
})
