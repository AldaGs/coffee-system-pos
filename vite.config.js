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
            src: 'icon-512.png',
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
