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
        theme_color: "#2c3e50",
        background_color: "#f4f6f8",
        icons: [
          {
            src: "icon-192.png",
            type: "image/png",
            sizes: "192x192"
          },
          {
            src: "icon-512.png",
            type: "image/png",
            sizes: "512x512"
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
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
