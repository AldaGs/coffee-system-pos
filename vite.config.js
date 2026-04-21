import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifestFilename: 'manifest.webmanifest', // <-- ADD THIS LINE,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
      manifest: {
        short_name: "tinypos",
        name: "tinypos",
        start_url: "/",
        display: "standalone",
        theme_color: "#f28b05",
        background_color: "#f4f6f8",
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable' // <-- THIS IS REQUIRED FOR THE INSTALL PROMPT
          }
        ]
      }
    })
  ],
  server: {
    host: true // Allows network access
  }
})
