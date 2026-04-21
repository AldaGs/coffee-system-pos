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
        display: "fullscreen",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable' // <-- THIS IS REQUIRED FOR THE INSTALL PROMPT
          },
          {
          "src": "icon-512.png",
          "sizes": "512x512",
          "type": "image/png",
          "purpose": "maskable"
          }
        ]
      }
    })
  ],
  server: {
    host: true // Allows network access
  }
})
